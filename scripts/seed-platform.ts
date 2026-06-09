#!/usr/bin/env bun
// Seed the expanded control-plane surfaces. Run with the API up.
import { Romanica } from "../packages/sdk/src/index.ts";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const API_KEY = process.env.ROMANICA_API_KEY ?? "rom_dev_key";

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const romanica = new Romanica({ apiKey: API_KEY, endpoint: API_URL });

let traceId = "";
await romanica.trace("platform-seed-support-agent", async (trace) => {
  trace.setMetadata({ env: "seed", ticket: "T-SEED-1" });
  traceId = trace.traceId;

  await trace.span("agent", "handle-ticket", async (root) => {
    await root.span("retrieval", "search-memory", async (span) => {
      span.setRetrieval({
        query: "refund policy",
        topK: 2,
        documents: [{ id: "policy-refunds", score: 0.94 }],
      });
      span.setOutput({ hits: ["policy-refunds", "tone-guide"] });
    });

    await root.span("llm", "draft-response", async (span) => {
      span.setInput({ messages: [{ role: "user", content: "Can I get a refund?" }] });
      span.setLLM({ model: "gpt-4o", usage: { prompt_tokens: 380, completion_tokens: 160 } });
      span.setOutput({ text: "Refunds are available within 30 days when eligible." });
    });
  });
});
await romanica.flush();

const agent = await api<{ id: string }>("/v1/agents", {
  name: "support-agent",
  version: "v1",
  runtime: "external",
  entrypoint: "agents.support.handleTicket",
  config: { queue: "support", timeoutMs: 120_000 },
});

const run = await api<{ id: string }>("/v1/runs", {
  agentId: agent.id,
  traceId,
  input: { ticketId: "T-SEED-1", customerTier: "pro" },
});
await api(`/v1/runs/${run.id}/status`, { status: "succeeded", traceId });

await api("/v1/workflows", {
  name: "support-ticket-resolution",
  version: "v1",
  status: "active",
  definition: {
    nodes: [
      { id: "triage", type: "agent" },
      { id: "approval", type: "human" },
      { id: "reply", type: "agent" },
    ],
    edges: [
      { from: "triage", to: "approval" },
      { from: "approval", to: "reply" },
    ],
  },
  metadata: { seeded: true },
});

await api("/v1/memories", {
  scope: "support-agent",
  kind: "semantic",
  key: "refund-policy-summary",
  content: { text: "Eligible customers can request refunds within 30 days." },
  sourceType: "trace",
  sourceId: traceId,
  confidence: 0.91,
  metadata: { seeded: true },
});

const message = await api<{ id: string }>("/v1/messages", {
  channel: "support-handoffs",
  sender: "support-agent",
  recipient: "ops-review",
  traceId,
  payload: { ticketId: "T-SEED-1", reason: "refund approval requested" },
});
await api(`/v1/messages/${message.id}/ack`, { status: "acknowledged" });

await api("/v1/pools", {
  name: "support-workers",
  desiredWorkers: 4,
  activeWorkers: 3,
  runningTasks: 7,
  queuedTasks: 1,
  maxConcurrency: 3,
  metadata: { region: "local-dev", seeded: true },
});

const approval = await api<{ id: string }>("/v1/approvals", {
  title: "Approve refund response",
  requester: "support-agent",
  assignee: "ops-review",
  targetType: "trace",
  targetId: traceId,
  payload: { ticketId: "T-SEED-1", draft: "Refunds are available within 30 days." },
});
await api(`/v1/approvals/${approval.id}/decision`, {
  status: "approved",
  reviewer: "ops-review",
  reason: "seed approval",
});

console.log(
  JSON.stringify(
    {
      traceId,
      agentId: agent.id,
      runId: run.id,
      messageId: message.id,
      approvalId: approval.id,
    },
    null,
    2,
  ),
);
