/**
 * Auto-instrumentation for LangChain.js.
 *
 * Build a callback handler and pass it to any runnable; LangChain's start/end
 * events become a Romanica span tree (chains → `agent`, models → `llm`, tools →
 * `tool`, retrievers → `retrieval`), nested via LangChain's own run ids.
 *
 * ```ts
 * import { romanicaTracer } from "@romanica/sdk/langchain";
 * await romanica.trace("run", async () => {
 *   await chain.invoke(input, { callbacks: [romanicaTracer()] });
 * });
 * ```
 *
 * `romanicaTracer()` resolves the active trace automatically; pass one
 * explicitly — `romanicaTracer(trace)` — to bind to a specific run.
 *
 * The returned object is a plain LangChain `CallbackHandlerMethods` bag, so we
 * take no dependency on `langchain` itself.
 */
import { currentTrace } from "../context.ts";
import type { Trace } from "../trace.ts";
import type { Span } from "../span.ts";

type Dict = Record<string, unknown>;

/** A LangChain LLMResult (the bits we read). */
interface LLMResult {
  generations?: Array<Array<{ text?: string; message?: Dict }>>;
  llmOutput?: Dict;
}

export interface RomanicaTracer {
  handleChainStart(chain: unknown, inputs: unknown, runId: string, parentRunId?: string): void;
  handleChainEnd(outputs: unknown, runId: string): void;
  handleChainError(err: unknown, runId: string): void;
  handleLLMStart(
    llm: unknown,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Dict,
  ): void;
  handleChatModelStart(
    llm: unknown,
    messages: unknown,
    runId: string,
    parentRunId?: string,
    extraParams?: Dict,
  ): void;
  handleLLMEnd(output: LLMResult, runId: string): void;
  handleLLMError(err: unknown, runId: string): void;
  handleToolStart(
    tool: unknown,
    input: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Dict,
    name?: string,
  ): void;
  handleToolEnd(output: unknown, runId: string): void;
  handleToolError(err: unknown, runId: string): void;
  handleRetrieverStart(retriever: unknown, query: string, runId: string, parentRunId?: string): void;
  handleRetrieverEnd(documents: unknown, runId: string): void;
  handleRetrieverError(err: unknown, runId: string): void;
}

/**
 * Create a LangChain callback handler that records spans into `trace`
 * (or the active trace if omitted). Pass it via `{ callbacks: [tracer] }`.
 */
export function romanicaTracer(trace?: Trace): RomanicaTracer {
  const open = new Map<string, Span>();
  const resolve = (): Trace | undefined => trace ?? currentTrace();

  function start(
    type: "agent" | "llm" | "tool" | "retrieval",
    name: string,
    runId: string,
    parentRunId: string | undefined,
    init?: (span: Span) => void,
  ): void {
    const tr = resolve();
    if (!tr) return;
    const parentSpanId = parentRunId ? (open.get(parentRunId)?.spanId ?? null) : null;
    const span = tr.startSpan(type, name, { parentSpanId });
    init?.(span);
    open.set(runId, span);
  }

  function end(runId: string, finalize?: (span: Span) => void): void {
    const span = open.get(runId);
    if (!span) return;
    finalize?.(span);
    span.finish();
    open.delete(runId);
  }

  function fail(runId: string, err: unknown): void {
    const span = open.get(runId);
    if (!span) return;
    span.setError(err);
    resolve()?.markError();
    span.finish();
    open.delete(runId);
  }

  return {
    handleChainStart(chain, inputs, runId, parentRunId) {
      start("agent", lastId(chain) ?? "chain", runId, parentRunId, (s) => s.setInput(inputs));
    },
    handleChainEnd(outputs, runId) {
      end(runId, (s) => s.setOutput(outputs));
    },
    handleChainError(err, runId) {
      fail(runId, err);
    },

    handleLLMStart(llm, prompts, runId, parentRunId, extraParams) {
      const model = modelName(extraParams) ?? lastId(llm) ?? "llm";
      start("llm", model, runId, parentRunId, (s) => {
        s.setInput(prompts);
        s.setAttribute("model", model);
      });
    },
    handleChatModelStart(llm, messages, runId, parentRunId, extraParams) {
      const model = modelName(extraParams) ?? lastId(llm) ?? "chat";
      start("llm", model, runId, parentRunId, (s) => {
        s.setInput(messages);
        s.setAttribute("model", model);
      });
    },
    handleLLMEnd(output, runId) {
      end(runId, (s) => {
        const model = typeof s.attributes.model === "string" ? s.attributes.model : undefined;
        s.setLLM({ model, usage: tokenUsage(output) });
        s.setOutput(firstText(output) ?? output.llmOutput ?? null);
      });
    },
    handleLLMError(err, runId) {
      fail(runId, err);
    },

    handleToolStart(tool, input, runId, parentRunId, _tags, _metadata, name) {
      const tn = name ?? lastId(tool) ?? "tool";
      start("tool", tn, runId, parentRunId, (s) => {
        s.setInput(input);
        s.setAttribute("toolName", tn);
      });
    },
    handleToolEnd(output, runId) {
      end(runId, (s) => s.setOutput(output));
    },
    handleToolError(err, runId) {
      fail(runId, err);
    },

    handleRetrieverStart(_retriever, query, runId, parentRunId) {
      start("retrieval", "retriever", runId, parentRunId, (s) => s.setRetrieval({ query }));
    },
    handleRetrieverEnd(documents, runId) {
      end(runId, (s) => s.setOutput(documents));
    },
    handleRetrieverError(err, runId) {
      fail(runId, err);
    },
  };
}

// ---------- extraction helpers (LangChain shapes vary by version) ----------

/** LangChain serializes classes as `{ id: ["langchain", "...", "ChatOpenAI"] }`. */
function lastId(serialized: unknown): string | undefined {
  if (typeof serialized !== "object" || serialized === null) return undefined;
  const id = (serialized as Dict).id;
  if (Array.isArray(id) && id.length > 0) {
    const last = id[id.length - 1];
    return typeof last === "string" ? last : undefined;
  }
  const name = (serialized as Dict).name;
  return typeof name === "string" ? name : undefined;
}

function modelName(extraParams: Dict | undefined): string | undefined {
  const invocation = extraParams?.invocation_params;
  if (typeof invocation === "object" && invocation !== null) {
    const m = (invocation as Dict).model ?? (invocation as Dict).model_name;
    if (typeof m === "string") return m;
  }
  return undefined;
}

/** Pull token counts from `llmOutput.tokenUsage` or per-generation usage_metadata. */
function tokenUsage(output: LLMResult): Dict | undefined {
  const fromOutput = output.llmOutput?.tokenUsage ?? output.llmOutput?.estimatedTokenUsage;
  if (typeof fromOutput === "object" && fromOutput !== null) return fromOutput as Dict;

  const message = output.generations?.[0]?.[0]?.message;
  const usage =
    message && typeof message === "object"
      ? ((message as Dict).usage_metadata as Dict | undefined)
      : undefined;
  if (usage) {
    return {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
    };
  }
  return undefined;
}

function firstText(output: LLMResult): string | undefined {
  const text = output.generations?.[0]?.[0]?.text;
  return typeof text === "string" && text.length > 0 ? text : undefined;
}
