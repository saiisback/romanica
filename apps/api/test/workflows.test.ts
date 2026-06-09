import { afterAll, expect, test } from "bun:test";
import type {
  AuditEventSummary,
  Page,
  WorkflowDetail,
  WorkflowRunSummary,
  WorkflowSummary,
} from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const name = `support-flow-${crypto.randomUUID()}`;
let workflowId = "";
let workflowRunId = "";

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
  if (workflowRunId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${workflowRunId}`;
    await sql`DELETE FROM workflow_runs WHERE id = ${workflowRunId}`;
  }
  if (workflowId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${workflowId}`;
    await sql`DELETE FROM workflows WHERE id = ${workflowId}`;
  }
});

test("POST /v1/workflows upserts a workflow definition", async () => {
  const res = await authed("/v1/workflows", {
    method: "POST",
    body: JSON.stringify({
      name,
      version: "v1",
      status: "active",
      metadata: { owner: "ops" },
      definition: {
        nodes: [
          { id: "triage", type: "agent" },
          { id: "approve", type: "human" },
        ],
        edges: [{ from: "triage", to: "approve" }],
      },
    }),
  });

  expect(res.status).toBe(201);
  const workflow = (await res.json()) as WorkflowDetail;
  workflowId = workflow.id;
  expect(workflow.name).toBe(name);
  expect(workflow.status).toBe("active");
  expect(workflow.nodeCount).toBe(2);
  expect(workflow.edgeCount).toBe(1);
});

test("GET /v1/workflows lists workflow definitions", async () => {
  const res = await authed("/v1/workflows?status=active");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<WorkflowSummary>;
  expect(page.items.some((workflow) => workflow.id === workflowId)).toBe(true);
});

test("GET /v1/workflows/:id returns workflow detail", async () => {
  const res = await authed(`/v1/workflows/${workflowId}`);
  expect(res.status).toBe(200);
  const workflow = (await res.json()) as WorkflowDetail;
  expect(workflow.id).toBe(workflowId);
  expect(workflow.definition).toMatchObject({ edges: [{ from: "triage", to: "approve" }] });
  const definition = workflow.definition as { nodes: Array<{ id: string; type: string }> };
  expect(definition.nodes[0]).toMatchObject({ id: "triage", type: "agent" });
});

test("workflow upserts are audited", async () => {
  const res = await authed("/v1/audit/events?action=workflow.upsert&limit=10");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === workflowId);
  expect(event).toBeTruthy();
  expect(event!.metadata.nodeCount).toBe(2);
});

test("workflow runs can be queued, listed, and completed", async () => {
  const queued = await authed("/v1/workflow-runs", {
    method: "POST",
    body: JSON.stringify({
      workflowId,
      input: { ticketId: "T-1" },
    }),
  });
  expect(queued.status).toBe(201);
  const run = (await queued.json()) as WorkflowRunSummary;
  workflowRunId = run.id;
  expect(run.status).toBe("queued");
  expect(run.workflowName).toBe(name);

  const done = await authed(`/v1/workflow-runs/${workflowRunId}/status`, {
    method: "POST",
    body: JSON.stringify({
      status: "succeeded",
      plan: { stages: [{ index: 0, nodeIds: ["triage"] }] },
    }),
  });
  expect(done.status).toBe(200);
  const completed = (await done.json()) as WorkflowRunSummary;
  expect(completed.status).toBe("succeeded");
  expect(completed.finishedAt).toBeTruthy();
  expect(completed.plan).toMatchObject({ stages: [{ index: 0 }] });

  const listed = await authed("/v1/workflow-runs?status=succeeded");
  expect(listed.status).toBe(200);
  const page = (await listed.json()) as Page<WorkflowRunSummary>;
  expect(page.items.some((item) => item.id === workflowRunId)).toBe(true);
});
