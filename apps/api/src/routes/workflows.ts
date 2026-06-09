import { createWorkflowSchema } from "@romanica/shared";
import { Hono } from "hono";
import { recordAuditEvent } from "../audit.ts";
import { createWorkflow, getWorkflow, listWorkflows } from "../workflows.ts";
import type { Env } from "../http.ts";

export const workflowRoutes = new Hono<Env>();

// POST /v1/workflows — create/update a workflow definition.
workflowRoutes.post("/v1/workflows", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const workflow = await createWorkflow(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "workflow.upsert",
    targetType: "workflow",
    targetId: workflow.id,
    metadata: {
      name: workflow.name,
      version: workflow.version,
      status: workflow.status,
      nodeCount: workflow.nodeCount,
      edgeCount: workflow.edgeCount,
    },
  });

  return c.json(workflow, 201);
});

// GET /v1/workflows — list workflow definitions.
workflowRoutes.get("/v1/workflows", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listWorkflows(project.id, {
      status: c.req.query("status"),
      limit,
    }),
  );
});

// GET /v1/workflows/:id — workflow detail.
workflowRoutes.get("/v1/workflows/:id", async (c) => {
  const project = c.get("project");
  const workflow = await getWorkflow(project.id, c.req.param("id"));
  if (!workflow) return c.json({ error: "not_found" }, 404);
  return c.json(workflow);
});
