import type {
  ApprovalSummary,
  CreateApproval,
  DecideApproval,
  Page,
} from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const dateOrNull = (v: string | undefined): Date | null => (v ? new Date(v) : null);

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

export async function createApproval(
  projectId: string,
  approval: CreateApproval,
): Promise<ApprovalSummary> {
  const rows = (await sql`
    INSERT INTO approvals (
      project_id, title, requester, assignee, target_type, target_id, payload, due_at
    ) VALUES (
      ${projectId},
      ${approval.title},
      ${approval.requester},
      ${approval.assignee ?? null},
      ${approval.targetType ?? null},
      ${approval.targetId ?? null},
      ${approval.payload},
      ${dateOrNull(approval.dueAt)}
    )
    RETURNING id, project_id, title, status, requester, assignee, target_type, target_id,
      payload, decision, due_at, decided_at, created_at, updated_at
  `) as any[];
  return toSummary(rows[0]!);
}

export async function listApprovals(
  projectId: string,
  params: { status?: string; limit: number },
): Promise<Page<ApprovalSummary>> {
  const status = params.status ?? null;
  const rows = (await sql`
    SELECT id, project_id, title, status, requester, assignee, target_type, target_id,
      payload, decision, due_at, decided_at, created_at, updated_at
    FROM approvals
    WHERE project_id = ${projectId}
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

export async function decideApproval(
  projectId: string,
  id: string,
  decision: DecideApproval,
): Promise<ApprovalSummary | null> {
  const rows = (await sql`
    UPDATE approvals
    SET status = ${decision.status},
      decision = ${{
        reviewer: decision.reviewer,
        reason: decision.reason,
        output: decision.output,
      }},
      decided_at = now(),
      updated_at = now()
    WHERE project_id = ${projectId} AND id = ${id} AND status = 'pending'
    RETURNING id, project_id, title, status, requester, assignee, target_type, target_id,
      payload, decision, due_at, decided_at, created_at, updated_at
  `) as any[];
  return rows[0] ? toSummary(rows[0]) : null;
}

function toSummary(r: any): ApprovalSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    requester: r.requester,
    assignee: r.assignee ?? null,
    targetType: r.target_type ?? null,
    targetId: r.target_id ?? null,
    payload: asObject(r.payload, {}),
    decision: asObject(r.decision, null),
    dueAt: isoOrNull(r.due_at),
    decidedAt: isoOrNull(r.decided_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
