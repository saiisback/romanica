import type { SpanType, SpanStatus, TraceStatus } from "./enums.ts";
import type { SpanAttributes } from "./attributes.ts";
import type { SpanError } from "./wire.ts";

/**
 * Query-API output shapes (what the dashboard consumes).
 * Timestamps are ISO-8601 strings here (display-friendly); the ingest wire
 * format uses epoch ms (runtime-friendly). Durations are milliseconds.
 */

export interface TraceSummary {
  traceId: string;
  projectId: string;
  name: string;
  status: TraceStatus;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  spanCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

/** A span enriched for display, with its children nested (the trace tree). */
export interface SpanNode {
  spanId: string;
  parentSpanId: string | null;
  type: SpanType;
  name: string;
  status: SpanStatus;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: SpanError | null;
  attributes: SpanAttributes;
  children: SpanNode[];
}

export interface TraceDetail extends TraceSummary {
  metadata: Record<string, unknown>;
  /** root spans (parentSpanId === null), each with nested children */
  spans: SpanNode[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// --- analytics ---

export interface CostBucket {
  /** ISO date or hour bucket */
  bucket: string;
  tokens: number;
  costUsd: number;
}

export interface CostByModel {
  model: string;
  tokens: number;
  costUsd: number;
  calls: number;
}

export interface CostAnalytics {
  totalTokens: number;
  totalCostUsd: number;
  series: CostBucket[];
  byModel: CostByModel[];
}

export interface LatencyByType {
  type: SpanType;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  count: number;
}

export interface LatencyAnalytics {
  traceP50Ms: number;
  traceP95Ms: number;
  traceP99Ms: number;
  byType: LatencyByType[];
}
