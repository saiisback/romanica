-- Romanica Layer 4 — initial schema: projects, traces, spans.
-- gen_random_uuid() is core in Postgres 13+; pgcrypto kept for safety.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A tenant / app. The API key resolves an incoming batch to one project.
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  api_key     text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One full agent run / invocation.
CREATE TABLE IF NOT EXISTS traces (
  trace_id        uuid PRIMARY KEY,                 -- client-generated
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'running',  -- ok | error | running
  start_time      timestamptz NOT NULL,
  end_time        timestamptz,
  duration_ms     integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- rolled up from spans on ingest
  total_tokens    bigint NOT NULL DEFAULT 0,
  total_cost_usd  numeric(14,6) NOT NULL DEFAULT 0,
  span_count      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS traces_project_start_idx
  ON traces (project_id, start_time DESC);
CREATE INDEX IF NOT EXISTS traces_project_status_idx
  ON traces (project_id, status);

-- One step within a run. Spans nest into a tree via parent_span_id.
CREATE TABLE IF NOT EXISTS spans (
  span_id         uuid PRIMARY KEY,                 -- client-generated
  trace_id        uuid NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_span_id  uuid,                             -- null = root span
  type            text NOT NULL,                    -- llm | tool | retrieval | agent | custom
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'ok',       -- ok | error
  start_time      timestamptz NOT NULL,
  end_time        timestamptz,
  duration_ms     integer,
  -- small payloads inline; large ones offloaded to object store and referenced
  input           jsonb,
  output          jsonb,
  input_ref       text,
  output_ref      text,
  error           jsonb,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spans_trace_idx        ON spans (trace_id);
CREATE INDEX IF NOT EXISTS spans_project_type_idx ON spans (project_id, type);
CREATE INDEX IF NOT EXISTS spans_project_start_idx ON spans (project_id, start_time DESC);

-- Dev seed: a default project with a known API key so the SDK works out of the box.
INSERT INTO projects (name, api_key)
VALUES ('dev', 'rom_dev_key')
ON CONFLICT (api_key) DO NOTHING;
