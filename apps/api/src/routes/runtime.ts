import {
  createAgentDefinitionSchema,
  createAgentRunSchema,
  executeAgentRunSchema,
  updateAgentRunSchema,
} from "@romanica/shared";
import { Hono } from "hono";
import { recordAuditEvent } from "../audit.ts";
import {
  createAgentRun,
  executeAgentRun,
  listAgentDefinitions,
  listAgentRuns,
  updateAgentRun,
  upsertAgentDefinition,
} from "../runtime.ts";
import type { Env } from "../http.ts";

export const runtimeRoutes = new Hono<Env>();

runtimeRoutes.post("/v1/agents", async (c) => {
  const project = c.get("project");
  const body = await c.req.json().catch(() => null);
  const parsed = createAgentDefinitionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const agent = await upsertAgentDefinition(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "agent.upsert",
    targetType: "agent",
    targetId: agent.id,
    metadata: {
      name: agent.name,
      version: agent.version,
      runtime: agent.runtime,
      entrypoint: agent.entrypoint,
    },
  });
  return c.json(agent, 201);
});

runtimeRoutes.get("/v1/agents", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(await listAgentDefinitions(project.id, { limit }));
});

runtimeRoutes.post("/v1/runs", async (c) => {
  const project = c.get("project");
  const body = await c.req.json().catch(() => null);
  const parsed = createAgentRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const run = await createAgentRun(project.id, parsed.data);
  if (!run) return c.json({ error: "agent_not_found" }, 404);
  await recordAuditEvent({
    projectId: project.id,
    action: "run.create",
    targetType: "agent_run",
    targetId: run.id,
    metadata: {
      agentId: run.agentId,
      agentName: run.agentName,
      status: run.status,
      traceId: run.traceId,
    },
  });
  return c.json(run, 201);
});

runtimeRoutes.get("/v1/runs", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listAgentRuns(project.id, {
      status: c.req.query("status"),
      limit,
    }),
  );
});

runtimeRoutes.post("/v1/runs/:id/status", async (c) => {
  const project = c.get("project");
  const body = await c.req.json().catch(() => null);
  const parsed = updateAgentRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const run = await updateAgentRun(project.id, c.req.param("id"), parsed.data);
  if (!run) return c.json({ error: "not_found" }, 404);
  await recordAuditEvent({
    projectId: project.id,
    action: "run.status",
    targetType: "agent_run",
    targetId: run.id,
    metadata: {
      agentId: run.agentId,
      status: run.status,
      traceId: run.traceId,
    },
  });
  return c.json(run);
});

runtimeRoutes.post("/v1/runs/:id/execute", async (c) => {
  const project = c.get("project");
  const body = await c.req.json().catch(() => ({}));
  const parsed = executeAgentRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const result = await executeAgentRun(project.id, c.req.param("id"), parsed.data);
  if (!result) return c.json({ error: "not_found" }, 404);
  await recordAuditEvent({
    projectId: project.id,
    action: "run.execute",
    targetType: "agent_run",
    targetId: result.run.id,
    metadata: {
      agentId: result.run.agentId,
      status: result.run.status,
      attempt: result.attempt.attempt,
      executor: result.attempt.executor,
    },
  });
  return c.json(result);
});
