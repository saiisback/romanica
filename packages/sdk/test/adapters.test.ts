import { test, expect } from "bun:test";
import type { IngestPayload, IngestTrace } from "@romanica/shared";
import { Romanica } from "../src/index.ts";
import { wrapAISDK } from "../src/adapters/vercel.ts";
import { romanicaTracer } from "../src/adapters/langchain.ts";

function harness() {
  const sent: IngestTrace[] = [];
  let t = 1000;
  const client = new Romanica({
    apiKey: "test",
    transport: async (p: IngestPayload) => {
      sent.push(...p.traces);
    },
    now: () => (t += 5),
    flushIntervalMs: 5,
  });
  return { client, sent };
}

// ---------------- Vercel AI SDK ----------------

function fakeModel() {
  return {
    specificationVersion: "v1",
    provider: "openai",
    modelId: "gpt-4o",
    async doGenerate(_options: unknown) {
      return {
        text: "hi there",
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: "stop",
      };
    },
    async doStream(_options: unknown) {
      const parts = [
        { type: "text-delta", textDelta: "hi " },
        { type: "text-delta", textDelta: "there" },
        { type: "finish", usage: { promptTokens: 100, completionTokens: 50 } },
      ];
      const stream = new ReadableStream<Record<string, unknown>>({
        start(controller) {
          for (const p of parts) controller.enqueue(p);
          controller.close();
        },
      });
      return { stream };
    },
  };
}

test("wrapAISDK records an llm span with model, usage, and cost", async () => {
  const { client, sent } = harness();
  const model = wrapAISDK(fakeModel());

  await client.trace("vercel-run", async () => {
    await model.doGenerate({ prompt: [{ role: "user", content: "hi" }] });
  });
  await client.flush();

  const span = sent[0]!.spans[0]!;
  expect(span.type).toBe("llm");
  expect(span.name).toBe("gpt-4o");
  expect(span.attributes.model).toBe("gpt-4o");
  expect(span.attributes.provider).toBe("openai");
  expect(span.attributes.promptTokens).toBe(100);
  expect(span.attributes.totalTokens).toBe(150);
  expect(span.attributes.costUsd).toBeCloseTo(0.00075, 8);
  expect(span.output).toBe("hi there");
});

test("wrapAISDK passes through when no trace is active", async () => {
  const model = wrapAISDK(fakeModel());
  // No client.trace(...) wrapping → must not throw, returns the raw result.
  const res = await model.doGenerate({ prompt: [] });
  expect(res.text).toBe("hi there");
});

test("wrapAISDK captures usage from a streamed response", async () => {
  const { client, sent } = harness();
  const model = wrapAISDK(fakeModel());

  await client.trace("vercel-stream", async () => {
    const { stream } = await model.doStream({ prompt: [] });
    // drain the stream so the collector's flush runs
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      /* consume */
    }
  });
  await client.flush();

  const span = sent[0]!.spans[0]!;
  expect(span.type).toBe("llm");
  expect(span.attributes.totalTokens).toBe(150);
  expect(span.output).toBe("hi there");
});

// ---------------- LangChain.js ----------------

test("romanicaTracer builds a span tree from LangChain callbacks", async () => {
  const { client, sent } = harness();

  await client.trace("lc-run", async () => {
    const cb = romanicaTracer();
    // chain → llm (nested via parentRunId)
    cb.handleChainStart({ id: ["langchain", "AgentExecutor"] }, { input: "q" }, "chain-1");
    cb.handleLLMStart(
      { id: ["langchain", "ChatOpenAI"] },
      ["prompt text"],
      "llm-1",
      "chain-1",
      { invocation_params: { model: "gpt-4o" } },
    );
    cb.handleLLMEnd(
      {
        generations: [[{ text: "answer" }]],
        llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } },
      },
      "llm-1",
    );
    cb.handleChainEnd({ output: "answer" }, "chain-1");
  });
  await client.flush();

  const spans = sent[0]!.spans;
  expect(spans).toHaveLength(2);
  const chain = spans.find((s) => s.name === "AgentExecutor")!;
  const llm = spans.find((s) => s.name === "gpt-4o")!;
  expect(chain.type).toBe("agent");
  expect(chain.parentSpanId).toBeNull();
  expect(llm.type).toBe("llm");
  expect(llm.parentSpanId).toBe(chain.spanId);
  expect(llm.attributes.totalTokens).toBe(150);
  expect(llm.attributes.costUsd).toBeCloseTo(0.00075, 8);
  expect(llm.output).toBe("answer");
});

test("romanicaTracer records tool errors and flips trace status", async () => {
  const { client, sent } = harness();

  await client.trace("lc-fail", async () => {
    const cb = romanicaTracer();
    cb.handleToolStart({ id: ["x", "search"] }, { q: "refund" }, "tool-1", undefined, undefined, undefined, "search");
    cb.handleToolError(new Error("tool exploded"), "tool-1");
  });
  await client.flush();

  const trace = sent[0]!;
  expect(trace.status).toBe("error");
  const span = trace.spans[0]!;
  expect(span.type).toBe("tool");
  expect(span.name).toBe("search");
  expect(span.status).toBe("error");
  expect(span.error?.message).toBe("tool exploded");
});
