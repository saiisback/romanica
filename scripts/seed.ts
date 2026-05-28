#!/usr/bin/env bun
// Seed one realistic trace via the SDK; prints the trace id (no cleanup).
import { Romanica } from "../packages/sdk/src/index.ts";

const romanica = new Romanica({ apiKey: "rom_dev_key", endpoint: "http://localhost:4000" });

let traceId = "";
await romanica.trace("support-agent", async (trace) => {
  trace.setMetadata({ env: "dev", ticket: "T-1042" });
  traceId = trace.traceId;
  await trace.span("agent", "handle-ticket", async (root) => {
    await root.span("retrieval", "search-kb", async (s) => {
      s.setRetrieval({ query: "refund policy", topK: 3, documents: [{ id: "kb-1", score: 0.92 }] });
      s.setOutput({ hits: 3 });
    });
    await root.span("llm", "draft-reply", async (s) => {
      s.setInput({ messages: [{ role: "user", content: "How do refunds work?" }] });
      s.setLLM({ model: "gpt-4o", usage: { prompt_tokens: 420, completion_tokens: 180 } });
      s.setOutput({ text: "You can request a refund within 30 days..." });
    });
  });
});

await romanica.flush();
console.log(traceId);
process.exit(0);
