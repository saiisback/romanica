import { Hono } from "hono";
import { getTraceDetail } from "../queries.ts";
import { ingestPayload } from "../ingest.ts";
import { buildReplayPayload, makeOpenAIInvoker, replayTrace } from "../replay.ts";
import type { Env } from "../http.ts";

export const replayRoutes = new Hono<Env>();

interface ReplayBody {
  /** Provider key for this replay (else falls back to server env). */
  apiKey?: string;
  /** OpenAI-compatible base URL override. */
  baseUrl?: string;
  /** Persist the replay as its own trace (default true). */
  persist?: boolean;
}

// POST /v1/traces/:id/replay — re-issue the trace's captured LLM calls.
replayRoutes.post("/v1/traces/:id/replay", async (c) => {
  const project = c.get("project");
  const detail = await getTraceDetail(project.id, c.req.param("id"));
  if (!detail) return c.json({ error: "not_found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as ReplayBody;
  const invoker = makeOpenAIInvoker({ apiKey: body.apiKey, baseUrl: body.baseUrl });

  const result = await replayTrace(detail, invoker);

  if (body.persist !== false) {
    const payload = buildReplayPayload(detail, result);
    if (payload) {
      await ingestPayload(project.id, payload);
      result.replayTraceId = payload.traces[0]!.traceId;
    }
  }

  return c.json(result);
});
