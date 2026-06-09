import { afterAll, expect, test } from "bun:test";
import type { ApprovalSummary, AuditEventSummary, Page } from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
let approvalId = "";

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
  if (approvalId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${approvalId}`;
    await sql`DELETE FROM approvals WHERE id = ${approvalId}`;
  }
});

test("POST /v1/approvals creates a pending checkpoint", async () => {
  const res = await authed("/v1/approvals", {
    method: "POST",
    body: JSON.stringify({
      title: "Approve refund response",
      requester: "support-agent",
      assignee: "ops",
      targetType: "workflow",
      targetId: "wf-123",
      payload: { draft: "We can refund this order." },
    }),
  });

  expect(res.status).toBe(201);
  const approval = (await res.json()) as ApprovalSummary;
  approvalId = approval.id;
  expect(approval.status).toBe("pending");
  expect(approval.assignee).toBe("ops");
});

test("GET /v1/approvals lists pending approvals", async () => {
  const res = await authed("/v1/approvals?status=pending");
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<ApprovalSummary>;
  expect(page.items.some((approval) => approval.id === approvalId)).toBe(true);
});

test("POST /v1/approvals/:id/decision records a decision and audits it", async () => {
  const res = await authed(`/v1/approvals/${approvalId}/decision`, {
    method: "POST",
    body: JSON.stringify({
      status: "approved",
      reviewer: "ops",
      reason: "looks correct",
      output: { approvedText: "Refund approved." },
    }),
  });
  expect(res.status).toBe(200);
  const approval = (await res.json()) as ApprovalSummary;
  expect(approval.status).toBe("approved");
  expect(approval.decision?.reviewer).toBe("ops");

  const audit = await authed("/v1/audit/events?action=approval.decision&limit=10");
  expect(audit.status).toBe(200);
  const page = (await audit.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === approvalId);
  expect(event).toBeTruthy();
  expect(event!.metadata.status).toBe("approved");
});
