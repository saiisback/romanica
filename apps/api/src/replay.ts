/**
 * Failure replay (M7).
 *
 * We do not run the user's agent — that is L1 Runtime, out of scope. What we
 * *can* replay is the part we captured verbatim: the LLM calls. For a recorded
 * trace we reconstruct each `llm` span's exact request (messages + params) and
 * re-issue it against the provider, then diff the fresh output against what was
 * recorded. That answers the debugging question directly: "does it still fail,
 * and did the model's output change?"
 *
 * The provider call is abstracted behind {@link ModelInvoker} so it is fully
 * testable offline (and so a key is never required to *reconstruct* the plan).
 */
import { randomUUID } from "node:crypto";
import {
  estimateCostUsd,
  type IngestPayload,
  type ReplayMessage,
  type ReplayResult,
  type ReplayStep,
  type SpanNode,
  type TraceDetail,
} from "@romanica/shared";

/** One reconstructed LLM call, ready to re-issue. */
export interface ReplayRequest {
  spanId: string;
  name: string;
  model: string | null;
  provider: string | null;
  messages: ReplayMessage[];
  params: Record<string, unknown>;
  originalOutput: unknown;
}

export interface InvokeResult {
  output: string;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
}

/** Re-issues one reconstructed request to a model provider. Must reject on failure. */
export type ModelInvoker = (req: ReplayRequest) => Promise<InvokeResult>;

// ---------------- reconstruction ----------------

/** Depth-first flatten of the span tree. */
function flatten(spans: SpanNode[]): SpanNode[] {
  const out: SpanNode[] = [];
  const walk = (s: SpanNode) => {
    out.push(s);
    for (const c of s.children) walk(c);
  };
  for (const s of spans) walk(s);
  return out;
}

/** Reconstruct the replayable LLM requests of a trace, in execution order. */
export function reconstructRequests(detail: TraceDetail): ReplayRequest[] {
  return flatten(detail.spans)
    .filter((s) => s.type === "llm")
    .map((s) => {
      const attrs = s.attributes as Record<string, unknown>;
      const model = typeof attrs.model === "string" ? attrs.model : null;
      const provider = typeof attrs.provider === "string" ? attrs.provider : null;
      const params: Record<string, unknown> = {};
      if (typeof attrs.temperature === "number") params.temperature = attrs.temperature;
      return {
        spanId: s.spanId,
        name: s.name,
        model,
        provider,
        messages: toChatMessages(s.input),
        params,
        originalOutput: s.output,
      };
    });
}

/** Best-effort normalisation of a captured span input into chat messages. */
export function toChatMessages(input: unknown): ReplayMessage[] {
  if (input == null) return [];
  if (typeof input === "string") return [{ role: "user", content: input }];

  if (Array.isArray(input)) {
    const msgs = input
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .filter((m) => "role" in m || "content" in m)
      .map((m) => ({
        role: typeof m.role === "string" ? m.role : "user",
        content: contentToString(m.content),
      }));
    return msgs.length > 0 ? msgs : [{ role: "user", content: stringify(input) }];
  }

  if (typeof input === "object") {
    const o = input as Record<string, unknown>;
    if (Array.isArray(o.messages)) return toChatMessages(o.messages);
    if (o.prompt !== undefined) return toChatMessages(o.prompt);
    if (typeof o.content === "string" || o.content !== undefined) {
      return [{ role: typeof o.role === "string" ? o.role : "user", content: contentToString(o.content) }];
    }
  }

  return [{ role: "user", content: stringify(input) }];
}

/** Flatten message content (string, or AI-SDK-style parts array) to text. */
function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
        }
        return "";
      })
      .join("");
  }
  return content == null ? "" : stringify(content);
}

function stringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ---------------- replay ----------------

function outputText(v: unknown): string {
  return typeof v === "string" ? v : stringify(v);
}

