import type { AuditEventSummary, Page } from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function asObject<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export interface AuditEventInput {
  projectId: string;
  actorType?: "api_key" | "system";
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  await sql`
    INSERT INTO audit_events (project_id, actor_type, action, target_type, target_id, metadata)
    VALUES (
      ${input.projectId},
      ${input.actorType ?? "api_key"},
      ${input.action},
      ${input.targetType},
      ${input.targetId ?? null},
      ${input.metadata ?? {}}
    )
  `;
}

export interface ListAuditParams {
  action?: string;
  limit: number;
}

export async function listAuditEvents(
  projectId: string,
  params: ListAuditParams,
): Promise<Page<AuditEventSummary>> {
  const action = params.action ?? null;
  const rows = (await sql`
    SELECT id, project_id, actor_type, action, target_type, target_id, metadata, created_at
    FROM audit_events
    WHERE project_id = ${projectId}
      AND (${action}::text IS NULL OR action = ${action})
    ORDER BY created_at DESC, id DESC
    LIMIT ${params.limit + 1}
  `) as any[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    items: page.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      actorType: r.actor_type,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id ?? null,
      metadata: asObject(r.metadata, {}),
      createdAt: iso(r.created_at),
    })),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}
