import { sql } from "./db.ts";

export interface Project {
  id: string;
  name: string;
}

// process-lifetime cache: api key -> project (keys are long-lived)
const cache = new Map<string, Project>();

/** Resolve a Bearer API key to a project, or null if unknown. */
export async function resolveProject(apiKey: string | undefined): Promise<Project | null> {
  if (!apiKey) return null;
  const cached = cache.get(apiKey);
  if (cached) return cached;

  const rows = (await sql`
    SELECT id, name FROM projects WHERE api_key = ${apiKey} LIMIT 1
  `) as Array<{ id: string; name: string }>;

  const row = rows[0];
  if (!row) return null;

  const project: Project = { id: row.id, name: row.name };
  cache.set(apiKey, project);
  return project;
}

/** Extract the Bearer token from an Authorization header. */
export function bearer(header: string | undefined | null): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1];
}
