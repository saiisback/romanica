-- Romanica Layer 7 seed — project-scoped agent communication messages.
CREATE TABLE IF NOT EXISTS agent_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel     text NOT NULL,
  sender      text NOT NULL,
  recipient   text,
  trace_id    uuid REFERENCES traces(trace_id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'pending',
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  acked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS agent_messages_project_created_idx
  ON agent_messages (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_project_channel_idx
  ON agent_messages (project_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_project_status_idx
  ON agent_messages (project_id, status, created_at DESC);
