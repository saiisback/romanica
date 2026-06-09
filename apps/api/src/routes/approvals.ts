import { createApprovalSchema, decideApprovalSchema } from "@romanica/shared";
import { Hono } from "hono";
import { createApproval, decideApproval, listApprovals } from "../approvals.ts";
import { recordAuditEvent } from "../audit.ts";
import type { Env } from "../http.ts";

export const approvalRoutes = new Hono<Env>();

// POST /v1/approvals — create a human approval checkpoint.
approvalRoutes.post("/v1/approvals", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = createApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const approval = await createApproval(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "approval.create",
    targetType: "approval",
    targetId: approval.id,
    metadata: {
      title: approval.title,
      requester: approval.requester,
      assignee: approval.assignee,
      targetType: approval.targetType,
      targetId: approval.targetId,
    },
  });

  return c.json(approval, 201);
});

// GET /v1/approvals — list approval checkpoints.
approvalRoutes.get("/v1/approvals", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listApprovals(project.id, {
      status: c.req.query("status"),
      limit,
    }),
  );
});

// POST /v1/approvals/:id/decision — approve/reject/cancel a checkpoint.
approvalRoutes.post("/v1/approvals/:id/decision", async (c) => {
  const project = c.get("project");
  const body = (await c.req.json().catch(() => ({}))) as unknown;
  const parsed = decideApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const approval = await decideApproval(project.id, c.req.param("id"), parsed.data);
  if (!approval) return c.json({ error: "not_found" }, 404);

  await recordAuditEvent({
    projectId: project.id,
    action: "approval.decision",
    targetType: "approval",
    targetId: approval.id,
    metadata: {
      status: approval.status,
      reviewer: approval.decision?.reviewer,
      targetType: approval.targetType,
      targetId: approval.targetId,
    },
  });

  return c.json(approval);
});
