import {
  buildSpanTree,
  type CostAnalytics,
  type EvaluationAnalytics,
  type EvaluationCase,
  type EvaluationSignal,
  type LatencyAnalytics,
  type ModelRoutingAnalytics,
  type ModelRoutingCandidate,
  type Page,
  type SpanNode,
  type TraceDetail,
  type TraceSummary,
} from "@romanica/shared";
import { sql } from "./db.ts";
import { readBlob } from "./storage.ts";

// ---------- helpers ----------

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

function asObject<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    // Bun's PG driver already parses jsonb, so a string here is usually the
    // actual value (e.g. an LLM's bare-string output). Only treat it as encoded
    // JSON if it parses; otherwise keep the string rather than dropping it.
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

export function encodeCursor(startTime: Date, traceId: string): string {
  return Buffer.from(`${iso(startTime)}|${traceId}`).toString("base64url");
}
function decodeCursor(c: string | undefined): { time: Date; id: string } | null {
  if (!c) return null;
  try {
    const [t, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    if (!t || !id) return null;
    return { time: new Date(t), id };
  } catch {
    return null;
  }
}

// ---------- trace list ----------

export interface ListParams {
  status?: string;
  from: Date;
  to: Date;
  limit: number;
  cursor?: string;
}

export async function listTraces(
  projectId: string,
  params: ListParams,
): Promise<Page<TraceSummary>> {
  const status = params.status ?? null;
  const cursor = decodeCursor(params.cursor);
  const cursorTime = cursor?.time ?? null;
  const cursorId = cursor?.id ?? null;

  const rows = (await sql`
    SELECT trace_id, project_id, name, status, start_time, end_time,
           duration_ms, span_count, total_tokens, total_cost_usd
    FROM traces
    WHERE project_id = ${projectId}
      AND (${status}::text IS NULL OR status = ${status})
      AND start_time >= ${params.from} AND start_time <= ${params.to}
      AND (${cursorTime}::timestamptz IS NULL
           OR (start_time, trace_id) < (${cursorTime}::timestamptz, ${cursorId}::uuid))
    ORDER BY start_time DESC, trace_id DESC
    LIMIT ${params.limit + 1}
  `) as any[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  const items: TraceSummary[] = page.map((r) => ({
    traceId: r.trace_id,
    projectId: r.project_id,
    name: r.name,
    status: r.status,
    startTime: iso(r.start_time),
    endTime: isoOrNull(r.end_time),
    durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    spanCount: num(r.span_count),
    totalTokens: num(r.total_tokens),
    totalCostUsd: num(r.total_cost_usd),
  }));

  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.start_time, last.trace_id) : null,
  };
}

// ---------- trace detail (with span tree) ----------

export async function getTraceDetail(
  projectId: string,
  traceId: string,
): Promise<TraceDetail | null> {
  const traceRows = (await sql`
    SELECT trace_id, project_id, name, status, start_time, end_time,
           duration_ms, span_count, total_tokens, total_cost_usd, metadata
    FROM traces
    WHERE project_id = ${projectId} AND trace_id = ${traceId}
    LIMIT 1
  `) as any[];
  const t = traceRows[0];
  if (!t) return null;

  const spanRows = (await sql`
    SELECT span_id, parent_span_id, type, name, status, start_time, end_time,
           duration_ms, input, output, input_ref, output_ref, error, attributes
    FROM spans
    WHERE project_id = ${projectId} AND trace_id = ${traceId}
    ORDER BY start_time ASC
  `) as any[];

  const flat = await Promise.all(
    spanRows.map(async (s): Promise<Omit<SpanNode, "children">> => {
      const [input, output] = await Promise.all([
        s.input_ref ? readBlob(s.input_ref) : asObject(s.input, null),
        s.output_ref ? readBlob(s.output_ref) : asObject(s.output, null),
      ]);
      return {
        spanId: s.span_id,
        parentSpanId: s.parent_span_id ?? null,
        type: s.type,
        name: s.name,
        status: s.status,
        startTime: iso(s.start_time),
        endTime: isoOrNull(s.end_time),
        durationMs: s.duration_ms == null ? null : num(s.duration_ms),
        input: input ?? null,
        output: output ?? null,
        error: asObject(s.error, null),
        attributes: asObject(s.attributes, {}),
      };
    }),
  );

  return {
    traceId: t.trace_id,
    projectId: t.project_id,
    name: t.name,
    status: t.status,
    startTime: iso(t.start_time),
    endTime: isoOrNull(t.end_time),
    durationMs: t.duration_ms == null ? null : num(t.duration_ms),
    spanCount: num(t.span_count),
    totalTokens: num(t.total_tokens),
    totalCostUsd: num(t.total_cost_usd),
    metadata: asObject(t.metadata, {}),
    spans: buildSpanTree(flat),
  };
}

// ---------- analytics ----------

export interface RangeParams {
  from: Date;
  to: Date;
}

