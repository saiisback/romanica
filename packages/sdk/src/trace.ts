import { randomUUID } from "node:crypto";
import type { IngestTrace, SpanType, TraceStatus } from "@romanica/shared";
import { Span } from "./span.ts";
import { currentSpan, spanContext } from "./context.ts";

export class Trace {
  readonly traceId = randomUUID();
  name: string;
  status: TraceStatus = "running";
  readonly startTime: number;
  endTime?: number;
  metadata: Record<string, unknown> = {};
  readonly spans: Span[] = [];

  private ended = false;

  constructor(
    opts: { name: string; now: () => number; metadata?: Record<string, unknown> },
    private readonly now: () => number,
  ) {
    this.name = opts.name;
    this.startTime = now();
    if (opts.metadata) this.metadata = { ...opts.metadata };
  }

  setMetadata(meta: Record<string, unknown>): this {
    Object.assign(this.metadata, meta);
    return this;
  }

  setStatus(status: TraceStatus): this {
    this.status = status;
    return this;
  }

  /**
   * Run `fn` as a span. The span auto-nests under whatever span is currently
   * active (via AsyncLocalStorage), else it is a root span of this trace.
   * User errors are recorded and re-thrown — we observe, we never swallow.
   */
  async span<T>(
    type: SpanType,
    name: string,
    fn: (span: Span) => T | Promise<T>,
  ): Promise<T> {
    const parent = currentSpan();
    const span = new Span(this, {
      type,
      name,
      parentSpanId: parent?.spanId ?? null,
      now: this.now,
    });
    this.spans.push(span);
    try {
      return await spanContext.run(span, () => fn(span));
    } catch (err) {
      span.setError(err);
      this.status = "error";
      throw err;
    } finally {
      span.end(this.now);
    }
  }

  /**
   * Manually open a span (start/end style) — for auto-instrumentation adapters
   * that observe separate "start" and "end" events (e.g. LangChain callbacks)
   * and so cannot use the callback-scoped {@link span}. The caller owns the
   * lifecycle: call `span.finish()` (and `span.setError(...)` on failure).
   *
   * When `parentSpanId` is omitted it auto-nests under the active span (if any);
   * pass an explicit id (or `null` for a root span) to control nesting yourself.
   */
  startSpan(
    type: SpanType,
    name: string,
    opts?: { parentSpanId?: string | null },
  ): Span {
    const parentSpanId =
      opts && "parentSpanId" in opts
        ? (opts.parentSpanId ?? null)
        : (currentSpan()?.spanId ?? null);
    const span = new Span(this, { type, name, parentSpanId, now: this.now });
    this.spans.push(span);
    return span;
  }

  /** @internal */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = this.now();
    if (this.status === "running") this.status = "ok";
  }

  /** @internal */
  markError(): void {
    this.status = "error";
  }

  /** @internal */
  toWire(): IngestTrace {
    return {
      traceId: this.traceId,
      name: this.name,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      metadata: this.metadata,
      spans: this.spans.map((s) => s.toWire()),
    };
  }
}

/** Re-exported so adapters can mint ids consistently. */
export const newId = randomUUID;
