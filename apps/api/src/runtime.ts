import type {
  AgentDefinitionSummary,
  AgentRunSummary,
  CreateAgentDefinition,
  CreateAgentRun,
  Page,
  UpdateAgentRun,
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
      return v as T;
    }
  }
  return v as T;
}

export async function upsertAgentDefinition(
  projectId: string,
  agent: CreateAgentDefinition,
): Promise<AgentDefinitionSummary> {
  const rows = (await sql`
    INSERT INTO agent_definitions (project_id, name, version, runtime, entrypoint, config)
    VALUES (
      ${projectId},
      ${agent.name},
      ${agent.version},
      ${agent.runtime},
      ${agent.entrypoint},
      ${agent.config}
    )
    ON CONFLICT (project_id, name, version) DO UPDATE SET
      runtime = EXCLUDED.runtime,
      entrypoint = EXCLUDED.entrypoint,
      config = EXCLUDED.config,
      updated_at = now()
    RETURNING id, project_id, name, version, runtime, entrypoint, config, created_at, updated_at
  `) as any[];
  return toAgent(rows[0]!);
}

export async function listAgentDefinitions(
  projectId: string,
  params: { limit: number },
): Promise<Page<AgentDefinitionSummary>> {
  const rows = (await sql`
    SELECT id, project_id, name, version, runtime, entrypoint, config, created_at, updated_at
    FROM agent_definitions
    WHERE project_id = ${projectId}
    ORDER BY updated_at DESC, id DESC
    LIMIT ${params.limit + 1}
  `) as any[];
  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toAgent),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

export async function createAgentRun(
  projectId: string,
  run: CreateAgentRun,
): Promise<AgentRunSummary | null> {
  const rows = (await sql`
    INSERT INTO agent_runs (project_id, agent_id, input, trace_id)
    SELECT ${projectId}, id, ${run.input}, ${run.traceId ?? null}
    FROM agent_definitions
    WHERE project_id = ${projectId} AND id = ${run.agentId}
    RETURNING id
  `) as any[];
  if (!rows[0]) return null;
  return getAgentRun(projectId, rows[0].id);
}

export async function updateAgentRun(
  projectId: string,
  id: string,
  update: UpdateAgentRun,
): Promise<AgentRunSummary | null> {
  const started = update.status === "running" ? sql`now()` : sql`started_at`;
  const finished =
    update.status === "succeeded" || update.status === "failed" || update.status === "cancelled"
      ? sql`now()`
      : sql`finished_at`;
  const rows = (await sql`
    UPDATE agent_runs
    SET status = ${update.status},
      trace_id = COALESCE(${update.traceId ?? null}, trace_id),
      error = ${update.error ?? null},
      started_at = ${started},
      finished_at = ${finished}
    WHERE project_id = ${projectId} AND id = ${id}
    RETURNING id
  `) as any[];
  if (!rows[0]) return null;
  return getAgentRun(projectId, rows[0].id);
}

export async function listAgentRuns(
  projectId: string,
  params: { status?: string; limit: number },
): Promise<Page<AgentRunSummary>> {
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT r.id, r.project_id, r.agent_id, a.name AS agent_name, a.version AS agent_version,
      r.status, r.input, r.trace_id, r.error, r.queued_at, r.started_at, r.finished_at
    FROM agent_runs r
    JOIN agent_definitions a ON a.id = r.agent_id
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

async function getAgentRun(projectId: string, id: string): Promise<AgentRunSummary | null> {
  const rows = (await sql`
    SELECT r.id, r.project_id, r.agent_id, a.name AS agent_name, a.version AS agent_version,
      r.status, r.input, r.trace_id, r.error, r.queued_at, r.started_at, r.finished_at
    FROM agent_runs r
    JOIN agent_definitions a ON a.id = r.agent_id
    WHERE r.project_id = ${projectId} AND r.id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toRun(rows[0]) : null;
}

function toAgent(r: any): AgentDefinitionSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    version: r.version,
    runtime: r.runtime,
    entrypoint: r.entrypoint,
    config: asObject(r.config, {}),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toRun(r: any): AgentRunSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    agentName: r.agent_name,
    agentVersion: r.agent_version,
    status: r.status,
    input: asObject(r.input, {}),
    traceId: r.trace_id ?? null,
    error: asObject(r.error, null),
    queuedAt: iso(r.queued_at),
    startedAt: isoOrNull(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
  };
}
