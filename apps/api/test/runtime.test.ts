import { afterAll, expect, test } from "bun:test";
import type {
  AgentDefinitionSummary,
  AgentRunSummary,
  AuditEventSummary,
  Page,
} from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const name = `refund-agent-${crypto.randomUUID()}`;
let agentId = "";
let runId = "";

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
  if (runId) await sql`DELETE FROM audit_events WHERE target_id = ${runId}`;
  if (agentId) await sql`DELETE FROM audit_events WHERE target_id = ${agentId}`;
  if (runId) await sql`DELETE FROM agent_runs WHERE id = ${runId}`;
  if (agentId) await sql`DELETE FROM agent_definitions WHERE id = ${agentId}`;
});

test("POST /v1/agents upserts an agent definition", async () => {
  const res = await authed("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      version: "v1",
      runtime: "external",
      entrypoint: "support.refund",
      config: { queue: "support" },
    }),
  });
  expect(res.status).toBe(201);
  const agent = (await res.json()) as AgentDefinitionSummary;
  agentId = agent.id;
  expect(agent.name).toBe(name);
  expect(agent.entrypoint).toBe("support.refund");
});

test("GET /v1/agents lists definitions", async () => {
  const res = await authed("/v1/agents?limit=25");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AgentDefinitionSummary>;
  expect(page.items.some((agent) => agent.id === agentId)).toBe(true);
});

test("POST /v1/runs queues and updates an agent run", async () => {
  const queued = await authed("/v1/runs", {
    method: "POST",
    body: JSON.stringify({
      agentId,
      input: { ticket: "T-1" },
    }),
  });
  expect(queued.status).toBe(201);
  const run = (await queued.json()) as AgentRunSummary;
  runId = run.id;
  expect(run.status).toBe("queued");
  expect(run.agentName).toBe(name);

  const finished = await authed(`/v1/runs/${runId}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "succeeded" }),
  });
  expect(finished.status).toBe(200);
  const done = (await finished.json()) as AgentRunSummary;
  expect(done.status).toBe("succeeded");
  expect(done.finishedAt).toBeTruthy();
});

test("GET /v1/runs lists runtime run requests", async () => {
  const res = await authed("/v1/runs?status=succeeded");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AgentRunSummary>;
  expect(page.items.some((run) => run.id === runId)).toBe(true);
});

test("runtime changes are audited", async () => {
  const res = await authed("/v1/audit/events?action=run.status&limit=10");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === runId);
  expect(event).toBeTruthy();
  expect(event!.metadata.status).toBe("succeeded");
});
