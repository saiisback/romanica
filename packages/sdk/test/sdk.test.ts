import { test, expect } from "bun:test";
import type { AgentMessageSummary, IngestPayload, IngestTrace } from "@romanica/shared";
import { Romanica } from "../src/index.ts";

/** Collect everything the SDK would export, instead of hitting the network. */
function harness() {
  const sent: IngestTrace[] = [];
  let t = 1000;
  const client = new Romanica({
    apiKey: "test",
    transport: async (p: IngestPayload) => {
      sent.push(...p.traces);
    },
    now: () => (t += 5), // deterministic monotonic clock
    flushIntervalMs: 5,
  });
  return { client, sent };
}

test("captures a single root span with timing and status", async () => {
  const { client, sent } = harness();

  await client.trace("run", async (trace) => {
    await trace.span("llm", "draft", async (span) => {
      span.setLLM({ model: "gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50 } });
      span.setOutput("hello");
    });
  });
  await client.flush();

  expect(sent).toHaveLength(1);
  const trace = sent[0]!;
  expect(trace.name).toBe("run");
  expect(trace.status).toBe("ok");
  expect(trace.spans).toHaveLength(1);

  const span = trace.spans[0]!;
  expect(span.type).toBe("llm");
  expect(span.parentSpanId).toBeNull();
  expect(span.endTime).toBeGreaterThan(span.startTime);
  expect(span.attributes.model).toBe("gpt-4o");
  expect(span.attributes.promptTokens).toBe(100);
  expect(span.attributes.totalTokens).toBe(150);
  // gpt-4o: 100/1e6*2.5 + 50/1e6*10 = 0.00025 + 0.0005
  expect(span.attributes.costUsd).toBeCloseTo(0.00075, 8);
});

test("auto-nests child spans into a tree", async () => {
  const { client, sent } = harness();

  await client.trace("nested", async (trace) => {
    await trace.span("agent", "outer", async () => {
      // nested via AsyncLocalStorage — no manual parent threading
      await trace.span("tool", "inner-a", async () => {});
      await trace.span("tool", "inner-b", async () => {});
    });
  });
  await client.flush();

  const spans = sent[0]!.spans;
  expect(spans).toHaveLength(3);
  const outer = spans.find((s) => s.name === "outer")!;
  const a = spans.find((s) => s.name === "inner-a")!;
  const b = spans.find((s) => s.name === "inner-b")!;
  expect(outer.parentSpanId).toBeNull();
  expect(a.parentSpanId).toBe(outer.spanId);
  expect(b.parentSpanId).toBe(outer.spanId);
});

test("records errors and re-throws without swallowing", async () => {
  const { client, sent } = harness();

  await expect(
    client.trace("boom", async (trace) => {
      await trace.span("tool", "explode", async () => {
        throw new Error("kaboom");
      });
    }),
  ).rejects.toThrow("kaboom");
  await client.flush();

  const trace = sent[0]!;
  expect(trace.status).toBe("error");
  const span = trace.spans[0]!;
  expect(span.status).toBe("error");
  expect(span.error?.message).toBe("kaboom");
});

test("disabled client is a no-op and never exports", async () => {
  const sent: IngestTrace[] = [];
  const client = new Romanica({
    disabled: true,
    transport: async (p) => {
      sent.push(...p.traces);
    },
  });
  const result = await client.trace("x", async (trace) => {
    await trace.span("custom", "y", async () => {});
    return 42;
  });
  await client.flush();
  expect(result).toBe(42);
  expect(sent).toHaveLength(0);
});

test("publishes and acknowledges agent messages through the direct API", async () => {
  const calls: string[] = [];
  const client = new Romanica({
    transport: async () => {},
    direct: {
      publishMessage: async (message) => {
        calls.push(`publish:${message.channel}`);
        return {
          id: "msg_1",
          projectId: "proj",
          channel: message.channel,
          sender: message.sender,
          recipient: message.recipient ?? null,
          traceId: message.traceId ?? null,
          status: "pending",
          payload: message.payload,
          createdAt: new Date(0).toISOString(),
          ackedAt: null,
        } satisfies AgentMessageSummary;
      },
      ackMessage: async (id, status = "acknowledged") => {
        calls.push(`ack:${id}:${status}`);
        return {
          id,
          projectId: "proj",
          channel: "handoff",
          sender: "planner",
          recipient: "worker",
          traceId: null,
          status,
          payload: {},
          createdAt: new Date(0).toISOString(),
          ackedAt: new Date(1).toISOString(),
        } satisfies AgentMessageSummary;
      },
    },
  });

  const message = await client.publishMessage({
    channel: "handoff",
    sender: "planner",
    recipient: "worker",
    payload: { task: "write summary" },
  });
  expect(message.id).toBe("msg_1");

  const ack = await client.ackMessage(message.id, "failed");
  expect(ack.status).toBe("failed");
  expect(calls).toEqual(["publish:handoff", "ack:msg_1:failed"]);
});

test("disabled client message helpers resolve without network calls", async () => {
  const client = new Romanica({ disabled: true });
  const message = await client.publishMessage({
    channel: "noop",
    sender: "test",
    payload: { ok: true },
  });
  expect(message.id).toBe("disabled");
  expect(message.channel).toBe("noop");
  const ack = await client.ackMessage("msg", "failed");
  expect(ack.status).toBe("failed");
});

test("explicit span.span() nesting also builds the tree", async () => {
  const { client, sent } = harness();
  await client.trace("explicit", async (trace) => {
    await trace.span("agent", "parent", async (span) => {
      await span.span("llm", "child", async () => {});
    });
  });
  await client.flush();

  const spans = sent[0]!.spans;
  const parent = spans.find((s) => s.name === "parent")!;
  const child = spans.find((s) => s.name === "child")!;
  expect(child.parentSpanId).toBe(parent.spanId);
});
