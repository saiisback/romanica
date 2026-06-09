import { ackMessageSchema, publishMessageSchema } from "@romanica/shared";
import { Hono } from "hono";
import { recordAuditEvent } from "../audit.ts";
import {
  acknowledgeMessage,
  listMessages,
  publishMessage,
} from "../messages.ts";
import type { Env } from "../http.ts";

export const messageRoutes = new Hono<Env>();

// POST /v1/messages — publish a project-scoped agent message.
messageRoutes.post("/v1/messages", async (c) => {
  const project = c.get("project");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = publishMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const message = await publishMessage(project.id, parsed.data);
  await recordAuditEvent({
    projectId: project.id,
    action: "message.publish",
    targetType: "message",
    targetId: message.id,
    metadata: {
      channel: message.channel,
      sender: message.sender,
      recipient: message.recipient,
      traceId: message.traceId,
    },
  });

  return c.json(message, 201);
});

// GET /v1/messages — recent messages by channel/status.
messageRoutes.get("/v1/messages", async (c) => {
  const project = c.get("project");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json(
    await listMessages(project.id, {
      channel: c.req.query("channel"),
      status: c.req.query("status"),
      limit,
    }),
  );
});

// POST /v1/messages/:id/ack — acknowledge or fail a message.
messageRoutes.post("/v1/messages/:id/ack", async (c) => {
  const project = c.get("project");
  const body = (await c.req.json().catch(() => ({}))) as unknown;
  const parsed = ackMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const message = await acknowledgeMessage(project.id, c.req.param("id"), parsed.data.status);
  if (!message) return c.json({ error: "not_found" }, 404);

  await recordAuditEvent({
    projectId: project.id,
    action: "message.ack",
    targetType: "message",
    targetId: message.id,
    metadata: {
      channel: message.channel,
      status: message.status,
    },
  });

  return c.json(message);
});
