import { afterAll, expect, test } from "bun:test";
import type {
  AuditEventSummary,
  AutoscalingDecisionSummary,
  Page,
  WorkerPoolSummary,
} from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const name = `agent-workers-${crypto.randomUUID()}`;
let poolId = "";

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
  if (poolId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${poolId}`;
    await sql`DELETE FROM autoscaling_decisions WHERE pool_id = ${poolId}`;
    await sql`DELETE FROM worker_pools WHERE id = ${poolId}`;
  }
});

test("POST /v1/pools upserts worker pool capacity", async () => {
  const res = await authed("/v1/pools", {
    method: "POST",
    body: JSON.stringify({
      name,
      desiredWorkers: 4,
      activeWorkers: 2,
      queuedTasks: 3,
      runningTasks: 8,
      maxConcurrency: 4,
      metadata: { region: "iad" },
    }),
  });

  expect(res.status).toBe(201);
  const pool = (await res.json()) as WorkerPoolSummary;
  poolId = pool.id;
  expect(pool.name).toBe(name);
  expect(pool.utilization).toBe(1);
  expect(pool.pressure).toBe("saturated");
  expect(pool.recommendedWorkers).toBe(3);
  expect(pool.scaleAction).toBe("scale_down");
});

test("GET /v1/pools lists pool snapshots", async () => {
  const res = await authed("/v1/pools?status=active");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<WorkerPoolSummary>;
  expect(page.items.some((pool) => pool.id === poolId)).toBe(true);
});

test("POST /v1/pools/:id/autoscale applies and records a scaling decision", async () => {
  const res = await authed(`/v1/pools/${poolId}/autoscale`, { method: "POST", body: "{}" });
  expect(res.status).toBe(200);
  const decision = (await res.json()) as AutoscalingDecisionSummary;
  expect(decision.poolId).toBe(poolId);
  expect(decision.previousDesiredWorkers).toBe(4);
  expect(decision.appliedWorkers).toBe(3);
  expect(decision.action).toBe("scale_down");

  const listed = await authed("/v1/autoscaling/decisions?limit=10");
  expect(listed.status).toBe(200);
  const page = (await listed.json()) as Page<AutoscalingDecisionSummary>;
  expect(page.items.some((item) => item.id === decision.id)).toBe(true);
});

test("pool upserts are audited", async () => {
  const res = await authed("/v1/audit/events?action=pool.upsert&limit=10");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === poolId);
  expect(event).toBeTruthy();
  expect(event!.metadata.pressure).toBe("saturated");
});
