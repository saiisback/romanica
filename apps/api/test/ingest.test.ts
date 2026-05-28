import { test, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";
import { readBlob } from "../src/storage.ts";

const app = createApp();
const KEY = "rom_dev_key"; // seeded dev project

function post(body: unknown, key: string | null = KEY) {
  return app.request("/v1/traces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("health is open", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
});

test("rejects missing/invalid api key", async () => {
  expect((await post({ traces: [] }, null)).status).toBe(401);
  expect((await post({ traces: [] }, "rom_bogus")).status).toBe(401);
});

test("rejects malformed payload", async () => {
  expect((await post({ traces: [] })).status).toBe(400); // min(1)
  expect((await post({ nope: 1 })).status).toBe(400);
});

test("ingests a trace, rolls up cost, builds tree, offloads big blobs", async () => {
  const traceId = randomUUID();
  const llmSpan = randomUUID();
  const toolSpan = randomUUID();
  const big = "x".repeat(20_000); // > inline limit -> offloaded to S3
  const now = Date.now();

  const payload = {
    traces: [
      {
        traceId,
        name: "test-run",
        status: "ok",
        startTime: now,
        endTime: now + 100,
        metadata: { env: "test" },
        spans: [
          {
            spanId: llmSpan,
            parentSpanId: null,
            type: "llm",
            name: "call",
            status: "ok",
            startTime: now,
            endTime: now + 40,
            attributes: { model: "gpt-4o", promptTokens: 100, completionTokens: 50 },
          },
          {
            spanId: toolSpan,
            parentSpanId: llmSpan,
            type: "tool",
            name: "search",
            status: "ok",
            startTime: now + 40,
            endTime: now + 90,
            output: { big },
            attributes: {},
          },
        ],
      },
    ],
  };

  const res = await post(payload);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, tracesReceived: 1, spansReceived: 2 });

  const traces = (await sql`SELECT * FROM traces WHERE trace_id = ${traceId}`) as any[];
  expect(traces).toHaveLength(1);
  expect(Number(traces[0].total_tokens)).toBe(150);
  expect(Number(traces[0].total_cost_usd)).toBeCloseTo(0.00075, 6);
  expect(traces[0].span_count).toBe(2);
  expect(traces[0].duration_ms).toBe(100);

  const spans = (await sql`
    SELECT * FROM spans WHERE trace_id = ${traceId} ORDER BY start_time
  `) as any[];
  expect(spans).toHaveLength(2);

  const tool = spans.find((s) => s.type === "tool");
  expect(tool.parent_span_id).toBe(llmSpan);
  expect(tool.duration_ms).toBe(50);

  // big output should have been offloaded, not inlined
  expect(tool.output).toBeNull();
  expect(tool.output_ref).toBeTruthy();
  const blob = (await readBlob(tool.output_ref)) as { big: string };
  expect(blob.big).toBe(big);

  await sql`DELETE FROM traces WHERE trace_id = ${traceId}`;
});
