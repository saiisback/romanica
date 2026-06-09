![Romanica](./assets/readme-hero.png)

> **AWS + Kubernetes + Datadog + Temporal for autonomous AI systems.**

Romanica is infrastructure for AI agents. Not a chatbot builder, not another wrapper
around model APIs — the runtime and operations layer that treats agents as what they
actually are: **long-running, distributed cognitive workers**, not chat sessions.

The full platform is a 10-layer system (runtime, orchestration, memory, observability,
routing, scaling, comms, security, evaluation, human-in-loop). We build **one layer at a
time**, and only move to the next when the current one has real, depending users.

**The active layer today is Layer 4 — AgentOps & Observability.** It is built and working.
Everything else is specced as roadmap but deliberately not built yet.

- 📐 Vision / PRD: [`docs/romanica.md`](./docs/romanica.md)
- 🗺️ Full 10-layer build doc: [`docs/BUILD.md`](./docs/BUILD.md)
- 🟢 Active layer spec: [`docs/layer-4-observability.md`](./docs/layer-4-observability.md)
- ✅ Current platform status: [`docs/platform-status.md`](./docs/platform-status.md)

---

## The thesis

Teams shipping agents today stitch together LangChain + Temporal + Redis + Kubernetes +
Langfuse + a vector DB + custom glue. The result is operational complexity, broken
workflows, silent failures, and no unified observability.

Agents resemble distributed systems more than chatbots — so they need real infrastructure:
state, checkpointing, observability, orchestration, isolation, recovery, scheduling, shared
memory, coordination, tracing. Romanica aims to be the operating system for those systems.

### Two-language architecture

| Tier | Language | What lives here |
|------|----------|-----------------|
| **Surface** | **TypeScript** | The SDK users import, the API/gateway, the dashboard. One type system end-to-end → velocity. Target users live in the TS agent ecosystem (Vercel AI SDK, LangChain.js, Mastra, Next.js). |
| **Engine** | **Rust** | The hot/heavy paths: trace-ingest core (L4), agent compiler (L2), sandboxed runtime (L1). Built incrementally, **only when a layer is active and its data proves the TS version is the bottleneck.** |

> **TS is how people touch Romanica; Rust is what makes it fast.** We earn each Rust engine
> by first proving the layer in TypeScript. Right now everything is TypeScript on Bun — no
> Rust has been written yet, by design.

---

## The 10 layers

We describe all ten so the vision is legible, but only the 🟢 layer gets built. Each other
layer has a concrete **activation trigger** — it doesn't start until that condition is met.

| # | Layer | What it does | Status |
|---|-------|--------------|--------|
| 1 | **Agent Runtime** | Run agents as isolated, persistent, long-running workers (sandbox, pause/resume, scheduling, recovery). | 📋 Roadmap |
| 2 | **Workflow Orchestration** | DAG workflows, multi-agent coordination, human-in-loop nodes, retries, fallbacks, versioning. | 📋 Roadmap |
| 3 | **State & Memory** | Agent state as distributed cognition: episodic/semantic/temporal memory, checkpointing, lineage, aging. | 📋 Roadmap |
| 4 | **AgentOps & Observability** | Trace every agent run as a step tree; replay failures; see token cost & latency. | 🟢 **Active — built** |
| 5 | **Dynamic Model Routing** | Pick the best model per task by cost / latency / reliability. Fed by L4 trace data. | 📋 Roadmap |
| 6 | **Scaling Infrastructure** | Horizontal/vertical autoscaling, GPU scheduling, queue-aware scaling, regional distribution. | 📋 Roadmap |
| 7 | **Agent Communication** | Event bus, inter-agent messaging, task delegation, shared channels, consensus. | 📋 Roadmap |
| 8 | **Security & Governance** | IAM for agents, policy engine, immutable audit logs, secrets, compliance. | 📋 Roadmap |
| 9 | **Evaluation Infra** | Turn L4 traces into regression tests; benchmarks, synthetic testing, reliability scoring. | 📋 Roadmap |
| 10 | **Human Collaboration** | Approval checkpoints, live intervention, co-pilot workflows, escalation, editable reasoning. | 📋 Roadmap |

### Why start at Layer 4

L4 is the **root of the dependency graph**. Its trace data feeds evaluation (L9) and model
routing (L5), and the observability work teaches us how agent execution behaves before we
ever try to *run* agents ourselves (L1). It's also the sharpest wedge: when an agent fails
in production, the dev opens logs, sees a wall of JSON, and can't answer *which step broke,
what the model actually saw, which tool returned garbage, why it retried 6 times.* That's a
3-hour debugging session. **We make it 3 minutes.**

Roadmap phasing: **Phase 1** = L4 in TS (now) → **1b** = swap the ingest core to Rust when
volume demands → **Phase 2** = L9 + L5 (both reuse L4 trace data) → **Phase 3** = L1 runtime
(the big Rust build) then L6 scaling → later, orchestration/memory/governance as demand pulls.

---

## What's built today — Layer 4

A **drop-in observability layer for AI agents**. Wrap your agent with the SDK → every run
streams to the backend as a structured trace → open the dashboard and see (and soon replay)
exactly what happened. Integration is a few lines; zero infra changes; it never breaks your app.

