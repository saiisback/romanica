import { z } from "zod";

/** The kind of step a span represents. */
export const spanTypes = ["llm", "tool", "retrieval", "agent", "custom"] as const;
export const spanTypeSchema = z.enum(spanTypes);
export type SpanType = (typeof spanTypes)[number];

/** Outcome of a single span. */
export const spanStatuses = ["ok", "error"] as const;
export const spanStatusSchema = z.enum(spanStatuses);
export type SpanStatus = (typeof spanStatuses)[number];

/** Outcome of a full trace. `running` = not yet finished / never closed. */
export const traceStatuses = ["ok", "error", "running"] as const;
export const traceStatusSchema = z.enum(traceStatuses);
export type TraceStatus = (typeof traceStatuses)[number];
