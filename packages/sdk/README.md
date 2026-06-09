# @romanica/sdk

Drop-in tracing for AI agents. Wrap a run, record steps, ship traces to Romanica.

```ts
import { Romanica } from "@romanica/sdk";

const romanica = new Romanica({
  apiKey: process.env.ROMANICA_API_KEY, // or ROMANICA_API_KEY env
  endpoint: "http://localhost:4000",     // or ROMANICA_ENDPOINT env
});

await romanica.trace("handle-ticket", async (trace) => {
  const reply = await trace.span("llm", "draft-reply", async (span) => {
    const res = await openai.chat.completions.create({ model: "gpt-4o", messages });
    span.setLLM({ model: "gpt-4o", usage: res.usage });
    span.setOutput(res.choices[0]?.message);
    return res;
  });

  await trace.span("tool", "search-kb", async (span) => {
    span.setInput({ query });
    span.setOutput(await searchKB(query));
  });
});
```

## Guarantees

- **Never breaks your app.** Export is async, buffered, and fails silently; the
  timer is `unref`'d so it never holds the process open.
- **Never swallows your errors.** Errors thrown inside a span are recorded
  (status `error` + message/stack) and re-thrown unchanged.
- **Auto-nesting.** `trace.span(...)` calls made inside another span attach as
  its children (via `AsyncLocalStorage`); or nest explicitly with `span.span(...)`.

## Config

| Option | Default | Notes |
|--------|---------|-------|
| `apiKey` | `ROMANICA_API_KEY` | project key |
| `endpoint` | `http://localhost:4000` | ingest base URL |
| `flushIntervalMs` | `2000` | max buffer age |
| `maxQueue` | `25` | flush early at N queued traces |
| `maxBatch` | `100` | max traces per request |
| `disabled` | `false` | turn into a no-op |
| `debug` | `false` | log export failures |
| `transport` / `direct` / `now` | — | injectable for tests |

Call `await romanica.flush()` before a short-lived process exits, or
`await romanica.shutdown()` on graceful shutdown.

## Auto-instrumentation

Skip the manual `trace.span(...)` calls — wrap your model/runnable once and
spans appear automatically inside any `romanica.trace(...)`.

**Vercel AI SDK** (`@romanica/sdk/vercel`):

```ts
import { wrapAISDK } from "@romanica/sdk/vercel";

const model = wrapAISDK(openai("gpt-4o")); // wrap once
await romanica.trace("run", async () => {
  await generateText({ model, prompt: "hi" }); // llm span emitted automatically
});
```

Works with `generateText`, `streamText`, `generateObject`, … and with both the
v1 (`promptTokens`/`completionTokens`) and v2 (`inputTokens`/`outputTokens`)
usage shapes. No active trace → the call passes straight through.

**LangChain.js** (`@romanica/sdk/langchain`):

```ts
import { romanicaTracer } from "@romanica/sdk/langchain";

await romanica.trace("run", async () => {
  await chain.invoke(input, { callbacks: [romanicaTracer()] });
});
```

Chains → `agent` spans, models → `llm`, tools → `tool`, retrievers →
`retrieval`, nested via LangChain's own run ids. Pass a trace explicitly with
`romanicaTracer(trace)` to bind to a specific run.

## Span helpers

`setInput` · `setOutput` · `setAttribute(s)` · `setStatus` · `setError` ·
`setLLM({ model, provider, usage, costUsd, temperature, toolCalls })` ·
`setTool({ toolName, args, result })` ·
`setRetrieval({ query, topK, documents })`

## Agent messages

Publish project-scoped handoffs to the Layer 7 message bus:

```ts
const message = await romanica.publishMessage({
  channel: "research-handoff",
  sender: "planner",
  recipient: "researcher",
  payload: { topic: "refund policy", priority: 2 },
});

await romanica.ackMessage(message.id);
```
