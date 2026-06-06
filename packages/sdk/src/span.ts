import { randomUUID } from "node:crypto";
import {
  estimateCostUsd,
  type IngestSpan,
  type SpanError,
  type SpanStatus,
  type SpanType,
} from "@romanica/shared";
import { spanContext } from "./context.ts";
import type { Trace } from "./trace.ts";

/** Flexible token-usage shapes we accept from provider SDKs. */
interface UsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SetLLMArgs {
  model?: string;
  provider?: string;
  usage?: UsageLike;
  promptTokens?: number;
  completionTokens?: number;
  /** explicit cost overrides the estimate */
  costUsd?: number;
  temperature?: number;
  toolCalls?: number;
}

export class Span {
  readonly spanId = randomUUID();
  readonly type: SpanType;
  name: string;
  parentSpanId: string | null;
  status: SpanStatus = "ok";
  readonly startTime: number;
  endTime?: number;
  input?: unknown;
  output?: unknown;
  error: SpanError | null = null;
  attributes: Record<string, unknown> = {};

  private ended = false;
  private readonly now: () => number;

  constructor(
    private readonly trace: Trace,
    opts: { type: SpanType; name: string; parentSpanId: string | null; now: () => number },
  ) {
    this.type = opts.type;
    this.name = opts.name;
    this.parentSpanId = opts.parentSpanId;
    this.now = opts.now;
    this.startTime = opts.now();
  }

  setInput(input: unknown): this {
    this.input = input;
    return this;
  }

  setOutput(output: unknown): this {
    this.output = output;
    return this;
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, unknown>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  /** Record an error on the span (also flips status to "error"). */
  setError(err: unknown): this {
    this.status = "error";
    this.error = toSpanError(err);
    return this;
  }

  /** Set the well-known LLM attributes; estimates cost if not given a model price. */
  setLLM(args: SetLLMArgs): this {
    const promptTokens =
      args.promptTokens ??
      args.usage?.prompt_tokens ??
      args.usage?.promptTokens ??
      args.usage?.inputTokens;
    const completionTokens =
      args.completionTokens ??
      args.usage?.completion_tokens ??
      args.usage?.completionTokens ??
      args.usage?.outputTokens;
    const summed = (promptTokens ?? 0) + (completionTokens ?? 0);
    const totalTokens =
      args.usage?.total_tokens ??
      args.usage?.totalTokens ??
      (summed > 0 ? summed : undefined);

    const costUsd =
      args.costUsd ?? estimateCostUsd(args.model, promptTokens ?? 0, completionTokens ?? 0);

    return this.setAttributes(
      pruneUndefined({
        model: args.model,
        provider: args.provider,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        temperature: args.temperature,
        toolCalls: args.toolCalls,
      }),
    );
  }

  setTool(args: { toolName?: string; args?: unknown; result?: unknown }): this {
    return this.setAttributes(pruneUndefined({ toolName: args.toolName }))
      .setInput(args.args ?? this.input)
      .setOutput(args.result ?? this.output);
  }

  setRetrieval(args: {
    query?: string;
    topK?: number;
    documents?: Array<{ id: string; score?: number }>;
  }): this {
    return this.setAttributes(
      pruneUndefined({ query: args.query, topK: args.topK, documents: args.documents }),
    );
  }

  /** Create an explicitly-nested child span. */
  span<T>(type: SpanType, name: string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    // Run inside this span's context so the child attaches as our child.
    return spanContext.run(this, () => this.trace.span(type, name, fn));
  }

  /**
   * Close the span and stamp its end time (idempotent). Used by manual
   * (start/end-style) instrumentation such as the LangChain callback handler,
   * where a span is opened and closed across separate events rather than around
   * a single callback.
   */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = this.now();
  }

  /** @internal close the span; `now` override kept for the callback-scoped path. */
  end(now: () => number = this.now): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = now();
  }

  /** @internal serialize to the ingest wire shape. */
  toWire(): IngestSpan {
    return {
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      type: this.type,
      name: this.name,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      input: this.input,
      output: this.output,
      error: this.error,
      attributes: this.attributes,
    };
  }
}

export function toSpanError(err: unknown): SpanError {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: typeof err === "string" ? err : JSON.stringify(err) };
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}