```ts
import { Romanica } from "@romanica/sdk";

const romanica = new Romanica({ apiKey: process.env.ROMANICA_API_KEY });

await romanica.trace("support-agent", async (trace) => {
  await trace.span("retrieval", "search-kb", async (s) => {
    s.setRetrieval({ query: "refund policy", topK: 3 });
    s.setOutput(await searchKB("refund policy"));
  });

  await trace.span("llm", "draft-reply", async (s) => {
    const res = await openai.chat.completions.create({ model: "gpt-4o", messages });
    s.setLLM({ model: "gpt-4o", usage: res.usage }); // tokens + cost computed for you
    s.setOutput(res);
  });
});
```

Spans auto-nest (no manual parent wiring), timing is captured automatically, export is
buffered + batched + async, and if the backend is down it fails silently — observability
must never take down the agent.

### Data model

Three nested entities, OpenTelemetry-shaped with agent-native attributes layered on:

```
Project  ──►  Trace (one full agent run)  ──►  Span (one step; nests into a tree)
```

- **Span types:** `llm` · `tool` · `retrieval` · `agent` · `custom`
- **Type-specific attributes:** LLM (model, provider, prompt/completion tokens, cost,
  temperature, tool calls), tool (name, args, result), retrieval (query, top-k, documents).
- **Large `input`/`output` payloads** (>16 KB) are offloaded to object storage and referenced
  by key; only metadata + small fields live in Postgres, keeping the relational store fast.
- **Token & cost** roll up from spans to the trace using a per-model price table in `shared`,
  so the SDK estimates cost client-side and the API rolls it up consistently.

### Architecture

```
 Your agent (Vercel AI SDK / LangChain.js / raw SDK / custom)
        │   @romanica/sdk wraps it — buffers + batches spans
        ▼   HTTPS  POST /v1/traces  (Bearer API key)
┌──────────────────────┐
│  Ingest API (Hono)   │  auth → validate (zod) → offload big blobs → cost rollup
└──────────┬───────────┘
           ▼
┌──────────────────────────────────────────┐
│  Storage                                   │
│   • Postgres — projects, traces, spans     │
│   • S3 / MinIO — large input/output blobs  │
└──────────┬─────────────────────────────────┘
           ▼
┌──────────────────────┐
│  Query API (Hono)    │  trace list (keyset) · trace+tree detail · cost & latency analytics
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Dashboard (Next.js) │  trace list → detail: collapsible span tree, waterfall, I/O viewer
└──────────────────────┘
```

> **Phase 1b:** the ingest hot path gets rewritten in **Rust** when span volume demands it.
> The SDK and API contract stay identical, so it's a transparent swap. Not built yet.

