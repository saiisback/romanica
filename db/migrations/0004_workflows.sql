-- Romanica Layer 2 seed — workflow definitions as control-plane objects.
CREATE TABLE IF NOT EXISTS workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  version     text NOT NULL DEFAULT 'v1',
  status      text NOT NULL DEFAULT 'draft',
  definition  jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name, version)
);

CREATE INDEX IF NOT EXISTS workflows_project_created_idx
  ON workflows (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflows_project_status_idx
  ON workflows (project_id, status, created_at DESC);
