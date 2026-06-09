import type { MemorySearchResult, MemorySummary, Page, SearchMemories, UpsertMemory } from "@romanica/shared";
import { sql } from "./db.ts";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const dateOrNull = (v: string | undefined): Date | null => (v ? new Date(v) : null);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

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

export async function upsertMemory(
  projectId: string,
  memory: UpsertMemory,
): Promise<MemorySummary> {
  const rows = (await sql`
    INSERT INTO memories (
      project_id, scope, kind, key, content, source_type, source_id,
      confidence, expires_at, metadata
    ) VALUES (
      ${projectId},
      ${memory.scope},
      ${memory.kind},
      ${memory.key},
      ${memory.content},
      ${memory.sourceType ?? null},
      ${memory.sourceId ?? null},
      ${memory.confidence ?? null},
      ${dateOrNull(memory.expiresAt)},
      ${memory.metadata}
    )
    ON CONFLICT (project_id, scope, kind, key) DO UPDATE SET
      content = EXCLUDED.content,
      source_type = EXCLUDED.source_type,
      source_id = EXCLUDED.source_id,
      confidence = EXCLUDED.confidence,
      expires_at = EXCLUDED.expires_at,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id, project_id, scope, kind, key, content, source_type, source_id,
      confidence, expires_at, metadata, created_at, updated_at
  `) as any[];
  return toSummary(rows[0]!);
}

export async function listMemories(
  projectId: string,
  params: { kind?: string; scope?: string; limit: number },
): Promise<Page<MemorySummary>> {
  const kind = params.kind ?? null;
  const scope = params.scope ?? null;
  const rows = (await sql`
    SELECT id, project_id, scope, kind, key, content, source_type, source_id,
      confidence, expires_at, metadata, created_at, updated_at
    FROM memories
    WHERE project_id = ${projectId}
      AND (${kind}::text IS NULL OR kind = ${kind})
      AND (${scope}::text IS NULL OR scope = ${scope})
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY updated_at DESC, id DESC
    LIMIT ${params.limit + 1}
  `) as any[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

export async function getMemory(projectId: string, id: string): Promise<MemorySummary | null> {
  const rows = (await sql`
    SELECT id, project_id, scope, kind, key, content, source_type, source_id,
      confidence, expires_at, metadata, created_at, updated_at
    FROM memories
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `) as any[];
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function searchMemories(
  projectId: string,
  params: SearchMemories,
): Promise<{ items: MemorySearchResult[] }> {
  const query = params.query.trim();
  const needle = query.toLowerCase();
  const kind = params.kind ?? null;
  const scope = params.scope ?? null;
  const rows = (await sql`
    SELECT id, project_id, scope, kind, key, content, source_type, source_id,
      confidence, expires_at, metadata, created_at, updated_at,
      (
        CASE WHEN lower(key) = lower(${query}) THEN 8 ELSE 0 END
        + CASE WHEN lower(key) LIKE '%' || lower(${query}) || '%' THEN 4 ELSE 0 END
        + CASE WHEN lower(content::text) LIKE '%' || lower(${query}) || '%' THEN 3 ELSE 0 END
        + CASE WHEN lower(COALESCE(source_type, '')) LIKE '%' || lower(${query}) || '%' THEN 1 ELSE 0 END
        + CASE WHEN lower(COALESCE(source_id, '')) LIKE '%' || lower(${query}) || '%' THEN 1 ELSE 0 END
        + CASE WHEN lower(metadata::text) LIKE '%' || lower(${query}) || '%' THEN 1 ELSE 0 END
      ) AS match_score
    FROM memories
    WHERE project_id = ${projectId}
      AND (${kind}::text IS NULL OR kind = ${kind})
      AND (${scope}::text IS NULL OR scope = ${scope})
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        lower(key) LIKE '%' || lower(${query}) || '%'
        OR lower(content::text) LIKE '%' || lower(${query}) || '%'
        OR lower(COALESCE(source_type, '')) LIKE '%' || lower(${query}) || '%'
        OR lower(COALESCE(source_id, '')) LIKE '%' || lower(${query}) || '%'
        OR lower(metadata::text) LIKE '%' || lower(${query}) || '%'
      )
    ORDER BY match_score DESC, confidence DESC NULLS LAST, updated_at DESC, id DESC
    LIMIT ${params.limit * 3}
  `) as any[];

  const now = Date.now();
  const scored = rows
    .map((row) => {
      const memory = toSummary(row);
      const ageDays = Math.max(0, (now - new Date(memory.updatedAt).getTime()) / 86_400_000);
      const freshness = 1 / (1 + ageDays / 30);
      const confidence = memory.confidence ?? 0.5;
      const exactBonus = memory.key.toLowerCase() === needle ? 2 : 0;
      const score = Number((Number(row.match_score) + confidence * 2 + freshness + exactBonus).toFixed(4));
      return { ...memory, score };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, params.limit)
    .map((memory, idx) => ({ ...memory, rank: idx + 1 }));

  return { items: scored };
}

function toSummary(r: any): MemorySummary {
  return {
    id: r.id,
    projectId: r.project_id,
    scope: r.scope,
    kind: r.kind,
    key: r.key,
    content: asObject(r.content, null),
    sourceType: r.source_type ?? null,
    sourceId: r.source_id ?? null,
    confidence: numOrNull(r.confidence),
    expiresAt: isoOrNull(r.expires_at),
    metadata: asObject(r.metadata, {}),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
