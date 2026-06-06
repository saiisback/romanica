import { test, expect } from "bun:test";
import type { ReplayRequest } from "../src/replay.ts";
import {
  buildReplayPayload,
  reconstructRequests,
  replayTrace,
  toChatMessages,
} from "../src/replay.ts";
import type { SpanNode, TraceDetail } from "@romanica/shared";

function llmSpan(over: Partial<SpanNode>): SpanNode {
  return {
    spanId: crypto.randomUUID(),
    parentSpanId: null,
    type: "llm",
    name: "draft",
    status: "error",
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 50,
    input: { prompt: "say hi" },
    output: "broken output",
    error: null,
    attributes: { model: "gpt-4o", temperature: 0.7 },
    children: [],
    ...over,
  };
}

function detailWith(spans: SpanNode[]): TraceDetail {
  return {
    traceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    name: "failed-run",
    status: "error",
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 100,
    spanCount: spans.length,
    totalTokens: 0,
    totalCostUsd: 0,
    metadata: {},
    spans,
  };
}

test("toChatMessages normalises the shapes we capture", () => {
  expect(toChatMessages("hello")).toEqual([{ role: "user", content: "hello" }]);
  expect(toChatMessages({ prompt: "hi" })).toEqual([{ role: "user", content: "hi" }]);
  expect(
    toChatMessages([
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
    ]),
  ).toEqual([
    { role: "system", content: "be terse" },
    { role: "user", content: "hi" },
  ]);
  // AI-SDK style parts array
  expect(
    toChatMessages([{ role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }]),
  ).toEqual([{ role: "user", content: "ab" }]);
  // nested under messages
  expect(toChatMessages({ messages: [{ role: "user", content: "q" }] })).toEqual([
    { role: "user", content: "q" },
  ]);
});

test("reconstructRequests walks the tree and picks llm spans only", () => {
  const detail = detailWith([
    {
      ...llmSpan({ name: "agent-root", type: "agent", input: null, output: null, attributes: {} }),
      children: [llmSpan({ name: "inner-llm" })],
    },
  ]);
  const reqs = reconstructRequests(detail);
  expect(reqs).toHaveLength(1);
  expect(reqs[0]!.name).toBe("inner-llm");
  expect(reqs[0]!.model).toBe("gpt-4o");
  expect(reqs[0]!.params).toEqual({ temperature: 0.7 });
  expect(reqs[0]!.messages).toEqual([{ role: "user", content: "say hi" }]);
});

test("replayTrace re-issues each call and flags changed output + cost", async () => {
  const detail = detailWith([llmSpan({})]);
  const stub = async (_req: ReplayRequest) => ({
    output: "fixed output",
    promptTokens: 100,
    completionTokens: 50,
    model: "gpt-4o",
  });

  const result = await replayTrace(detail, stub);
  expect(result.status).toBe("ok");
  expect(result.steps).toHaveLength(1);
  const step = result.steps[0]!;
  expect(step.status).toBe("ok");
  expect(step.replayedOutput).toBe("fixed output");
  expect(step.changed).toBe(true); // differs from "broken output"
  expect(step.replayTokens).toBe(150);
  expect(step.replayCostUsd).toBeCloseTo(0.00075, 8);
});

test("replayTrace with no invoker reconstructs but skips", async () => {
  const detail = detailWith([llmSpan({})]);
  const result = await replayTrace(detail, null);
  expect(result.status).toBe("skipped");
  expect(result.steps[0]!.status).toBe("skipped");
  expect(result.steps[0]!.reason).toBe("no_provider_configured");
  // the reconstructed request is still surfaced for the UI
  expect(result.steps[0]!.request.messages).toEqual([{ role: "user", content: "say hi" }]);
  expect(result.message).toContain("OPENAI_API_KEY");
});

test("replayTrace records a per-step error without failing the whole replay", async () => {
  const detail = detailWith([llmSpan({}), llmSpan({ name: "second" })]);
  let n = 0;
  const flaky = async (_req: ReplayRequest) => {
    if (n++ === 0) throw new Error("rate limited");
    return { output: "ok now", promptTokens: 10, completionTokens: 5, model: "gpt-4o" };
  };
  const result = await replayTrace(detail, flaky);
  expect(result.status).toBe("partial");
  expect(result.steps[0]!.status).toBe("error");
  expect(result.steps[0]!.reason).toBe("rate limited");
  expect(result.steps[1]!.status).toBe("ok");
});

test("buildReplayPayload emits a replay trace from the ran steps", async () => {
  const detail = detailWith([llmSpan({})]);
  const result = await replayTrace(detail, async () => ({
    output: "fresh",
    promptTokens: 100,
    completionTokens: 50,
    model: "gpt-4o",
  }));

  const payload = buildReplayPayload(detail, result);
  expect(payload).not.toBeNull();
  const trace = payload!.traces[0]!;
  expect(trace.name).toBe("failed-run (replay)");
  expect(trace.metadata.replayOf).toBe(detail.traceId);
  expect(trace.spans).toHaveLength(1);
  expect(trace.spans[0]!.type).toBe("llm");
  expect(trace.spans[0]!.output).toBe("fresh");

  // nothing ran -> nothing to persist
  expect(buildReplayPayload(detail, await replayTrace(detail, null))).toBeNull();
});
