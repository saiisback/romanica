import { estimateCostUsd, type IngestSpan, type IngestTrace } from "@romanica/shared";

export interface TraceRollup {
  totalTokens: number;
  totalCostUsd: number;
  spanCount: number;
  durationMs: number | null;
}

/** Roll span-level token/cost up to the trace, mirroring SDK helper semantics. */
export function rollupTrace(trace: IngestTrace): TraceRollup {
  let totalTokens = 0;
  let totalCostUsd = 0;

  for (const span of trace.spans) {
    if (span.type !== "llm") continue;
    const a = span.attributes as Record<string, unknown>;

    const prompt = num(a.promptTokens);
    const completion = num(a.completionTokens);
    const total = num(a.totalTokens) ?? (prompt ?? 0) + (completion ?? 0);
    totalTokens += total;

    const cost =
      num(a.costUsd) ?? estimateCostUsd(str(a.model), prompt ?? 0, completion ?? 0);
    totalCostUsd += cost;
  }

  return {
    totalTokens,
    totalCostUsd,
    spanCount: trace.spans.length,
    durationMs: durationMs(trace.startTime, trace.endTime),
  };
}

export function durationMs(start: number, end: number | undefined): number | null {
  if (end === undefined) return null;
  return Math.max(0, end - start);
}

export function spanDurationMs(span: IngestSpan): number | null {
  return durationMs(span.startTime, span.endTime);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
