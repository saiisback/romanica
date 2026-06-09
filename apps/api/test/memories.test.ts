import { afterAll, expect, test } from "bun:test";
import type { AuditEventSummary, MemorySearchResult, MemorySummary, Page } from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const memoryKey = `customer-pref-${crypto.randomUUID()}`;
let memoryId = "";

function authed(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
      ...(init?.headers ?? {}),
    },
  });
}

afterAll(async () => {
  if (memoryId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${memoryId}`;
    await sql`DELETE FROM memories WHERE id = ${memoryId}`;
  }
});

test("POST /v1/memories upserts a memory record", async () => {
  const res = await authed("/v1/memories", {
    method: "POST",
    body: JSON.stringify({
      scope: "support-agent",
      kind: "semantic",
      key: memoryKey,
      content: { preference: "short replies", source: "conversation" },
      sourceType: "trace",
      sourceId: "trace-123",
      confidence: 0.82,
      metadata: { pii: false },
    }),
  });

  expect(res.status).toBe(201);
  const memory = (await res.json()) as MemorySummary;
  memoryId = memory.id;
  expect(memory.scope).toBe("support-agent");
  expect(memory.kind).toBe("semantic");
  expect(memory.key).toBe(memoryKey);
  expect(memory.content).toMatchObject({ preference: "short replies" });
  expect(memory.confidence).toBeCloseTo(0.82, 4);
});

test("GET /v1/memories lists memories by kind and scope", async () => {
  const res = await authed("/v1/memories?kind=semantic&scope=support-agent");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<MemorySummary>;
  expect(page.items.some((memory) => memory.id === memoryId)).toBe(true);
});

test("GET /v1/memories/search returns ranked retrieval results", async () => {
  const res = await authed("/v1/memories/search?q=short%20replies&kind=semantic&scope=support-agent");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: MemorySearchResult[] };
  expect(body.items.length).toBeGreaterThanOrEqual(1);
  expect(body.items[0]!.id).toBe(memoryId);
  expect(body.items[0]!.rank).toBe(1);
  expect(body.items[0]!.score).toBeGreaterThan(0);
});

test("GET /v1/memories/:id returns memory detail", async () => {
  const res = await authed(`/v1/memories/${memoryId}`);
  expect(res.status).toBe(200);
  const memory = (await res.json()) as MemorySummary;
  expect(memory.id).toBe(memoryId);
  expect(memory.metadata.pii).toBe(false);
});

test("memory upserts are audited", async () => {
  const res = await authed("/v1/audit/events?action=memory.upsert&limit=10");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === memoryId);
  expect(event).toBeTruthy();
  expect(event!.metadata.kind).toBe("semantic");
  expect(event!.metadata.key).toBe(memoryKey);
});
