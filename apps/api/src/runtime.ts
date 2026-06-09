import type {
  AgentDefinitionSummary,
  AgentRunSummary,
  CreateAgentDefinition,
  CreateAgentRun,
  ExecuteAgentRun,
  Page,
  RuntimeAttemptSummary,
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

export async function executeAgentRun(
  projectId: string,
  id: string,
  params: ExecuteAgentRun,
): Promise<{ run: AgentRunSummary; attempt: RuntimeAttemptSummary } | null> {
  const run = await getAgentRun(projectId, id);
  if (!run) return null;
  const agent = await getAgentDefinition(projectId, run.agentId);
  if (!agent) return null;

  await updateAgentRun(projectId, id, { status: "running" });
  const attemptNo = await nextAttemptNumber(id);
  const attempt = await createRuntimeAttempt(projectId, id, attemptNo, agent.runtime, {
    entrypoint: agent.entrypoint,
    input: run.input,
  });

  try {
    if (agent.runtime !== "http") {
      throw new Error(`unsupported runtime: ${agent.runtime}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
    const res = await fetch(agent.entrypoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: run.input, runId: id, agentId: run.agentId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    const response = parseMaybeJson(text);
    if (!res.ok) {
      throw new Error(`agent endpoint returned ${res.status}`);
    }
    const done = await finishRuntimeAttempt(projectId, attempt.id, "succeeded", response, null);
    const updated = await updateAgentRun(projectId, id, { status: "succeeded" });
    return { run: updated!, attempt: done! };
  } catch (err) {
    const error = { message: err instanceof Error ? err.message : String(err) };
    const done = await finishRuntimeAttempt(projectId, attempt.id, "failed", null, error);
    const updated = await updateAgentRun(projectId, id, { status: "failed", error });
    return { run: updated!, attempt: done! };
  }
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

async function getAgentDefinition(projectId: string, id: string): Promise<AgentDefinitionSummary | null> {
  const rows = (await sql`
    SELECT id, project_id, name, version, runtime, entrypoint, config, created_at, updated_at
    FROM agent_definitions
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toAgent(rows[0]) : null;
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

async function nextAttemptNumber(runId: string): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt
    FROM runtime_attempts
    WHERE run_id = ${runId}
  `) as Array<{ attempt: number | string }>;
  return Number(rows[0]?.attempt ?? 1);
}

async function createRuntimeAttempt(
  projectId: string,
  runId: string,
  attempt: number,
  executor: string,
  request: unknown,
): Promise<RuntimeAttemptSummary> {
  const rows = (await sql`
    INSERT INTO runtime_attempts (project_id, run_id, attempt, executor, request)
    VALUES (${projectId}, ${runId}, ${attempt}, ${executor}, ${request})
    RETURNING id, project_id, run_id, attempt, executor, status, request, response,
      error, started_at, finished_at
  `) as any[];
  return toAttempt(rows[0]!);
}

async function finishRuntimeAttempt(
  projectId: string,
  id: string,
  status: RuntimeAttemptSummary["status"],
  response: unknown,
  error: RuntimeAttemptSummary["error"],
): Promise<RuntimeAttemptSummary | null> {
  const rows = (await sql`
    UPDATE runtime_attempts
    SET status = ${status}, response = ${response}, error = ${error}, finished_at = now()
    WHERE project_id = ${projectId} AND id = ${id}
    RETURNING id, project_id, run_id, attempt, executor, status, request, response,
      error, started_at, finished_at
  `) as any[];
  return rows[0] ? toAttempt(rows[0]) : null;
}

function parseMaybeJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
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

function toAttempt(r: any): RuntimeAttemptSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    runId: r.run_id,
    attempt: Number(r.attempt),
    executor: r.executor,
    status: r.status,
    request: asObject(r.request, {}),
    response: asObject(r.response, null),
    error: asObject(r.error, null),
    startedAt: iso(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
  };
}
