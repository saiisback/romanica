-- Romanica Layer 6 seed — worker pool capacity snapshots.
CREATE TABLE IF NOT EXISTS worker_pools (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           text NOT NULL,
  status         text NOT NULL DEFAULT 'active',
  desired_workers integer NOT NULL DEFAULT 1,
  active_workers  integer NOT NULL DEFAULT 0,
  queued_tasks     integer NOT NULL DEFAULT 0,
  running_tasks    integer NOT NULL DEFAULT 0,
  max_concurrency  integer NOT NULL DEFAULT 1,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS worker_pools_project_updated_idx
  ON worker_pools (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS worker_pools_project_status_idx
  ON worker_pools (project_id, status, updated_at DESC);
