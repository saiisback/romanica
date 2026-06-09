-- Romanica Layer 1 seed — agent definitions and runtime run requests.
CREATE TABLE IF NOT EXISTS agent_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  version     text NOT NULL DEFAULT 'v1',
  runtime     text NOT NULL DEFAULT 'external',
  entrypoint  text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name, version)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued',
  input       jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id    uuid REFERENCES traces(trace_id) ON DELETE SET NULL,
  error       jsonb,
  queued_at   timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_definitions_project_updated_idx
  ON agent_definitions (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_project_queued_idx
  ON agent_runs (project_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_project_status_idx
  ON agent_runs (project_id, status, queued_at DESC);
