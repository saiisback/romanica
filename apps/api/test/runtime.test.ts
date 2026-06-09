import { afterAll, expect, test } from "bun:test";
import type {
  AgentDefinitionSummary,
  AgentRunSummary,
  AuditEventSummary,
  Page,
  RuntimeAttemptSummary,
} from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const name = `refund-agent-${crypto.randomUUID()}`;
let agentId = "";
let runId = "";
let httpAgentId = "";
let httpRunId = "";
const agentServer = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = await req.json().catch(() => ({}));
    return Response.json({ ok: true, echo: body });
  },
});

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
  agentServer.stop(true);
  if (httpRunId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${httpRunId}`;
    await sql`DELETE FROM runtime_attempts WHERE run_id = ${httpRunId}`;
    await sql`DELETE FROM agent_runs WHERE id = ${httpRunId}`;
  }
  if (httpAgentId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${httpAgentId}`;
    await sql`DELETE FROM agent_definitions WHERE id = ${httpAgentId}`;
  }
  if (runId) await sql`DELETE FROM audit_events WHERE target_id = ${runId}`;
  if (runId) await sql`DELETE FROM runtime_attempts WHERE run_id = ${runId}`;
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

test("POST /v1/runs/:id/execute runs an HTTP agent and records an attempt", async () => {
  const agentRes = await authed("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      name: `http-agent-${crypto.randomUUID()}`,
      version: "v1",
      runtime: "http",
      entrypoint: agentServer.url.toString(),
    }),
  });
  expect(agentRes.status).toBe(201);
  const agent = (await agentRes.json()) as AgentDefinitionSummary;
  httpAgentId = agent.id;

  const runRes = await authed("/v1/runs", {
    method: "POST",
    body: JSON.stringify({ agentId: httpAgentId, input: { ticket: "T-2" } }),
  });
  expect(runRes.status).toBe(201);
  const run = (await runRes.json()) as AgentRunSummary;
  httpRunId = run.id;

  const executed = await authed(`/v1/runs/${httpRunId}/execute`, {
    method: "POST",
    body: JSON.stringify({ timeoutMs: 1000 }),
  });
  expect(executed.status).toBe(200);
  const result = (await executed.json()) as { run: AgentRunSummary; attempt: RuntimeAttemptSummary };
  expect(result.run.status).toBe("succeeded");
  expect(result.attempt.status).toBe("succeeded");
  expect(result.attempt.response).toMatchObject({ ok: true });
});

test("runtime changes are audited", async () => {
  const res = await authed("/v1/audit/events?action=run.status&limit=10");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === runId);
  expect(event).toBeTruthy();
  expect(event!.metadata.status).toBe("succeeded");
});
