import { evaluatePolicySchema, selectModelSchema } from "@romanica/shared";
import { Hono } from "hono";
import { listAuditEvents, recordAuditEvent } from "../audit.ts";
import {
  costAnalytics,
  evaluationAnalytics,
  getTraceDetail,
  latencyAnalytics,
  listTraces,
  modelRoutingAnalytics,
  selectModelForRequest,
} from "../queries.ts";
import type { Env } from "../http.ts";
import { evaluatePolicy } from "../policies.ts";

export const queryRoutes = new Hono<Env>();

const DAY_MS = 86_400_000;

/** Accept ISO-8601 or epoch-ms; fall back when absent/invalid. */
function parseDate(v: string | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const asNum = Number(v);
  const d = v.trim() !== "" && Number.isFinite(asNum) ? new Date(asNum) : new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function range(c: { req: { query: (k: string) => string | undefined } }) {
  const to = parseDate(c.req.query("to"), new Date());
  const from = parseDate(c.req.query("from"), new Date(Date.now() - 7 * DAY_MS));
  return { from, to };
}

// GET /v1/traces — paginated trace list
queryRoutes.get("/v1/traces", async (c) => {
  const project = c.get("project");
  const { from, to } = range(c);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));

  const page = await listTraces(project.id, {
    status: c.req.query("status"),
    from,
    to,
    limit,
    cursor: c.req.query("cursor"),
  });
  return c.json(page);
});

// GET /v1/traces/:id — full trace with span tree
queryRoutes.get("/v1/traces/:id", async (c) => {
  const project = c.get("project");
  const detail = await getTraceDetail(project.id, c.req.param("id"));
  if (!detail) return c.json({ error: "not_found" }, 404);
  return c.json(detail);
});

// GET /v1/analytics/cost — token/cost over time + by model
queryRoutes.get("/v1/analytics/cost", async (c) => {
  const project = c.get("project");
  const { from, to } = range(c);
  const bucket = c.req.query("bucket") === "hour" ? "hour" : "day";
  return c.json(await costAnalytics(project.id, { from, to, bucket }));
});

// GET /v1/analytics/latency — trace + per-type latency percentiles
queryRoutes.get("/v1/analytics/latency", async (c) => {
  const project = c.get("project");
  const { from, to } = range(c);
  return c.json(await latencyAnalytics(project.id, { from, to }));
});

// GET /v1/routing/models — observed model candidates for Layer 5 routing policies
queryRoutes.get("/v1/routing/models", async (c) => {
  const project = c.get("project");
  const { from, to } = range(c);
  return c.json(await modelRoutingAnalytics(project.id, { from, to }));
});

// POST /v1/routing/select — choose a model for an outbound call.
queryRoutes.post("/v1/routing/select", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = selectModelSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const { from, to } = range(c);
  const selection = await selectModelForRequest(project.id, { from, to, ...parsed.data });
  await recordAuditEvent({
    projectId: project.id,
    action: "routing.select",
    targetType: "model",
    targetId: selection.selectedModel,
    metadata: {
      task: selection.task,
      reason: selection.reason,
      rejected: selection.rejected,
    },
  });
  return c.json(selection);
});

// POST /v1/policies/evaluate — governance decision for planned platform actions.
queryRoutes.post("/v1/policies/evaluate", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = evaluatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const decision = evaluatePolicy(parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "policy.evaluate",
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId ?? null,
    metadata: {
      actor: parsed.data.actor,
      requestedAction: parsed.data.action,
      decision: decision.decision,
      matchedRules: decision.matchedRules,
    },
  });

  return c.json(decision);
});

// GET /v1/evaluations/summary — trace-derived evaluation signals and cases
queryRoutes.get("/v1/evaluations/summary", async (c) => {
  const project = c.get("project");
  const { from, to } = range(c);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));
  return c.json(await evaluationAnalytics(project.id, { from, to, limit }));
});

// GET /v1/audit/events — project audit trail for Layer 8 governance
queryRoutes.get("/v1/audit/events", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listAuditEvents(project.id, {
      action: c.req.query("action"),
      limit,
    }),
  );
});
