import type { AgentMessageSummary, Page, PublishMessage } from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

function asObject<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

export async function publishMessage(
  projectId: string,
  message: PublishMessage,
): Promise<AgentMessageSummary> {
  const rows = (await sql`
    INSERT INTO agent_messages (
      project_id, channel, sender, recipient, trace_id, payload
    ) VALUES (
      ${projectId},
      ${message.channel},
      ${message.sender},
      ${message.recipient ?? null},
      ${message.traceId ?? null},
      ${message.payload}
    )
    RETURNING id, project_id, channel, sender, recipient, trace_id, status, payload, created_at, acked_at
  `) as any[];
  return toSummary(rows[0]!);
}

export interface ListMessagesParams {
  channel?: string;
  status?: string;
  limit: number;
}

export async function listMessages(
  projectId: string,
  params: ListMessagesParams,
): Promise<Page<AgentMessageSummary>> {
  const channel = params.channel ?? null;
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT id, project_id, channel, sender, recipient, trace_id, status, payload, created_at, acked_at
    FROM agent_messages
    WHERE project_id = ${projectId}
      AND (${channel}::text IS NULL OR channel = ${channel})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY created_at DESC, id DESC
    LIMIT ${params.limit + 1}
  `) as any[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

export async function acknowledgeMessage(
  projectId: string,
  id: string,
  status: "acknowledged" | "failed",
): Promise<AgentMessageSummary | null> {
  const rows = (await sql`
    UPDATE agent_messages
    SET status = ${status}, acked_at = now()
    WHERE project_id = ${projectId} AND id = ${id}
    RETURNING id, project_id, channel, sender, recipient, trace_id, status, payload, created_at, acked_at
  `) as any[];
  return rows[0] ? toSummary(rows[0]) : null;
}

function toSummary(r: any): AgentMessageSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    channel: r.channel,
    sender: r.sender,
    recipient: r.recipient ?? null,
    traceId: r.trace_id ?? null,
    status: r.status,
    payload: asObject(r.payload, {}),
    createdAt: iso(r.created_at),
    ackedAt: isoOrNull(r.acked_at),
  };
}
