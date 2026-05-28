import { AsyncLocalStorage } from "node:async_hooks";
import type { Span } from "./span.ts";

/**
 * Tracks the currently-active span so `trace.span(...)` nested inside another
 * span auto-attaches as its child — the user never has to thread parent ids.
 */
export const spanContext = new AsyncLocalStorage<Span>();

export function currentSpan(): Span | undefined {
  return spanContext.getStore();
}
