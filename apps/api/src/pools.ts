import type { Page, UpsertWorkerPool, WorkerPoolSummary } from "@romanica/shared";
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
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    status: r.status,
    desiredWorkers: num(r.desired_workers),
    activeWorkers,
    queuedTasks,
    runningTasks,
    maxConcurrency,
    utilization,
    pressure,
    metadata: asObject(r.metadata, {}),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
