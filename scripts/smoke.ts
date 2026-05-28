#!/usr/bin/env bun
// End-to-end smoke: real SDK -> HTTP -> API -> Postgres. Run with the API up.
import { Romanica } from "../packages/sdk/src/index.ts";
import { sql } from "../apps/api/src/db.ts";

const romanica = new Romanica({
  apiKey: "rom_dev_key",
  endpoint: "http://localhost:4000",
  debug: true,
});

let capturedTraceId = "";

await romanica.trace("smoke-run", async (trace) => {
  trace.setMetadata({ source: "smoke" });
  capturedTraceId = trace.traceId;

  await trace.span("agent", "plan", async (span) => {
    await span.span("llm", "draft", async (s) => {
      s.setLLM({ model: "gpt-4o", usage: { prompt_tokens: 200, completion_tokens: 80 } });
      s.setOutput({ text: "hello world" });
    });
    await span.span("tool", "search", async (s) => {
      s.setTool({ toolName: "kb_search", args: { q: "refund" }, result: ["doc-1", "doc-2"] });
    });
  });
});

await romanica.flush();
await new Promise((r) => setTimeout(r, 200)); // let the API finish the write

const traces = (await sql`SELECT * FROM traces WHERE trace_id = ${capturedTraceId}`) as any[];
const spans = (await sql`SELECT type, name, parent_span_id FROM spans WHERE trace_id = ${capturedTraceId} ORDER BY start_time`) as any[];

console.log("\n--- trace row ---");
console.log({
  name: traces[0]?.name,
  status: traces[0]?.status,
  total_tokens: Number(traces[0]?.total_tokens),
  total_cost_usd: Number(traces[0]?.total_cost_usd),
  span_count: traces[0]?.span_count,
});
console.log("--- spans ---");
for (const s of spans) console.log(`  ${s.type.padEnd(9)} ${s.name.padEnd(8)} parent=${s.parent_span_id ?? "ROOT"}`);

const ok = traces.length === 1 && spans.length === 3 && Number(traces[0].total_tokens) === 280;
console.log(`\n${ok ? "✓ SMOKE PASS" : "✗ SMOKE FAIL"}`);

await sql`DELETE FROM traces WHERE trace_id = ${capturedTraceId}`;
await sql.end();
process.exit(ok ? 0 : 1);
