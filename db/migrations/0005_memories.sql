-- Romanica Layer 3 seed — project-scoped agent memory records.
CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope       text NOT NULL DEFAULT 'project',
  kind        text NOT NULL,
  key         text NOT NULL,
  content     jsonb NOT NULL,
  source_type text,
  source_id   text,
  confidence  numeric(5,4),
  expires_at  timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope, kind, key)
);

CREATE INDEX IF NOT EXISTS memories_project_updated_idx
  ON memories (project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_project_kind_idx
  ON memories (project_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_project_source_idx
  ON memories (project_id, source_type, source_id);
