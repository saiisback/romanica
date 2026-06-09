import { expect, test, afterAll } from "bun:test";
import type { AgentMessageSummary, AuditEventSummary, Page } from "@romanica/shared";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const KEY = "rom_dev_key";
const channel = `handoff-${crypto.randomUUID()}`;
let messageId = "";

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
  if (messageId) {
    await sql`DELETE FROM audit_events WHERE target_id = ${messageId}`;
    await sql`DELETE FROM agent_messages WHERE id = ${messageId}`;
  }
});

test("POST /v1/messages publishes an agent message", async () => {
  const res = await authed("/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      channel,
      sender: "planner",
      recipient: "researcher",
      payload: { task: "collect sources", priority: 2 },
    }),
  });

  expect(res.status).toBe(201);
  const message = (await res.json()) as AgentMessageSummary;
  messageId = message.id;
  expect(message.channel).toBe(channel);
  expect(message.sender).toBe("planner");
  expect(message.recipient).toBe("researcher");
  expect(message.status).toBe("pending");
  expect(message.payload).toMatchObject({ task: "collect sources" });
});

test("GET /v1/messages lists messages by channel", async () => {
  const res = await authed(`/v1/messages?channel=${channel}`);
  expect(res.status).toBe(200);
  const page = (await res.json()) as Page<AgentMessageSummary>;
  expect(page.items.some((message) => message.id === messageId)).toBe(true);
});

test("POST /v1/messages/:id/ack acknowledges a message and audits it", async () => {
  const ack = await authed(`/v1/messages/${messageId}/ack`, {
    method: "POST",
    body: JSON.stringify({ status: "acknowledged" }),
  });
  expect(ack.status).toBe(200);
  const message = (await ack.json()) as AgentMessageSummary;
  expect(message.status).toBe("acknowledged");
  expect(message.ackedAt).toBeTruthy();

  const audit = await authed(`/v1/audit/events?action=message.ack&limit=10`);
  expect(audit.status).toBe(200);
  const page = (await audit.json()) as Page<AuditEventSummary>;
  const event = page.items.find((item) => item.targetId === messageId);
  expect(event).toBeTruthy();
  expect(event!.metadata.channel).toBe(channel);
});

test("POST /v1/messages/:id/ack 404s for unknown messages", async () => {
  const res = await authed(`/v1/messages/${crypto.randomUUID()}/ack`, {
    method: "POST",
    body: JSON.stringify({ status: "acknowledged" }),
  });
  expect(res.status).toBe(404);
});