### API surface

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/health` | liveness |
| `POST` | `/v1/traces` | ingest a batch of traces/spans |
| `GET`  | `/v1/traces` | paginated trace list (filter by status / time) |
| `GET`  | `/v1/traces/:id` | full trace with rehydrated span tree |
| `GET`  | `/v1/analytics/cost` | token & cost aggregates over time |
| `GET`  | `/v1/analytics/latency` | per-step latency distribution (p50/p95/p99) |
| `POST` | `/v1/agents` | create/update an agent runtime definition |
| `GET`  | `/v1/agents` | list agent runtime definitions |
| `POST` | `/v1/runs` | queue an agent run request |
| `GET`  | `/v1/runs` | list agent run requests |
| `POST` | `/v1/runs/:id/status` | update run lifecycle status |
| `GET`  | `/v1/routing/models` | observed model candidates for trace-fed routing policies |
| `GET`  | `/v1/evaluations/summary` | trace-derived failure signals and exportable LLM cases |
| `POST` | `/v1/messages` | publish a project-scoped agent message |
| `GET`  | `/v1/messages` | list recent agent messages by channel/status |
| `POST` | `/v1/messages/:id/ack` | acknowledge or fail an agent message |
| `POST` | `/v1/workflows` | create/update a workflow definition |
| `GET`  | `/v1/workflows` | list workflow definitions |
| `GET`  | `/v1/workflows/:id` | get workflow definition detail |
| `POST` | `/v1/memories` | create/update a project-scoped memory record |
| `GET`  | `/v1/memories` | list active memories by kind/scope |
| `GET`  | `/v1/memories/:id` | get memory detail |
| `POST` | `/v1/pools` | create/update a worker pool capacity snapshot |
| `GET`  | `/v1/pools` | list worker pool capacity and pressure |
| `POST` | `/v1/approvals` | create a human approval checkpoint |
| `GET`  | `/v1/approvals` | list approval checkpoints |
| `POST` | `/v1/approvals/:id/decision` | approve/reject/cancel a checkpoint |
| `GET`  | `/v1/audit/events` | project audit trail for ingest and replay events |

All `/v1/*` routes require a `Bearer <api-key>` that resolves to a project.

---

## Repo layout

```
romanica/                     Bun workspace root
├── packages/
│   ├── shared/               @romanica/shared — span schema, pricing, span-tree builder
│   │                           (single source of truth: SDK, API & web all import it)
│   └── sdk/                  @romanica/sdk — trace()/span() primitives, batched async export
│                               (adapters/ for Vercel AI SDK + LangChain land in M6)
├── apps/
│   ├── api/                  ingest + query API — Hono on Bun.serve
│   └── web/                  dashboard — Next.js App Router + Tailwind
├── db/migrations/            Postgres schema (0001_init.sql)
├── scripts/                  migrate.ts · seed.ts · smoke.ts  (run with Bun)
├── docs/                     romanica.md (vision) · BUILD.md (10 layers) · layer-4-observability.md
└── docker-compose.yml        Postgres (:5433) + MinIO (:9000, console :9001)
```

Stack: **TypeScript everywhere, running on [Bun](https://bun.sh)**. `@romanica/shared` is
consumed as raw `.ts` (no build step); the API runs on `Bun.serve`; Postgres and S3 use
Bun-native clients. Postgres for trace/span metadata, S3-compatible object storage (MinIO in
dev) for large blobs.

---

## Quickstart

Requires **Bun ≥ 1.3** and **Docker**.

```bash
bun install
cp .env.example .env          # defaults match docker-compose
bun run db:up                 # Postgres (host :5433) + MinIO (:9000, console :9001)
bun run db:migrate            # apply migrations; seeds project "dev" / api key rom_dev_key
```

> Postgres is mapped to host port **5433** to avoid clashing with a local Postgres on 5432.
> MinIO console: http://localhost:9001 (login `romanica` / `romanica123`).

### Run it

```bash
# terminal 1 — API (ingest + query) on :4000
bun run --filter '@romanica/api' dev

# terminal 2 — dashboard on :3000
bun run --filter '@romanica/web' dev

# terminal 3 — emit a sample trace, then open http://localhost:3000
bun run scripts/seed.ts
```

The dashboard reads `API_URL` (default `http://localhost:4000`) and `ROMANICA_API_KEY`
(default `rom_dev_key`) server-side.

### Scripts

| Command | Does |
|---------|------|
| `bun run typecheck` | typecheck all workspaces |
| `bun test` | run the SDK + API test suites |
| `bun run db:up` / `db:down` | start / stop containers |
| `bun run db:migrate` | apply pending migrations (idempotent) |
| `bun run db:reset` | wipe volumes, recreate, re-migrate |
| `bun run scripts/seed.ts` | emit one realistic trace via the SDK |
| `bun run scripts/seed-platform.ts` | seed trace + runtime/workflow/memory/pool/message/approval demo data |
| `bun run scripts/smoke.ts` | end-to-end check: SDK → HTTP → API → DB |
| `bun run scripts/check-dashboard.ts` | smoke API health + dashboard routes with servers running |

---

## Status

Layer 4 ships in milestones M0–M7. **M0–M7 are built, typecheck clean, and verified**
when Postgres + MinIO are running — SDK core tests, adapter tests, replay unit tests, API
integration tests, an end-to-end smoke, and the dashboard build.

- [x] **M0** — Bun monorepo, shared span schema, Postgres migrations
- [x] **M1** — SDK core (`trace()` / `span()`, auto-nesting, batched fail-silent export)
- [x] **M2** — Ingest API (`POST /v1/traces`, auth, S3 blob offload, cost rollup)
- [x] **M3** — Query API (list / detail-with-tree / cost + latency analytics)
- [x] **M4** — Dashboard (trace list + detail: span tree, waterfall, input/output viewer)
- [x] **M5** — dedicated cost + latency dashboard views
- [x] **M6** — auto-instrument adapters: Vercel AI SDK and LangChain.js
- [x] **M7** — failure replay: re-run a failed trace from captured inputs

**M0–M4 = the demoable MVP. M5–M7 = the sticky MVP.** Next layers (L5 routing, L9
evaluation, …) stay full roadmap layers until L4 has real depending users. The repo now
includes **trace-fed seeds** for both: `/routing` ranks observed models by cost, latency,
and error rate, while `/evaluations` turns captured traces into failure signals and
regression-test cases. It includes an L1 control-plane seed: `/agents` and `/runs` store
runtime definitions and run lifecycle requests without executing user code. The L2 seed
`/workflows` stores versioned workflow definitions without executing them. The L3 state seed
is `/memories`, a scoped memory store that can link records back to traces, messages, or
workflows. The L6 scaling seed is `/pools`, a worker-pool capacity and queue-pressure view.
The L7 communication seed is `/messages` for project-scoped agent handoffs. The L10 collaboration seed is
`/approvals`, a human checkpoint and decision trail. The L8 governance seed is `/audit`, an
append-only project event trail for ingest, replay, memories, messages, pools, approvals,
and workflow changes.

---

## Principles

- **Never break the user's app** — export is async, buffered, and fails silently.
- **TS first, Rust when data demands it** — no premature engines.
- **The trace tree is the product** — cost, latency, and replay all hang off the run-tree view.
- **<10 lines to adopt** is the SDK's north-star constraint.
- **One active layer at a time** — the vision is broad on paper, narrow in execution.
