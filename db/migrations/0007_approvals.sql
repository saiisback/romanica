-- Romanica Layer 10 seed — human approval checkpoints.
CREATE TABLE IF NOT EXISTS approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  requester   text NOT NULL,
  assignee    text,
  target_type text,
  target_id   text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision    jsonb,
  due_at      timestamptz,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approvals_project_created_idx
  ON approvals (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_project_status_idx
  ON approvals (project_id, status, created_at DESC);
