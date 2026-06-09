import type {
  AutoscalingDecisionSummary,
  Page,
  UpsertWorkerPool,
  WorkerPoolSummary,
} from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));

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

export async function upsertWorkerPool(
  projectId: string,
  pool: UpsertWorkerPool,
): Promise<WorkerPoolSummary> {
  const rows = (await sql`
    INSERT INTO worker_pools (
      project_id, name, status, desired_workers, active_workers,
      queued_tasks, running_tasks, max_concurrency, metadata
    ) VALUES (
      ${projectId},
      ${pool.name},
      ${pool.status},
      ${pool.desiredWorkers},
      ${pool.activeWorkers},
      ${pool.queuedTasks},
      ${pool.runningTasks},
      ${pool.maxConcurrency},
      ${pool.metadata}
    )
    ON CONFLICT (project_id, name) DO UPDATE SET
      status = EXCLUDED.status,
      desired_workers = EXCLUDED.desired_workers,
      active_workers = EXCLUDED.active_workers,
      queued_tasks = EXCLUDED.queued_tasks,
      running_tasks = EXCLUDED.running_tasks,
      max_concurrency = EXCLUDED.max_concurrency,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id, project_id, name, status, desired_workers, active_workers,
      queued_tasks, running_tasks, max_concurrency, metadata, created_at, updated_at
  `) as any[];
  return toSummary(rows[0]!);
}

export async function listWorkerPools(
  projectId: string,
  params: { status?: string; limit: number },
): Promise<Page<WorkerPoolSummary>> {
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT id, project_id, name, status, desired_workers, active_workers,
      queued_tasks, running_tasks, max_concurrency, metadata, created_at, updated_at
    FROM worker_pools
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

export async function applyAutoscalingDecision(
  projectId: string,
  poolId: string,
): Promise<AutoscalingDecisionSummary | null> {
  const pool = await getWorkerPool(projectId, poolId);
  if (!pool) return null;

  const reason =
    pool.scaleAction === "scale_up"
      ? "queued or running tasks exceed desired capacity"
      : pool.scaleAction === "scale_down"
        ? "desired capacity is above observed demand"
        : "desired capacity matches observed demand";

  const rows = (await sql`
    WITH decision AS (
      INSERT INTO autoscaling_decisions (
        project_id, pool_id, previous_desired_workers, recommended_workers,
        applied_workers, action, reason, metrics, applied_at
      ) VALUES (
        ${projectId},
        ${pool.id},
        ${pool.desiredWorkers},
        ${pool.recommendedWorkers},
        ${pool.recommendedWorkers},
        ${pool.scaleAction},
        ${reason},
        ${{
          activeWorkers: pool.activeWorkers,
          queuedTasks: pool.queuedTasks,
          runningTasks: pool.runningTasks,
          maxConcurrency: pool.maxConcurrency,
          utilization: pool.utilization,
          pressure: pool.pressure,
        }},
        now()
      )
      RETURNING *
    ),
    updated AS (
      UPDATE worker_pools
      SET desired_workers = (SELECT recommended_workers FROM decision),
        updated_at = now()
      WHERE project_id = ${projectId} AND id = ${pool.id}
    )
    SELECT d.*, p.name AS pool_name
    FROM decision d
    JOIN worker_pools p ON p.id = d.pool_id
  `) as any[];
  return rows[0] ? toDecision(rows[0]) : null;
}

export async function listAutoscalingDecisions(
  projectId: string,
  params: { limit: number },
): Promise<Page<AutoscalingDecisionSummary>> {
  const rows = (await sql`
    SELECT d.*, p.name AS pool_name
    FROM autoscaling_decisions d
    JOIN worker_pools p ON p.id = d.pool_id
    WHERE d.project_id = ${projectId}
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT ${params.limit + 1}
  `) as any[];
  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toDecision),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

async function getWorkerPool(projectId: string, id: string): Promise<WorkerPoolSummary | null> {
  const rows = (await sql`
    SELECT id, project_id, name, status, desired_workers, active_workers,
      queued_tasks, running_tasks, max_concurrency, metadata, created_at, updated_at
    FROM worker_pools
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toSummary(rows[0]) : null;
}

function toSummary(r: any): WorkerPoolSummary {
  const activeWorkers = num(r.active_workers);
  const maxConcurrency = Math.max(1, num(r.max_concurrency));
  const capacity = Math.max(1, activeWorkers * maxConcurrency);
  const runningTasks = num(r.running_tasks);
  const queuedTasks = num(r.queued_tasks);
  const utilization = runningTasks / capacity;
  const pressure: WorkerPoolSummary["pressure"] =
    queuedTasks > 0 || utilization >= 0.9
      ? "saturated"
      : utilization <= 0.1
        ? "idle"
        : "healthy";
  const desiredWorkers = num(r.desired_workers);
  const requiredCapacity = runningTasks + queuedTasks;
  const recommendedWorkers = Math.max(
    pressure === "idle" ? 0 : 1,
    Math.ceil(requiredCapacity / maxConcurrency),
  );
  const scaleAction: WorkerPoolSummary["scaleAction"] =
    recommendedWorkers > desiredWorkers
      ? "scale_up"
      : recommendedWorkers < desiredWorkers
        ? "scale_down"
        : "hold";
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    status: r.status,
    desiredWorkers,
    activeWorkers,
    queuedTasks,
    runningTasks,
    maxConcurrency,
    utilization,
    pressure,
    recommendedWorkers,
    scaleAction,
    metadata: asObject(r.metadata, {}),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toDecision(r: any): AutoscalingDecisionSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    poolId: r.pool_id,
    poolName: r.pool_name,
    previousDesiredWorkers: num(r.previous_desired_workers),
    recommendedWorkers: num(r.recommended_workers),
    appliedWorkers: r.applied_workers == null ? null : num(r.applied_workers),
    action: r.action,
    reason: r.reason,
    metrics: asObject(r.metrics, {}),
    appliedAt: r.applied_at == null ? null : iso(r.applied_at),
    createdAt: iso(r.created_at),
  };
}
