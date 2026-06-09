# Layer 4 — AgentOps & Observability — Build Doc

> The active build target for Romanica. Self-contained context for building this layer.
> Parent docs: [BUILD.md](./BUILD.md) (10-layer map) · [romanica.md](./romanica.md) (vision).

---

## 1. What we're building

A drop-in observability layer for AI agents. A developer wraps their agent with our SDK; every run streams to our backend as a structured trace; they open a dashboard and can see — and replay — exactly what happened.

**One-sentence pitch:**
> When your agent fails, loops, or burns tokens, you have no idea why. We make agent execution observable — trace every step, replay any failure, see what it cost.

**The acute pain (the moment we sell against):**
> An agent did something wrong in production. The dev opens logs, sees a wall of JSON, and *cannot* answer: which step broke, what did the model actually see, which tool returned garbage, why did it retry 6 times? That's a 3-hour debugging session. We make it 3 minutes.

---

## 2. Scope

### In scope (MVP)
- TypeScript SDK that wraps agents and emits traces.
- Ingest API that receives trace data.
- Storage for traces (metadata + large payloads).
- Query API for the dashboard.
- Dashboard: trace tree viewer, token/cost, latency.

### Explicitly out of scope
- ❌ Running agents (that's L1 Runtime). We observe agents running on the user's own infra.
- ❌ Orchestration, routing, scaling, memory.
- ❌ Any migration requirement — integration must be a few lines.
- ❌ Reasoning-trace inference, hallucination/confidence scoring — research, deferred.
- ❌ The Rust ingest core — that's **Phase 1b**, after the TS MVP proves the product.

---

## 3. Target user & adoption path

- **User:** a developer building agents in the TypeScript ecosystem (Vercel AI SDK, LangChain.js, Mastra, raw SDK calls).
- **Adoption:** `npm install` → wrap agent in <10 lines → traces appear automatically. Zero infra changes.
- **Validated when:** ~10 real teams run with tracing on by default and would notice if it vanished. (Metric = *dependence*, not revenue.)

---

## 4. Core concepts & data model

Three nested entities. OpenTelemetry-shaped, with agent-native semantics layered on top.

```txt
Project
  └── Trace        (one full agent run / invocation)
        └── Span   (one step within the run — nestable into a tree)
```

### Trace
A single end-to-end agent execution.
| Field | Type | Notes |
|-------|------|-------|
| `trace_id` | uuid | unique per run |
| `project_id` | uuid | tenancy |
| `name` | string | e.g. "support-agent" |
| `status` | enum | `ok` \| `error` \| `running` |
| `start_time` / `end_time` | timestamp | |
| `metadata` | json | user-defined tags (env, version, user id) |
| `total_tokens` / `total_cost_usd` | computed | rolled up from spans |

### Span
One step within a run. Spans form a tree via `parent_span_id`.
| Field | Type | Notes |
|-------|------|-------|
| `span_id` | uuid | |
| `trace_id` | uuid | |
| `parent_span_id` | uuid \| null | null = root span |
| `type` | enum | `llm` \| `tool` \| `retrieval` \| `agent` \| `custom` |
| `name` | string | e.g. "gpt-4o call", "search_tool" |
| `status` | enum | `ok` \| `error` |
| `start_time` / `end_time` | timestamp | → latency |
| `input` | json/blob | prompt / args (large → object store) |
| `output` | json/blob | response / return value |
| `error` | json \| null | message + stack |
| `attributes` | json | type-specific (see below) |

### Type-specific attributes
- **`llm` span:** `model`, `provider`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `temperature`, `tool_calls`.
- **`tool` span:** `tool_name`, `args`, `result`, `duration_ms`.
- **`retrieval` span:** `query`, `top_k`, `documents` (ids + scores).
- **`agent` span:** logical grouping of a sub-agent's work.

> **Design note:** large `input`/`output` payloads (full prompts, big tool returns) are stored in object storage and referenced by key; only metadata + small fields live in Postgres. Keeps the relational store fast.

---

## 5. Architecture

```txt
┌─────────────────────────────────────────────┐
│  User's agent (Vercel AI SDK / LangChain.js  │
│  / raw SDK / custom)                          │
│        │  our TS SDK wraps it                  │
│        │  buffers + batches spans              │
└────────┼──────────────────────────────────────┘
         │  HTTPS (batched span export)
         ▼
┌─────────────────────┐
│  Ingest API (TS)    │  validate, auth, enqueue
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Queue / buffer     │  (start: direct write; later: Redis/queue)
└────────┬────────────┘
         ▼
┌─────────────────────────────────────┐
│  Storage                              │
│   • Postgres — traces, spans (meta)   │
│   • Object store (S3/R2) — big blobs  │
└────────┬──────────────────────────────┘
         ▼
┌─────────────────────┐
│  Query API (TS)     │  trace list, trace detail, aggregates
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Dashboard (Next.js)│  trace tree, cost, latency views
└─────────────────────┘
```

**Phase 1b (later):** replace the Ingest API + processing hot path with a **Rust** service when span volume demands it. SDK and API contract stay the same, so it's a transparent swap.

---

## 6. Components

### 6.1 SDK (TypeScript) — `@romanica/sdk`
The product surface. Must be trivial to adopt.

**Init:**
```ts
import { Romanica } from "@romanica/sdk";

const romanica = new Romanica({
  apiKey: process.env.ROMANICA_API_KEY,
  project: "support-agent",
});
```

**Manual span wrapping (P0 — works with anything):**
```ts
// Wrap a whole run
await romanica.trace("handle-ticket", async (trace) => {
  // Wrap an LLM call
  const reply = await trace.span("llm", "draft-reply", async (span) => {
    const res = await openai.chat.completions.create({ ... });
    span.setLLM({ model: "gpt-4o", usage: res.usage });
    return res;
  });

  // Wrap a tool call
  await trace.span("tool", "search-kb", async (span) => {
    span.setInput({ query });
    const docs = await searchKB(query);
    span.setOutput(docs);
  });
});
```

**Auto-instrumentation (P1):** thin wrappers for Vercel AI SDK + LangChain.js so users get spans with near-zero code.
```ts
import { wrapAISDK } from "@romanica/sdk/vercel";
const model = wrapAISDK(openai("gpt-4o")); // spans emitted automatically
```

**SDK responsibilities:** build the span tree, capture timing, buffer + batch, export async (never block the agent), fail silently if the backend is down (observability must never break the app).

### 6.2 Ingest API (TypeScript)
- `POST /v1/traces` — batch of spans/traces.
- Auth via API key → project.
- Validate against the span schema.
- Write to storage (MVP: direct; later: enqueue).
- Returns fast; never blocks the SDK.

### 6.3 Storage
- **Postgres:** `projects`, `traces`, `spans` tables. Indexed on `trace_id`, `project_id`, `start_time`.
- **Object store (S3 / Cloudflare R2):** large `input`/`output` blobs, keyed `{project}/{trace_id}/{span_id}/{in|out}`.

### 6.4 Query API (TypeScript)
- `GET /v1/traces?project=&status=&from=&to=` — paginated trace list.
- `GET /v1/traces/:id` — full trace with span tree.
- `GET /v1/analytics/cost?project=&from=&to=` — token/cost aggregates.
- `GET /v1/analytics/latency?project=` — per-step latency distribution.

### 6.5 Dashboard (Next.js + TypeScript)
- **Trace list:** filter by status/time; show duration, cost, token count, error flag.
- **Trace detail:** the core view — span tree (collapsible), click a span → full input/output/attributes/error.
- **Cost view:** tokens + $ over time, broken down by model/step.
- **Latency view:** waterfall of a run; find the slow step.

---

## 7. Tech stack (this layer)

| Piece | Choice |
|-------|--------|
| SDK | TypeScript, zero heavy deps, framework-agnostic core + adapters |
| Ingest API | TypeScript (Node/Hono or Fastify). Rust in Phase 1b. |
| Query API | TypeScript, same service as ingest to start |
| DB | Postgres (+ `pgvector` later if needed) |
| Object store | S3 / Cloudflare R2 |
| Dashboard | Next.js (App Router), TypeScript, Tailwind |
| Span format | OpenTelemetry-shaped + agent-native attributes |
| Monorepo | pnpm workspaces or Turborepo |

---

## 8. Proposed repo structure

```txt
romanica/                    # Bun workspace root
├── packages/
│   ├── shared/              # @romanica/shared — span schema, pricing, tree (source of truth)
│   └── sdk/                 # @romanica/sdk — trace()/span() primitives, batched export
│                            #   (adapters/ for vercel + langchain land in M6)
├── apps/
│   ├── api/                 # ingest + query API (Hono on Bun.serve)
│   └── web/                 # dashboard (Next.js App Router)
├── db/
│   └── migrations/          # Postgres schema (0001_init.sql)
├── scripts/                 # migrate.ts, seed.ts, smoke.ts (Bun)
├── docs/                    # this doc + BUILD.md + romanica.md
└── docker-compose.yml       # Postgres (:5433) + MinIO (:9000/:9001)
```

`packages/shared` holding the span schema = one source of truth across SDK, API, and dashboard (the TS-everywhere velocity win).

---

## 9. Build order (milestones)

| # | Milestone | Deliverable | Status |
|---|-----------|-------------|--------|
| M0 | **Schema + scaffold** | Bun monorepo, `shared` span types, Postgres migrations for `projects`/`traces`/`spans`. | ✅ Done |
| M1 | **SDK core** | `trace()` + `span()` primitives, auto-nesting (AsyncLocalStorage), buffered + batched async export, fail-silent. | ✅ Done |
| M2 | **Ingest API** | `POST /v1/traces`, API-key auth, write to Postgres + S3/MinIO (blob offload >16KB), cost rollup. | ✅ Done |
| M3 | **Query API** | trace list (keyset paginated), trace detail with span tree, cost + latency analytics endpoints. | ✅ Done |
| M4 | **Dashboard: trace tree** | The core view — list runs, open one, see the span tree + waterfall + input/output. **First "wow".** | ✅ Done |
| M5 | **Cost + latency** | Dedicated dashboard views over the existing analytics endpoints (token/cost over time, latency distribution). | ✅ Done |
| M6 | **Auto-instrument** | Vercel AI SDK adapter (then LangChain.js). <10-line integration. | ✅ Done |
| M7 | **Failure replay (P2)** | Re-run a failed trace from captured inputs. | ✅ Done |

M0–M4 = the demoable MVP. M5–M6 = make it sticky. M7 = the second wow.

### Build status (2026-06-06)

**M0–M7 are built, typecheck clean, and verified** — 28 tests pass (5 SDK core + 5
adapter + 6 replay-unit + 12 API integration against live Postgres + MinIO), plus
an end-to-end smoke (real SDK → HTTP → DB), a live replay UI round-trip
(browser → Next proxy → API), and a `next build`. **Layer 4 is feature-complete
for the MVP.**

M5–M7, what shipped:
- **M5 — Cost + latency dashboard.** `/analytics` page over the existing cost/latency
  endpoints (cost-over-time bars, cost-by-model + latency-by-type tables) plus an
  overview usage panel. Sidebar/topbar/overview shell.
- **M6 — Auto-instrumentation.** `@romanica/sdk/vercel` (`wrapAISDK`) wraps a Vercel
  AI SDK model once and emits `llm` spans for every `generateText`/`streamText` call
  (handles both v1 and v2 usage shapes, incl. streamed responses). `@romanica/sdk/langchain`
  (`romanicaTracer`) is a dependency-free LangChain callback handler that maps chains→`agent`,
  models→`llm`, tools→`tool`, retrievers→`retrieval`, nested by run id. Both find the
  active trace through a new `traceContext` (AsyncLocalStorage), so wrapped objects need
  no per-call threading. Manual start/end span lifecycle (`Trace.startSpan` / `Span.finish`)
  was added to support the callback (non-callback-scoped) model.
- **M7 — Failure replay.** `POST /v1/traces/:id/replay` reconstructs each captured `llm`
  span's exact request (messages + params) and re-issues it via an injectable
  `ModelInvoker` (default: OpenAI-compatible, key from env/request), diffing fresh output
  vs. the recording (`changed` flag) and optionally persisting the replay as its own trace
  (`metadata.replayOf`). With no key it still returns the reconstructed plan. Dashboard
  `ReplayPanel` on the trace-detail page calls a key-hiding Next route handler.

Bug fixed along the way:
- **Bare-string payloads were dropped on read.** Bun's PG driver already parses jsonb, so
  `asObject` re-parsing a string value (e.g. an LLM's plain-string output) failed and fell
  back to null. Fixed to keep the string on parse failure — LLM string outputs now
  round-trip (regression test added). This directly matters for M7's output diff.

What shipped beyond the original sketch, worth recording:
- **L1 runtime seed.** `agent_definitions` and `agent_runs` plus `/v1/agents` and
  `/v1/runs` store runtime definitions and run lifecycle requests. They are control-plane
  records only; Romanica still does not execute user code in this layer.
- **Trace-fed L5/L9 seeds.** L4 now exposes read-only downstream surfaces without
  activating the full roadmap layers: `/v1/routing/models` ranks observed model
  candidates by cost, latency, and error rate, and `/v1/evaluations/summary` turns
  captured traces into failure signals plus exportable LLM regression cases. The
  dashboard surfaces these at `/routing` and `/evaluations`.
- **L2 orchestration seed.** `workflows` plus `/v1/workflows` store versioned workflow
  definitions as control-plane objects. They do not execute yet; execution stays deferred
  to the runtime/orchestration layers.
- **L3 memory seed.** `memories` plus `/v1/memories` store scoped semantic/episodic/
  procedural/fact records, with optional source links back to traces, messages, or
  workflows. `/memories` exposes the active memory set.
- **L6 scaling seed.** `worker_pools` plus `/v1/pools` track capacity snapshots, queue
  depth, utilization, and pressure. `/pools` exposes the control-plane view; no autoscaler
  loop runs yet.
- **L8 governance seed.** Ingest and replay now append project-scoped audit events to
  `audit_events`; `/v1/audit/events` and `/audit` expose the event trail.
- **L7 communication seed.** `agent_messages` plus `/v1/messages` give projects a small
  JSON message bus for agent handoffs; `/messages` lists recent channel activity.
- **L10 collaboration seed.** `approvals` plus `/v1/approvals` create human checkpoints
  and record approve/reject/cancel decisions. `/approvals` exposes the queue.
- **Runtime is Bun**, not Node — `shared` is consumed as raw `.ts` (no build step);
  the API runs on `Bun.serve`; Postgres + S3 use Bun-native clients.
- **Postgres dev port is `5433`** (container remapped to avoid clashing with a local
  Postgres on 5432).
- **jsonb gotcha (solved):** Bun's PG driver double-encodes `JSON.stringify(obj)::jsonb`
  into a jsonb *string*, silently breaking `->>` queries. Objects/arrays/strings/null
  must be bound directly (no cast); numbers/booleans go through `to_jsonb()`. Handled by
  a `jb()` binder in the ingest path.
- **Pricing/cost** lives in `shared` (`MODEL_PRICES` + `estimateCostUsd`), so the SDK can
  estimate cost client-side and the API can roll it up consistently.

---

## 10. Definition of done (MVP)

A developer can:
1. `npm install @romanica/sdk` and wrap an existing agent in <10 lines.
2. Run the agent → traces appear in the dashboard automatically.
3. Open a failed run → see the step tree, every prompt/response, every tool call, and token cost — without reading raw logs.

---

## 11. Open decisions (defaults set — easy to revisit)

| Decision | Default chosen | Why |
|----------|---------------|-----|
| **Span format** | OpenTelemetry-shaped + agent-native attributes | Interop with existing OTel tooling; we don't reinvent the wire format, just add agent semantics. |
| **First integration** | Generic `trace()/span()` wrapper first (P0), then Vercel AI SDK auto-instrument (P1) | Manual wrapper works with *everything* day one; auto-instrument is the adoption accelerator right after. |
| **Hosting** | Hosted-first | Fastest feedback loop; self-host added when an enterprise requires it. |
| **API framework** | Hono (lightweight, edge-friendly) | Can revisit for Fastify if we need Node-specific libs. |

---

## 12. Principles (keep us honest)
- **Never break the user's app.** Export is async, buffered, and fails silently.
- **TS first, Rust when data demands it.** Don't build the Rust ingest core until volume proves the need.
- **Trace tree is the product.** Everything else (cost, latency, replay) hangs off the core run-tree view.
- **No research promises.** Reasoning/hallucination scoring stays out of the MVP.
- **<10 lines to adopt** is the north-star constraint for the SDK. If integration gets heavier, stop and fix it.
