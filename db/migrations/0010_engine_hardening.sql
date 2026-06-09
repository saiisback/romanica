-- Romanica hardening: scoped API keys, runtime attempts, and autoscaling decisions.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS api_scopes text[] NOT NULL DEFAULT ARRAY['*']::text[];

CREATE TABLE IF NOT EXISTS runtime_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  executor text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  error jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (run_id, attempt)
);

CREATE INDEX IF NOT EXISTS runtime_attempts_project_started_idx
  ON runtime_attempts (project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS autoscaling_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES worker_pools(id) ON DELETE CASCADE,
  previous_desired_workers integer NOT NULL,
  recommended_workers integer NOT NULL,
  applied_workers integer,
  action text NOT NULL,
  reason text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autoscaling_decisions_project_created_idx
  ON autoscaling_decisions (project_id, created_at DESC);
