import { Hono } from "hono";
import { ingestPayloadSchema } from "@romanica/shared";
import { ingestPayload } from "../ingest.ts";
import { recordAuditEvent } from "../audit.ts";
import type { Env } from "../http.ts";

export const ingestRoutes = new Hono<Env>();

// POST /v1/traces — batch of traces (each with its spans).
ingestRoutes.post("/v1/traces", async (c) => {
  const project = c.get("project");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const result = await ingestPayload(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "trace.ingest",
    targetType: parsed.data.traces.length === 1 ? "trace" : "trace_batch",
    targetId: parsed.data.traces[0]?.traceId ?? null,
    metadata: {
      tracesReceived: result.tracesReceived,
      spansReceived: result.spansReceived,
      traceIds: parsed.data.traces.slice(0, 25).map((trace) => trace.traceId),
    },
  });
  return c.json({ ok: true, ...result });
});
