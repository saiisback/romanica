import type {
  CreateWorkflow,
  Page,
  WorkflowDetail,
  WorkflowSummary,
} from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function asObject<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export async function createWorkflow(
  projectId: string,
  workflow: CreateWorkflow,
): Promise<WorkflowDetail> {
  const rows = (await sql`
    INSERT INTO workflows (project_id, name, version, status, definition, metadata)
    VALUES (
      ${projectId},
      ${workflow.name},
      ${workflow.version},
      ${workflow.status},
      ${workflow.definition},
      ${workflow.metadata}
    )
    ON CONFLICT (project_id, name, version) DO UPDATE SET
      status = EXCLUDED.status,
      definition = EXCLUDED.definition,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id, project_id, name, version, status, definition, metadata, created_at, updated_at
  `) as any[];
  return toDetail(rows[0]!);
}

export async function listWorkflows(
  projectId: string,
  params: { status?: string; limit: number },
): Promise<Page<WorkflowSummary>> {
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT id, project_id, name, version, status, definition, metadata, created_at, updated_at
    FROM workflows
    WHERE project_id = ${projectId}
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY updated_at DESC, id DESC
    LIMIT ${params.limit + 1}
  `) as any[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

export async function getWorkflow(
  projectId: string,
  id: string,
): Promise<WorkflowDetail | null> {
  const rows = (await sql`
    SELECT id, project_id, name, version, status, definition, metadata, created_at, updated_at
    FROM workflows
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toDetail(rows[0]) : null;
}

function toSummary(r: any): WorkflowSummary {
  const definition = asObject<Record<string, unknown>>(r.definition, {});
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    version: r.version,
    status: r.status,
    nodeCount: Array.isArray(definition.nodes) ? definition.nodes.length : 0,
    edgeCount: Array.isArray(definition.edges) ? definition.edges.length : 0,
    metadata: asObject(r.metadata, {}),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toDetail(r: any): WorkflowDetail {
  return {
    ...toSummary(r),
    definition: asObject(r.definition, {}),
  };
}
