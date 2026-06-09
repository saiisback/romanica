import { upsertMemorySchema } from "@romanica/shared";
import { Hono } from "hono";
import { recordAuditEvent } from "../audit.ts";
import { getMemory, listMemories, upsertMemory } from "../memories.ts";
import type { Env } from "../http.ts";

export const memoryRoutes = new Hono<Env>();

// POST /v1/memories — create/update a memory record.
memoryRoutes.post("/v1/memories", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = upsertMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const memory = await upsertMemory(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "memory.upsert",
    targetType: "memory",
    targetId: memory.id,
    metadata: {
      scope: memory.scope,
      kind: memory.kind,
      key: memory.key,
      sourceType: memory.sourceType,
      sourceId: memory.sourceId,
    },
  });

  return c.json(memory, 201);
});

// GET /v1/memories — list active memories by kind/scope.
memoryRoutes.get("/v1/memories", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listMemories(project.id, {
      kind: c.req.query("kind"),
      scope: c.req.query("scope"),
      limit,
    }),
  );
});

// GET /v1/memories/:id — memory detail.
memoryRoutes.get("/v1/memories/:id", async (c) => {
  const project = c.get("project");
  const memory = await getMemory(project.id, c.req.param("id"));
  if (!memory) return c.json({ error: "not_found" }, 404);
  return c.json(memory);
});