/** Re-issue every reconstructed LLM request and diff against the recording. */
export async function replayTrace(
  detail: TraceDetail,
  invoker: ModelInvoker | null,
): Promise<ReplayResult> {
  const requests = reconstructRequests(detail);
  const steps: ReplayStep[] = [];

  for (const req of requests) {
    const base: ReplayStep = {
      spanId: req.spanId,
      name: req.name,
      model: req.model,
      status: "skipped",
      request: { messages: req.messages, params: req.params },
      originalOutput: req.originalOutput,
    };

    if (!invoker) {
      steps.push({ ...base, reason: "no_provider_configured" });
      continue;
    }
    if (req.messages.length === 0) {
      steps.push({ ...base, reason: "no_reconstructable_input" });
      continue;
    }

    const startedAt = Date.now();
    try {
      const res = await invoker(req);
      const replayTokens = (res.promptTokens ?? 0) + (res.completionTokens ?? 0);
      steps.push({
        ...base,
        status: "ok",
        replayedOutput: res.output,
        changed: res.output !== outputText(req.originalOutput),
        replayTokens: replayTokens > 0 ? replayTokens : undefined,
        replayCostUsd: estimateCostUsd(
          res.model ?? req.model ?? undefined,
          res.promptTokens ?? 0,
          res.completionTokens ?? 0,
        ),
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      steps.push({
        ...base,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  const ran = steps.filter((s) => s.status === "ok").length;
  const errored = steps.some((s) => s.status === "error");
  const status: ReplayResult["status"] =
    steps.length === 0 || ran === 0
      ? errored
        ? "error"
        : "skipped"
      : ran === steps.length
        ? "ok"
        : "partial";

  return {
    traceId: detail.traceId,
    status,
    steps,
    message:
      ran === 0 && !invoker
        ? "No provider key configured — set OPENAI_API_KEY (or pass apiKey) to re-issue calls. The reconstructed requests are shown below."
        : undefined,
  };
}

/**
 * Build an ingest payload from a completed replay so it shows up as its own
 * trace (tagged `replayOf`). Only the steps that actually ran are included.
 */
export function buildReplayPayload(
  detail: TraceDetail,
  result: ReplayResult,
): IngestPayload | null {
  const ok = result.steps.filter((s) => s.status === "ok");
  if (ok.length === 0) return null;

  const traceId = randomUUID();
  const start = Date.now();
  let cursor = start;

  const spans = ok.map((step) => {
    const spanStart = cursor;
    const dur = step.latencyMs ?? 0;
    cursor = spanStart + dur;
    return {
      spanId: randomUUID(),
      parentSpanId: null,
      type: "llm" as const,
      name: step.name,
      status: "ok" as const,
      startTime: spanStart,
      endTime: spanStart + dur,
      input: step.request.messages,
      output: step.replayedOutput ?? null,
      attributes: {
        model: step.model ?? undefined,
        replay: true,
        promptTokens: undefined,
        totalTokens: step.replayTokens,
        costUsd: step.replayCostUsd,
      },
    };
  });

  return {
    traces: [
      {
        traceId,
        name: `${detail.name} (replay)`,
        status: "ok",
        startTime: start,
        endTime: cursor,
        metadata: { replayOf: detail.traceId, kind: "replay" },
        spans,
      },
    ],
  };
}

// ---------------- default provider (OpenAI-compatible) ----------------

export interface InvokerOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Build an OpenAI-compatible chat invoker, or null if no key is available.
 * Reads `apiKey`/`baseUrl` from the request, falling back to env. Non-OpenAI
 * providers (e.g. Anthropic) are left to a future adapter — they reconstruct
 * fine but are reported as skipped rather than mis-called.
 */
export function makeOpenAIInvoker(opts: InvokerOptions = {}): ModelInvoker | null {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ROMANICA_REPLAY_KEY;
  if (!apiKey) return null;
  const baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );

  return async (req: ReplayRequest): Promise<InvokeResult> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: req.model ?? "gpt-4o-mini",
        messages: req.messages,
        ...req.params,
      }),
    });
    if (!res.ok) {
      throw new Error(`provider ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    return {
      output: json.choices?.[0]?.message?.content ?? "",
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
      model: json.model,
    };
  };
}
