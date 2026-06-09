-- Romanica Layer 8 seed — immutable project audit events.
CREATE TABLE IF NOT EXISTS audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_type   text NOT NULL DEFAULT 'api_key',
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_project_created_idx
  ON audit_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_project_action_idx
  ON audit_events (project_id, action, created_at DESC);