export async function costAnalytics(
  projectId: string,
  params: RangeParams & { bucket: "hour" | "day" },
): Promise<CostAnalytics> {
  // token count derived from attributes; cost from the per-span costUsd attribute
  const series = (await sql`
    SELECT date_trunc(${params.bucket}, start_time) AS bucket,
           COALESCE(SUM(
             COALESCE((attributes->>'totalTokens')::numeric,
               COALESCE((attributes->>'promptTokens')::numeric, 0)
               + COALESCE((attributes->>'completionTokens')::numeric, 0))
           ), 0) AS tokens,
           COALESCE(SUM(COALESCE((attributes->>'costUsd')::numeric, 0)), 0) AS cost
    FROM spans
    WHERE project_id = ${projectId} AND type = 'llm'
      AND start_time >= ${params.from} AND start_time <= ${params.to}
    GROUP BY 1 ORDER BY 1
  `) as any[];

  const byModel = (await sql`
    SELECT attributes->>'model' AS model,
           COALESCE(SUM(
             COALESCE((attributes->>'totalTokens')::numeric,
               COALESCE((attributes->>'promptTokens')::numeric, 0)
               + COALESCE((attributes->>'completionTokens')::numeric, 0))
           ), 0) AS tokens,
           COALESCE(SUM(COALESCE((attributes->>'costUsd')::numeric, 0)), 0) AS cost,
           COUNT(*) AS calls
    FROM spans
    WHERE project_id = ${projectId} AND type = 'llm'
      AND attributes->>'model' IS NOT NULL
      AND start_time >= ${params.from} AND start_time <= ${params.to}
    GROUP BY 1 ORDER BY cost DESC
  `) as any[];

  const seriesOut = series.map((r) => ({
    bucket: iso(r.bucket),
    tokens: num(r.tokens),
    costUsd: num(r.cost),
  }));

  return {
    totalTokens: seriesOut.reduce((s, b) => s + b.tokens, 0),
    totalCostUsd: seriesOut.reduce((s, b) => s + b.costUsd, 0),
    series: seriesOut,
    byModel: byModel.map((r) => ({
      model: r.model,
      tokens: num(r.tokens),
      costUsd: num(r.cost),
      calls: num(r.calls),
    })),
  };
}

export async function latencyAnalytics(
  projectId: string,
  params: RangeParams,
): Promise<LatencyAnalytics> {
  const traceRows = (await sql`
    SELECT
      COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms), 0) AS p50,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95,
      COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0) AS p99
    FROM traces
    WHERE project_id = ${projectId} AND duration_ms IS NOT NULL
      AND start_time >= ${params.from} AND start_time <= ${params.to}
  `) as any[];

  const byTypeRows = (await sql`
    SELECT type,
      COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms), 0) AS p50,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95,
      COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0) AS p99,
      COUNT(*) AS count
    FROM spans
    WHERE project_id = ${projectId} AND duration_ms IS NOT NULL
      AND start_time >= ${params.from} AND start_time <= ${params.to}
    GROUP BY type ORDER BY p95 DESC
  `) as any[];

  const t = traceRows[0] ?? {};
  return {
    traceP50Ms: num(t.p50),
    traceP95Ms: num(t.p95),
    traceP99Ms: num(t.p99),
    byType: byTypeRows.map((r) => ({
      type: r.type,
      p50Ms: num(r.p50),
      p95Ms: num(r.p95),
      p99Ms: num(r.p99),
      count: num(r.count),
    })),
  };
}

// ---------- model routing (Layer 5 seed) ----------

export async function modelRoutingAnalytics(
  projectId: string,
  params: RangeParams,
): Promise<ModelRoutingAnalytics> {
  const rows = (await sql`
    SELECT attributes->>'model' AS model,
      COUNT(*) AS calls,
      AVG(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_rate,
      COALESCE(AVG(duration_ms), 0) AS avg_latency,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95_latency,
      COALESCE(AVG(COALESCE((attributes->>'costUsd')::numeric, 0)), 0) AS avg_cost,
      COALESCE(AVG(
        COALESCE((attributes->>'totalTokens')::numeric,
          COALESCE((attributes->>'promptTokens')::numeric, 0)
          + COALESCE((attributes->>'completionTokens')::numeric, 0))
      ), 0) AS avg_tokens
    FROM spans
    WHERE project_id = ${projectId} AND type = 'llm'
      AND attributes->>'model' IS NOT NULL
      AND start_time >= ${params.from} AND start_time <= ${params.to}
    GROUP BY 1
  `) as any[];

  const raw = rows.map((r) => ({
    model: String(r.model),
    calls: num(r.calls),
    errorRate: num(r.error_rate),
    avgLatencyMs: num(r.avg_latency),
    p95LatencyMs: num(r.p95_latency),
    avgCostUsd: num(r.avg_cost),
    avgTokens: num(r.avg_tokens),
  }));

  const maxCost = Math.max(...raw.map((r) => r.avgCostUsd), 0.000001);
  const maxP95 = Math.max(...raw.map((r) => r.p95LatencyMs), 1);

  const candidates: ModelRoutingCandidate[] = raw
    .map((r) => {
      const score =
        (r.avgCostUsd / maxCost) * 0.35 +
        (r.p95LatencyMs / maxP95) * 0.35 +
        r.errorRate * 0.3;
      const recommendation: ModelRoutingCandidate["recommendation"] =
        r.errorRate >= 0.2
          ? "risky"
          : r.avgCostUsd / maxCost >= 0.85 && raw.length > 1
            ? "expensive"
            : score <= 0.45
              ? "preferred"
              : "balanced";
      return { ...r, score: Number(score.toFixed(4)), recommendation };
    })
    .sort((a, b) => a.score - b.score || b.calls - a.calls || a.model.localeCompare(b.model));

  return {
    window: { from: params.from.toISOString(), to: params.to.toISOString() },
    candidates,
  };
}

