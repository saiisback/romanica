-- Romanica Layer 2 execution seed — workflow run lifecycle records.
CREATE TABLE IF NOT EXISTS workflow_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id  uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'queued',
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan         jsonb,
  trace_id     uuid REFERENCES traces(trace_id) ON DELETE SET NULL,
  error        jsonb,
  queued_at    timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_runs_project_queued_idx
  ON workflow_runs (project_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_project_status_idx
  ON workflow_runs (project_id, status, queued_at DESC);
