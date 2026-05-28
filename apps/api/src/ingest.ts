import type { IngestPayload } from "@romanica/shared";
import { sql } from "./db.ts";
import { storeBlob } from "./storage.ts";
import { rollupTrace, spanDurationMs } from "./rollup.ts";

/**
 * Bind any JSON value to a jsonb column.
 * Bun sends objects/arrays/strings as untyped params that coerce straight into
 * jsonb; numbers/booleans must go through `to_jsonb()`. null/undefined -> NULL.
 */
const jb = (v: unknown) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return sql`to_jsonb(${v})`;
  return v;
};

const ts = (ms: number | undefined): Date | null => (ms === undefined ? null : new Date(ms));

export interface IngestResult {
  tracesReceived: number;
  spansReceived: number;
}

/**
 * Persist a validated payload for a project.
 * Large span input/output is offloaded to object storage first (non-transactional),
 * then trace + span rows are written in a per-trace transaction.
 */
export async function ingestPayload(
  projectId: string,
  payload: IngestPayload,
): Promise<IngestResult> {
  let spansReceived = 0;

  for (const trace of payload.traces) {
    const rollup = rollupTrace(trace);

    // offload big blobs up front (S3 is not part of the DB transaction)
    const prepared = await Promise.all(
      trace.spans.map(async (span) => {
        const base = `${projectId}/${trace.traceId}/${span.spanId}`;
        const [input, output] = await Promise.all([
          storeBlob(span.input, `${base}/in.json`),
          storeBlob(span.output, `${base}/out.json`),
        ]);
        return { span, input, output };
      }),
    );

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO traces (
          trace_id, project_id, name, status, start_time, end_time,
          duration_ms, metadata, total_tokens, total_cost_usd, span_count
        ) VALUES (
          ${trace.traceId}, ${projectId}, ${trace.name}, ${trace.status},
          ${new Date(trace.startTime)}, ${ts(trace.endTime)}, ${rollup.durationMs},
          ${jb(trace.metadata)}, ${rollup.totalTokens}, ${rollup.totalCostUsd},
          ${rollup.spanCount}
        )
        ON CONFLICT (trace_id) DO UPDATE SET
          name           = EXCLUDED.name,
          status         = EXCLUDED.status,
          end_time       = EXCLUDED.end_time,
          duration_ms    = EXCLUDED.duration_ms,
          metadata       = EXCLUDED.metadata,
          total_tokens   = EXCLUDED.total_tokens,
          total_cost_usd = EXCLUDED.total_cost_usd,
          span_count     = EXCLUDED.span_count
      `;

      for (const { span, input, output } of prepared) {
        await tx`
          INSERT INTO spans (
            span_id, trace_id, project_id, parent_span_id, type, name, status,
            start_time, end_time, duration_ms,
            input, output, input_ref, output_ref, error, attributes
          ) VALUES (
            ${span.spanId}, ${trace.traceId}, ${projectId}, ${span.parentSpanId ?? null},
            ${span.type}, ${span.name}, ${span.status},
            ${new Date(span.startTime)}, ${ts(span.endTime)}, ${spanDurationMs(span)},
            ${jb(input.inline)}, ${jb(output.inline)},
            ${input.ref}, ${output.ref},
            ${jb(span.error ?? null)}, ${jb(span.attributes)}
          )
          ON CONFLICT (span_id) DO UPDATE SET
            parent_span_id = EXCLUDED.parent_span_id,
            type           = EXCLUDED.type,
            name           = EXCLUDED.name,
            status         = EXCLUDED.status,
            end_time       = EXCLUDED.end_time,
            duration_ms    = EXCLUDED.duration_ms,
            input          = EXCLUDED.input,
            output         = EXCLUDED.output,
            input_ref      = EXCLUDED.input_ref,
            output_ref     = EXCLUDED.output_ref,
            error          = EXCLUDED.error,
            attributes     = EXCLUDED.attributes
        `;
      }
    });

    spansReceived += trace.spans.length;
  }

  return { tracesReceived: payload.traces.length, spansReceived };
}
