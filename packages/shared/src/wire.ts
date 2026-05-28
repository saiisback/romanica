import { z } from "zod";
import { spanTypeSchema, spanStatusSchema, traceStatusSchema } from "./enums.ts";

/**
 * The wire format: exactly what the SDK sends to `POST /v1/traces`.
 *
 * Conventions:
 *  - ids are client-generated UUIDs (the SDK owns id generation so it can build
 *    the parent/child tree before export).
 *  - timestamps are epoch milliseconds (numbers) — unambiguous across runtimes.
 *  - `project` is NOT in the payload; it is resolved from the API key.
 *  - we are liberal in what we accept: attributes/metadata are open bags and
 *    input/output are arbitrary JSON, so a user's span is never rejected over
 *    an unexpected field. Observability must never break the user's app.
 */

const epochMs = z.number().int().nonnegative();

export const spanErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
});
export type SpanError = z.infer<typeof spanErrorSchema>;

export const ingestSpanSchema = z.object({
  spanId: z.string().uuid(),
  parentSpanId: z.string().uuid().nullish(),
  type: spanTypeSchema,
  name: z.string().min(1).max(512),
  status: spanStatusSchema.default("ok"),
  startTime: epochMs,
  endTime: epochMs.optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: spanErrorSchema.nullish(),
  attributes: z.record(z.unknown()).default({}),
});
export type IngestSpan = z.infer<typeof ingestSpanSchema>;

export const ingestTraceSchema = z.object({
  traceId: z.string().uuid(),
  name: z.string().min(1).max(512),
  status: traceStatusSchema.default("running"),
  startTime: epochMs,
  endTime: epochMs.optional(),
  metadata: z.record(z.unknown()).default({}),
  spans: z.array(ingestSpanSchema).max(10_000),
});
export type IngestTrace = z.infer<typeof ingestTraceSchema>;

export const ingestPayloadSchema = z.object({
  traces: z.array(ingestTraceSchema).min(1).max(1000),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export const ingestResponseSchema = z.object({
  ok: z.literal(true),
  tracesReceived: z.number().int(),
  spansReceived: z.number().int(),
});
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
