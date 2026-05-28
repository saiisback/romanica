import { Hono } from "hono";
import {
  costAnalytics,
  getTraceDetail,
  latencyAnalytics,
  listTraces,
} from "../queries.ts";
import type { Env } from "../http.ts";

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
