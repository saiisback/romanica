import { AsyncLocalStorage } from "node:async_hooks";
import type { Span } from "./span.ts";
import type { Trace } from "./trace.ts";

/**
 * Tracks the currently-active span so `trace.span(...)` nested inside another
 * span auto-attaches as its child — the user never has to thread parent ids.
 */
export const spanContext = new AsyncLocalStorage<Span>();

export function currentSpan(): Span | undefined {
  return spanContext.getStore();
}

/**
 * Tracks the currently-active trace for the duration of `client.trace(...)`.
 * Auto-instrumentation adapters (e.g. {@link wrapAISDK}) read this so a model
 * wrapped once emits spans into whatever trace happens to be running.
 */
export const traceContext = new AsyncLocalStorage<Trace>();

export function currentTrace(): Trace | undefined {
  return traceContext.getStore();
}
