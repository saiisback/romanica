import type {
  CreateWorkflow,
  CreateWorkflowRun,
  Page,
  UpdateWorkflowRun,
  WorkflowDetail,
  WorkflowRunSummary,
  WorkflowSummary,
} from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

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

export async function createWorkflowRun(
  projectId: string,
  run: CreateWorkflowRun,
): Promise<WorkflowRunSummary | null> {
  const rows = (await sql`
    INSERT INTO workflow_runs (project_id, workflow_id, input, trace_id)
    SELECT ${projectId}, id, ${run.input}, ${run.traceId ?? null}
    FROM workflows
    WHERE project_id = ${projectId} AND id = ${run.workflowId}
    RETURNING id
  `) as any[];
  if (!rows[0]) return null;
  return getWorkflowRun(projectId, rows[0].id);
}

export async function compileWorkflow(projectId: string, workflowId: string): Promise<unknown | null> {
  const workflow = await getWorkflow(projectId, workflowId);
  if (!workflow) return null;
  return compileWorkflowDefinition(workflow.definition);
}

export async function dispatchWorkflowRun(
  projectId: string,
  id: string,
): Promise<WorkflowRunSummary | null> {
  const run = await getWorkflowRun(projectId, id);
  if (!run) return null;
  const plan = await compileWorkflow(projectId, run.workflowId);
  if (!plan) return null;
  return updateWorkflowRun(projectId, id, { status: "running", plan });
}

export async function completeWorkflowRun(
  projectId: string,
  id: string,
): Promise<WorkflowRunSummary | null> {
  const run = await getWorkflowRun(projectId, id);
  if (!run) return null;
  return updateWorkflowRun(projectId, id, { status: "succeeded", plan: run.plan });
}

export async function updateWorkflowRun(
  projectId: string,
  id: string,
  update: UpdateWorkflowRun,
): Promise<WorkflowRunSummary | null> {
  const started = update.status === "running" ? sql`now()` : sql`started_at`;
  const finished =
    update.status === "succeeded" || update.status === "failed" || update.status === "cancelled"
      ? sql`now()`
      : sql`finished_at`;
  const rows = (await sql`
    UPDATE workflow_runs
    SET status = ${update.status},
      trace_id = COALESCE(${update.traceId ?? null}, trace_id),
      plan = COALESCE(${update.plan ?? null}, plan),
      error = ${update.error ?? null},
      started_at = ${started},
      finished_at = ${finished}
    WHERE project_id = ${projectId} AND id = ${id}
    RETURNING id
  `) as any[];
  if (!rows[0]) return null;
  return getWorkflowRun(projectId, rows[0].id);
}

async function compileWorkflowDefinition(definition: unknown): Promise<unknown> {
  const proc = Bun.spawn(["cargo", "run", "-q", "-p", "romanica-agent-compiler"], {
    cwd: process.cwd(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(definition));
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || "workflow compilation failed");
  }
  return JSON.parse(stdout);
}

export async function listWorkflowRuns(
  projectId: string,
  params: { status?: string; limit: number },
): Promise<Page<WorkflowRunSummary>> {
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT r.id, r.project_id, r.workflow_id, w.name AS workflow_name, w.version AS workflow_version,
      r.status, r.input, r.plan, r.trace_id, r.error, r.queued_at, r.started_at, r.finished_at
    FROM workflow_runs r
    JOIN workflows w ON w.id = r.workflow_id
    WHERE r.project_id = ${projectId}
      AND (${status}::text IS NULL OR r.status = ${status})
    ORDER BY r.queued_at DESC, r.id DESC
    LIMIT ${params.limit + 1}
  `) as any[];
  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toRun),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
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

async function getWorkflowRun(projectId: string, id: string): Promise<WorkflowRunSummary | null> {
  const rows = (await sql`
    SELECT r.id, r.project_id, r.workflow_id, w.name AS workflow_name, w.version AS workflow_version,
      r.status, r.input, r.plan, r.trace_id, r.error, r.queued_at, r.started_at, r.finished_at
    FROM workflow_runs r
    JOIN workflows w ON w.id = r.workflow_id
    WHERE r.project_id = ${projectId} AND r.id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toRun(rows[0]) : null;
}

function toRun(r: any): WorkflowRunSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    workflowId: r.workflow_id,
    workflowName: r.workflow_name,
    workflowVersion: r.workflow_version,
    status: r.status,
    input: asObject(r.input, {}),
    plan: asObject(r.plan, null),
    traceId: r.trace_id ?? null,
    error: asObject(r.error, null),
    queuedAt: iso(r.queued_at),
    startedAt: isoOrNull(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
  };
}
