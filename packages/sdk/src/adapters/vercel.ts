/**
 * Auto-instrumentation for the Vercel AI SDK.
 *
 * Wrap a model once; every `generateText` / `streamText` / `generateObject`
 * call that uses it emits an `llm` span into whatever Romanica trace is active
 * — no per-call code.
 *
 * ```ts
 * import { wrapAISDK } from "@romanica/sdk/vercel";
 * const model = wrapAISDK(openai("gpt-4o"));
 * await romanica.trace("run", async () => {
 *   await generateText({ model, prompt: "hi" }); // span emitted automatically
 * });
 * ```
 *
 * Version-agnostic: works with the v1 (`promptTokens`/`completionTokens`) and
 * v2 (`inputTokens`/`outputTokens`) usage shapes — {@link Span.setLLM} accepts
 * both. If no trace is active the call passes straight through, untouched.
 */
import { currentTrace } from "../context.ts";
import type { Span } from "../span.ts";

/** The slice of a Vercel `LanguageModelV1`/`V2` we touch. */
interface LanguageModelLike {
  readonly modelId?: string;
  readonly provider?: string;
  doGenerate(options: unknown): Promise<GenerateResult>;
  doStream(options: unknown): Promise<StreamResult>;
  [key: string]: unknown;
}

interface GenerateResult {
  text?: string;
  toolCalls?: unknown[];
  usage?: Record<string, number>;
  [key: string]: unknown;
}

interface StreamResult {
  stream: ReadableStream<Record<string, unknown>>;
  [key: string]: unknown;
}

function isModel(v: unknown): v is LanguageModelLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).doGenerate === "function"
  );
}

/**
 * Wrap a Vercel AI SDK language model so its calls become Romanica spans.
 * Returns a transparent proxy — every other property/method is untouched.
 */
export function wrapAISDK<M extends object>(model: M): M {
  if (!isModel(model)) return model;
  const target = model as LanguageModelLike;

  const spanName = target.modelId ?? target.provider ?? "llm";
  const doGenerate = target.doGenerate.bind(target);
  const doStream = target.doStream.bind(target);

  const wrappedGenerate = async (options: unknown): Promise<GenerateResult> => {
    const trace = currentTrace();
    if (!trace) return doGenerate(options);
    return trace.span("llm", spanName, async (span) => {
      span.setInput(extractInput(options));
      const res = await doGenerate(options);
      span.setLLM({
        model: target.modelId,
        provider: target.provider,
        usage: res.usage,
        toolCalls: res.toolCalls?.length,
      });
      span.setOutput(res.text ?? res.toolCalls ?? null);
      return res;
    });
  };

  const wrappedStream = async (options: unknown): Promise<StreamResult> => {
    const trace = currentTrace();
    if (!trace) return doStream(options);

    const span = trace.startSpan("llm", spanName);
    span.setInput(extractInput(options));
    try {
      const res = await doStream(options);
      return { ...res, stream: res.stream.pipeThrough(collector(target, span)) };
    } catch (err) {
      span.setError(err);
      trace.markError();
      span.finish();
      throw err;
    }
  };

  return new Proxy(model, {
    get(t, prop, receiver) {
      if (prop === "doGenerate") return wrappedGenerate;
      if (prop === "doStream") return wrappedStream;
      return Reflect.get(t, prop, receiver);
    },
  });
}

/** Tee through a stream, accumulating text + usage, then close the span. */
function collector(
  model: LanguageModelLike,
  span: Span,
): TransformStream<Record<string, unknown>, Record<string, unknown>> {
  let text = "";
  let usage: Record<string, number> | undefined;
  return new TransformStream({
    transform(part, controller) {
      const type = part.type;
      if (type === "text-delta") {
        text += (part.textDelta ?? part.delta ?? part.text ?? "") as string;
      } else if (type === "finish") {
        usage = part.usage as Record<string, number> | undefined;
      }
      controller.enqueue(part);
    },
    flush() {
      span.setLLM({ model: model.modelId, provider: model.provider, usage });
      span.setOutput(text);
      span.finish();
    },
  });
}

/** Keep the prompt/messages; the API offloads anything large to blob storage. */
function extractInput(options: unknown): unknown {
  if (typeof options !== "object" || options === null) return options;
  const o = options as Record<string, unknown>;
  return o.prompt ?? o.messages ?? o.inputFormat ?? o;
}