// ---------- evaluation (Layer 9 seed) ----------

export async function evaluationAnalytics(
  projectId: string,
  params: RangeParams & { limit: number },
): Promise<EvaluationAnalytics> {
  const traceRows = (await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'error') AS failed,
      COUNT(*) FILTER (WHERE metadata->>'kind' = 'replay') AS replay_traces,
      COUNT(DISTINCT metadata->>'replayOf') FILTER (WHERE metadata->>'replayOf' IS NOT NULL) AS replayed_sources
    FROM traces
    WHERE project_id = ${projectId}
      AND start_time >= ${params.from} AND start_time <= ${params.to}
  `) as any[];
  const totals = traceRows[0] ?? {};
  const totalTraces = num(totals.total);
  const failedTraces = num(totals.failed);
  const replayTraces = num(totals.replay_traces);
  const replayedSources = num(totals.replayed_sources);

  const signalRows = (await sql`
    (
      SELECT 'trace_failure' AS kind, t.trace_id, NULL::uuid AS span_id, t.name,
             'high' AS severity, 'trace finished with error status' AS message,
             t.start_time AS sort_time
      FROM traces t
      WHERE t.project_id = ${projectId} AND t.status = 'error'
        AND t.start_time >= ${params.from} AND t.start_time <= ${params.to}
    )
    UNION ALL
    (
      SELECT 'span_error' AS kind, s.trace_id, s.span_id, s.name,
             'high' AS severity, COALESCE(s.error->>'message', 'span finished with error status') AS message,
             s.start_time AS sort_time
      FROM spans s
      WHERE s.project_id = ${projectId} AND s.status = 'error'
        AND s.start_time >= ${params.from} AND s.start_time <= ${params.to}
    )
    UNION ALL
    (
      SELECT 'slow_span' AS kind, s.trace_id, s.span_id, s.name,
             'medium' AS severity, ('slow span: ' || s.duration_ms || 'ms') AS message,
             s.start_time AS sort_time
      FROM spans s
      WHERE s.project_id = ${projectId} AND s.duration_ms >= 5000
        AND s.start_time >= ${params.from} AND s.start_time <= ${params.to}
    )
    ORDER BY sort_time DESC
    LIMIT ${params.limit}
  `) as any[];

  const caseRows = (await sql`
    SELECT s.trace_id, s.span_id, s.name, s.input, s.output, s.attributes, t.metadata
    FROM spans s
    JOIN traces t ON t.trace_id = s.trace_id
    WHERE s.project_id = ${projectId} AND s.type = 'llm'
      AND s.input IS NOT NULL AND s.output IS NOT NULL
      AND s.start_time >= ${params.from} AND s.start_time <= ${params.to}
      AND COALESCE(t.metadata->>'kind', '') <> 'replay'
    ORDER BY s.start_time DESC
    LIMIT ${params.limit}
  `) as any[];

  const signals: EvaluationSignal[] = signalRows.map((r) => ({
    kind: r.kind,
    traceId: r.trace_id,
    spanId: r.span_id ?? undefined,
    name: r.name,
    severity: r.severity,
    message: r.message,
  }));

  const cases: EvaluationCase[] = caseRows.map((r) => {
    const attributes = asObject<Record<string, unknown>>(r.attributes, {});
    return {
      traceId: r.trace_id,
      spanId: r.span_id,
      name: r.name,
      model: typeof attributes.model === "string" ? attributes.model : null,
      input: asObject(r.input, null),
      expectedOutput: asObject(r.output, null),
      metadata: asObject(r.metadata, {}),
    };
  });

  return {
    window: { from: params.from.toISOString(), to: params.to.toISOString() },
    totalTraces,
    failedTraces,
    failureRate: totalTraces === 0 ? 0 : failedTraces / totalTraces,
    replayTraces,
    replayCoverage: totalTraces === 0 ? 0 : replayedSources / totalTraces,
    signals,
    cases,
  };
}
