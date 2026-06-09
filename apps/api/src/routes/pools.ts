import { upsertWorkerPoolSchema } from "@romanica/shared";
import { Hono } from "hono";
import { recordAuditEvent } from "../audit.ts";
import {
  applyAutoscalingDecision,
  listAutoscalingDecisions,
  listWorkerPools,
  upsertWorkerPool,
} from "../pools.ts";
import type { Env } from "../http.ts";

export const poolRoutes = new Hono<Env>();

// POST /v1/pools — create/update a worker pool capacity snapshot.
poolRoutes.post("/v1/pools", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = upsertWorkerPoolSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const pool = await upsertWorkerPool(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "pool.upsert",
    targetType: "worker_pool",
    targetId: pool.id,
    metadata: {
      name: pool.name,
      status: pool.status,
      desiredWorkers: pool.desiredWorkers,
      activeWorkers: pool.activeWorkers,
      queuedTasks: pool.queuedTasks,
      pressure: pool.pressure,
    },
  });

  return c.json(pool, 201);
});

// GET /v1/pools — list worker pool capacity snapshots.
poolRoutes.get("/v1/pools", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listWorkerPools(project.id, {
      status: c.req.query("status"),
      limit,
    }),
  );
});

// POST /v1/pools/:id/autoscale — apply the current scaling recommendation.
poolRoutes.post("/v1/pools/:id/autoscale", async (c) => {
  const project = c.get("project");
  const decision = await applyAutoscalingDecision(project.id, c.req.param("id"));
  if (!decision) return c.json({ error: "not_found" }, 404);
  await recordAuditEvent({
    projectId: project.id,
    action: "autoscaling.apply",
    targetType: "worker_pool",
    targetId: decision.poolId,
    metadata: {
      poolName: decision.poolName,
      previousDesiredWorkers: decision.previousDesiredWorkers,
      appliedWorkers: decision.appliedWorkers,
      action: decision.action,
    },
  });
  return c.json(decision);
});

// GET /v1/autoscaling/decisions — list applied autoscaler decisions.
poolRoutes.get("/v1/autoscaling/decisions", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(await listAutoscalingDecisions(project.id, { limit }));
});
