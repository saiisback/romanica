import { sql } from "./db.ts";

export interface Project {
  id: string;
  name: string;
  scopes: string[];
}

// process-lifetime cache: api key -> project (keys are long-lived)
const cache = new Map<string, Project>();

/** Resolve a Bearer API key to a project, or null if unknown. */
export async function resolveProject(apiKey: string | undefined): Promise<Project | null> {
  if (!apiKey) return null;
  const cached = cache.get(apiKey);
  if (cached) return cached;

  const rows = (await sql`
    SELECT id, name, api_scopes FROM projects WHERE api_key = ${apiKey} LIMIT 1
  `) as Array<{ id: string; name: string; api_scopes: string[] | string | null }>;

  const row = rows[0];
  if (!row) return null;

  const scopes =
    Array.isArray(row.api_scopes)
      ? row.api_scopes
      : typeof row.api_scopes === "string"
        ? row.api_scopes.replace(/[{}]/g, "").split(",").filter(Boolean)
        : ["*"];
  const project: Project = { id: row.id, name: row.name, scopes };
  cache.set(apiKey, project);
  return project;
}

/** Extract the Bearer token from an Authorization header. */
export function bearer(header: string | undefined | null): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1];
}

export function hasScope(project: Project, required: string): boolean {
  return project.scopes.includes("*") || project.scopes.includes(required);
}
