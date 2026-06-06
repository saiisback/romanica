import { test, expect, beforeAll, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import type { CostAnalytics, LatencyAnalytics, Page, ReplayResult, TraceDetail, TraceSummary } from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";

const traceId = randomUUID();
const rootSpan = randomUUID();
const llmSpan = randomUUID();
const now = Date.now();

function authed(path: string) {
  return app.request(path, { headers: { authorization: `Bearer ${KEY}` } });
}

beforeAll(async () => {
  // ingest one known trace to query against
  const payload = {
    traces: [
      {
        traceId,
        name: "query-run",
        status: "ok",
        startTime: now,
        endTime: now + 120,
        metadata: { env: "test", feature: "query" },
        spans: [
          {
            spanId: rootSpan,
            parentSpanId: null,
            type: "agent",
            name: "root",
            status: "ok",
            startTime: now,
            endTime: now + 120,
            attributes: {},
          },
          {
            spanId: llmSpan,
            parentSpanId: rootSpan,
            type: "llm",
            name: "generate",
            status: "ok",
            startTime: now + 10,
            endTime: now + 70,
            input: { prompt: "hi" },
            output: { text: "hello" },
            attributes: { model: "gpt-4o", promptTokens: 100, completionTokens: 50, costUsd: 0.00075 },
          },
        ],
      },
    ],
  };
  const res = await app.request("/v1/traces", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(payload),
  });
  if (res.status !== 200) throw new Error(`seed ingest failed: ${res.status}`);
});

afterAll(async () => {
  await sql`DELETE FROM traces WHERE trace_id = ${traceId}`;
});

test("GET /v1/traces lists the trace", async () => {
  const res = await authed("/v1/traces?limit=200");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<TraceSummary>;
  const found = page.items.find((t) => t.traceId === traceId);
  expect(found).toBeTruthy();
  expect(found!.name).toBe("query-run");
  expect(found!.spanCount).toBe(2);
  expect(found!.totalTokens).toBe(150);
  expect(found!.durationMs).toBe(120);
});

test("GET /v1/traces/:id returns the nested span tree", async () => {
  const res = await authed(`/v1/traces/${traceId}`);
  expect(res.status).toBe(200);
  const detail = (await res.json()) as TraceDetail;
  expect(detail.metadata).toMatchObject({ feature: "query" });
  expect(detail.spans).toHaveLength(1); // one root
  const root = detail.spans[0]!;
  expect(root.name).toBe("root");
  expect(root.children).toHaveLength(1);
  const child = root.children[0]!;
  expect(child.type).toBe("llm");
  expect(child.input).toMatchObject({ prompt: "hi" });
  expect(child.output).toMatchObject({ text: "hello" });
  expect(child.attributes.model).toBe("gpt-4o");
});

test("GET /v1/traces/:id 404s for unknown id", async () => {
  const res = await authed(`/v1/traces/${randomUUID()}`);
  expect(res.status).toBe(404);
});

test("GET /v1/analytics/cost aggregates tokens + cost", async () => {
  const res = await authed("/v1/analytics/cost?bucket=day");
  expect(res.status).toBe(200);
  const cost = (await res.json()) as CostAnalytics;
  expect(cost.totalTokens).toBeGreaterThanOrEqual(150);
  expect(cost.totalCostUsd).toBeGreaterThan(0);
  const gpt4o = cost.byModel.find((m) => m.model === "gpt-4o");
  expect(gpt4o).toBeTruthy();
});

test("GET /v1/traces/:id round-trips bare-string input/output", async () => {
  // LLM spans often carry plain-string input/output; these must not be dropped.
  const id = randomUUID();
  const span = randomUUID();
  const t0 = Date.now();
  const seed = await app.request("/v1/traces", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      traces: [
        {
          traceId: id,
          name: "str-run",
          status: "ok",
          startTime: t0,
          endTime: t0 + 10,
          metadata: {},
          spans: [
            {
              spanId: span,
              parentSpanId: null,
              type: "llm",
              name: "draft",
              status: "ok",
              startTime: t0,
              endTime: t0 + 10,
              input: "say hi",
              output: "hello there",
              attributes: { model: "gpt-4o" },
            },
          ],
        },
      ],
    }),
  });
  expect(seed.status).toBe(200);

  const res = await authed(`/v1/traces/${id}`);
  const detail = (await res.json()) as TraceDetail;
  expect(detail.spans[0]!.input).toBe("say hi");
  expect(detail.spans[0]!.output).toBe("hello there");

  await sql`DELETE FROM traces WHERE trace_id = ${id}`;
});

test("POST /v1/traces/:id/replay reconstructs the captured LLM calls", async () => {
  const res = await app.request(`/v1/traces/${traceId}/replay`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    // persist:false keeps the test from minting an extra trace; no key in CI -> skipped
    body: JSON.stringify({ persist: false }),
  });
  expect(res.status).toBe(200);
  const replay = (await res.json()) as ReplayResult;
  expect(replay.traceId).toBe(traceId);
  expect(replay.steps).toHaveLength(1); // the single llm span
  const step = replay.steps[0]!;
  expect(step.model).toBe("gpt-4o");
  // the exact request we'd re-issue is always reconstructed, key or not
  expect(step.request.messages).toEqual([{ role: "user", content: "hi" }]);
});

test("POST /v1/traces/:id/replay 404s for unknown id", async () => {
  const res = await app.request(`/v1/traces/${randomUUID()}/replay`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: "{}",
  });
  expect(res.status).toBe(404);
});

test("GET /v1/analytics/latency returns percentiles", async () => {
  const res = await authed("/v1/analytics/latency");
  expect(res.status).toBe(200);
  const lat = (await res.json()) as LatencyAnalytics;
  expect(lat.traceP50Ms).toBeGreaterThan(0);
  const llm = lat.byType.find((b) => b.type === "llm");
  expect(llm).toBeTruthy();
  expect(llm!.count).toBeGreaterThanOrEqual(1);
});
