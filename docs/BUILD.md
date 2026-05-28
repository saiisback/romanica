# Romanica — Full 10-Layer Build Doc

> North star: infrastructure for autonomous AI systems (see [romanica.md](./romanica.md)).
> This is the **detailed execution doc for all 10 layers**. Every layer is specced in full.
> But we build **one layer at a time**. The active target is marked 🟢; the rest are 📋 roadmap.

**Active build target:** 🟢 **Layer 4 — AgentOps & Observability**
**Rule:** a layer moves 📋 → 🟢 only when the current active layer has real, depending users. One active layer at a time.
**Stack:** TypeScript for the SDK / API / dashboard. **Rust is the engine layer** (ingest core, agent compiler, runtime). See [Technology Stack](#technology-stack).

---

## Status map

| # | Layer | Status | Activation trigger |
|---|-------|--------|--------------------|
| 1 | Agent Runtime | 📋 Roadmap | Users want us to *run* agents, not just observe them. |
| 2 | Workflow Orchestration | 📋 Roadmap | Multi-step agent graphs become the dominant user need. |
| 3 | State & Memory | 📋 Roadmap | Users need persistent cognition across runs. |
| 4 | **AgentOps & Observability** | 🟢 **Active** | — (current) |
| 5 | Dynamic Model Routing | 📋 Roadmap | Trace data (L4) shows cost/latency pain worth optimizing. |
| 6 | Scaling Infra | 📋 Roadmap | We run workloads at volume (needs L1). |
| 7 | Agent Communication | 📋 Roadmap | Real multi-agent demand exists. |
| 8 | Security & Governance | 📋 Roadmap | First enterprise deal requires it. |
| 9 | Evaluation Infra | 📋 Roadmap | Traces (L4) become regression tests. |
| 10 | Human Collaboration | 📋 Roadmap | Orchestration (L2) provides intervention points. |

---

# Technology Stack

**Two-language architecture: TypeScript for surfaces, Rust for engines.**

| Tier | Language | What lives here |
|------|----------|-----------------|
| **Surface** | **TypeScript** | SDK (the thing users import), API/gateway, dashboard (Next.js), control plane. Shared types end-to-end. Fast iteration. |
| **Engine** | **Rust** | The hot/heavy paths: trace ingest & processing core, agent compiler, sandboxed runtime. Built incrementally, per-layer, only when that layer is active and needs it. |

### Why TypeScript on the surface
- Target users live in the TS agent ecosystem (Vercel AI SDK, LangChain.js, Mastra, Next.js). SDK adoption is frictionless there.
- One type system across SDK → API → dashboard = real velocity.
- Tradeoff accepted: smaller slice of today's agent market than Python. We bet on the TS agent ecosystem growing.

### Why Rust for the engine
Rust is Romanica's engine material across three layers. Each is a separate, incremental build — we do **not** start them all at once:

| Rust engine | Layer | Role | When we build it |
|-------------|-------|------|------------------|
| **Trace ingest/processing core** | L4 🟢 | High-throughput span ingestion + processing (Vector / OTel-collector style). | **Phase 1b** — *after* the TS ingest MVP proves the product, when volume demands throughput. Not day one. |
| **Agent compiler** | L2 | Compile TS agent/workflow definitions → an optimized execution plan/bytecode. | When L2 activates. |
| **Runtime / TS→WASM sandbox** | L1 | Compile/run user agent code in a fast, isolated WASM/Rust sandbox. | When L1 activates. Largest single undertaking — explicitly deferred. |

### The discipline that keeps this sane
1. **TS first, always.** Every layer ships a TypeScript version first to validate the product.
2. **Rust follows evidence.** A Rust engine gets built only when (a) its layer is active and (b) data shows the TS version is the bottleneck. The L4 trace data itself tells us when ingest needs Rust.
3. **No premature compilers.** Roles 2 and 3 (agent compiler, WASM sandbox) are acknowledged long-term goals, scheduled behind their layers' activation triggers — we build toward them over time, not now.

> The long arc: **TS is how people touch Romanica; Rust is what makes it fast.** We earn each Rust engine by first proving the layer in TypeScript.

---

# Layer 1 — Agent Runtime 📋

**Purpose:** the execution foundation. Run agents as isolated, persistent, long-running workers — not ephemeral function calls.

### Responsibilities
- Run agents in isolated environments
- Manage the full execution lifecycle (start, pause, resume, kill)
- Schedule workloads onto compute
- Handle retries and recovery
- Manage queues and backpressure
- Allocate compute (CPU/GPU/memory)
- Coordinate long-running tasks across time

### Features
- **Sandboxed execution** — each agent in an isolated runtime; no cross-contamination, bounded blast radius.
- **Runtime persistence** — agents pause, resume, checkpoint, recover without losing progress.
- **Async execution** — long-running workflows (minutes to days) are first-class, not request/response.
- **Event-driven runtime** — agents react to events, not only synchronous calls.
- **Distributed execution** — agents run across nodes, regions, clusters.

### Architecture
```txt
Scheduler → Execution Queue → Runtime Workers (sandboxed) → Tools/Models
                                     │
                              Checkpoint store (state snapshots)
```

### Tech direction
Docker, Kubernetes, Firecracker microVMs (hard isolation), Redis (queues/state), NATS/Kafka (events), Temporal (durable execution), Postgres (metadata).

### Hard problems
- **Pause/resume of a live LLM agent** mid-reasoning is genuinely hard — you must serialize not just memory but in-flight tool calls and partial context.
- **Cost of isolation** — microVMs per agent is expensive at scale; needs pooling/warm-start.
- **Durable execution semantics** — exactly-once vs. at-least-once for side-effecting tool calls.

### Activation trigger
Users say "stop just watching — run it for me." Earned *after* L4 proves we understand agent execution.

---

# Layer 2 — Workflow Orchestration 📋

**Purpose:** the coordination brain. Turn single agents into coordinated, multi-step, multi-agent workflows.

### Features
- **DAG-based workflows** — complex execution graphs of agent/tool steps.
- **Multi-agent coordination** — agents delegate to and collaborate with each other.
- **Human-in-loop nodes** — humans approve, edit, or intervene at defined points.
- **Retry policies** — intelligent, configurable retries per node.
- **Fallback logic** — auto-switch agents, tools, or models on failure.
- **Scheduled workflows** — recurring autonomous operations (cron-like).
- **Workflow versioning** — track and diff execution-graph changes over time.
- **Parallel execution** — many agents/branches running simultaneously.

### Architecture
```txt
Workflow definition (DAG) → Orchestrator → dispatches nodes → Runtime (L1)
        │                         │
   Versioned store          State/checkpoints (L3)
```

### Tech direction
Temporal or a custom DAG engine, Postgres for workflow state, NATS/Kafka for node events.

### Hard problems
- **Competes directly with Temporal/Prefect** — must be *agent-aware* (retries that re-prompt, fallbacks that swap models) to justify existing.
- **Determinism vs. LLM nondeterminism** — replaying a workflow when steps are stochastic.
- **Human-in-loop latency** — a workflow may block for hours/days on a human; the runtime must hold state cheaply.

### Activation trigger
Multi-step / multi-agent graphs become the dominant pattern among L4 users.

---

# Layer 3 — State & Memory 📋

**Purpose:** treat agent state as *distributed cognitive state*, not chat history. The most differentiated and most research-heavy layer.

### Memory types
- **Local memory** — private to one agent.
- **Shared organizational memory** — cross-agent knowledge graph.
- **Episodic memory** — records of past execution experiences.
- **Semantic memory** — persistent retrieved knowledge.
- **Temporal memory** — time-aware historical context.

### Features
- **Checkpointing** — save execution state at critical stages.
- **Resumable execution** — recover from a crash and continue.
- **State snapshots** — versioned cognitive state.
- **Memory compression** — reduce context overload.
- **Context ranking** — prioritize the most relevant memory.
- **Memory aging** — old memories decay over time.
- **Memory lineage** — track where each piece of information originated.
- **Shared memory graph** — knowledge accessible across agents.

### Architecture
```txt
Agent ↔ Memory API
            ├── Vector store (semantic)
            ├── Postgres (episodic/structured)
            ├── Graph DB (shared org knowledge)
            └── Object store (snapshots)
```

### Tech direction
Vector DB (pgvector/Qdrant), Postgres, a graph store (Neo4j-style), object storage for snapshots.

### Hard problems
- **Memory lineage and aging** are unsolved at the product level — there's no standard for "where did this belief come from" or "how should it decay."
- **Compression without losing the thing that mattered** — lossy by nature.
- **Shared memory consistency** across concurrent agents.

### Activation trigger
Users need cognition that persists and improves across runs, not just within one.

---

# 🟢 Layer 4 — AgentOps & Observability (ACTIVE)

**Purpose:** make cognitive failure observable. When an agent fails, loops, or burns tokens, show *exactly* why.

## One-sentence pitch
> When your agent fails, loops, or burns tokens, you have no idea why. We make agent execution observable — trace every step, replay any failure, see what it cost.

## The acute pain (the wedge)
Not "observability" in the abstract — one specific moment:
> An agent did something wrong in production. The dev opens logs, sees a wall of JSON, and *cannot* answer: which step broke, what did the model actually see, which tool returned garbage, why did it retry 6 times?

That's a 3-hour debugging session today. We make it 3 minutes.

## Scope guard — what we are NOT building
- ❌ A runtime (L1) — we observe agents running on *their* infra (LangChain, raw SDK, custom).
- ❌ Orchestration / routing / scaling / memory — roadmap layers.
- ❌ Anything requiring migration. Integration = a few lines of code.

## MVP feature set (priority order)

| Priority | Feature | What it does | Difficulty |
|----------|---------|--------------|------------|
| P0 | **Execution tracing** | Capture each run as a step tree: LLM calls, tool calls, I/O, timing. | Medium |
| P0 | **Trace viewer** | Visualize the tree; click any step → exact prompt/response/args. | Medium |
| P0 | **SDK / instrumentation** | <10 lines to wrap an agent and emit traces. Python first. | Medium |
| P1 | **Tool-call tracing** | External tool/API calls: args, returns, errors, latency. | Easy |
| P1 | **Token & cost analytics** | Per-run + aggregate tokens and $ by model/step. | Easy |
| P1 | **Latency graphs** | Where time went; find the bottleneck step. | Easy |
| P2 | **Failure replay** | Re-run a failed execution from captured inputs. | Hard |
| P2 | **State diffing** | Compare memory/state between steps or runs. | Hard |
| P3 | **Reasoning traces** | Surface decision pathways. *Needs an opinion on how — research-y.* | Hard/fuzzy |
| P3 | **Hallucination / confidence scoring** | Flag low-confidence outputs. **Deferred — unsolved, do not promise.** | Research |
| P3 | **Workflow visualization** | See distributed agent coordination. *Needs L2 to exist.* | Blocked on L2 |

**Honesty flags:** P3 items are research problems / dependent on other layers. They stay as *direction*, not MVP commitments.

## Definition of done
A developer can:
1. `pip install` the SDK and wrap an existing agent in <10 lines.
2. Run the agent; traces appear in the dashboard automatically.
3. Open a failed run and see the step tree, every prompt/response, every tool call, and token cost — without reading raw logs.

Validated when **10 real teams** run with tracing on by default and would notice if it vanished.

## Architecture (only what L4 needs)
```txt
Their agent (LangChain / raw SDK / custom)
        │  ← our SDK wraps it, emits spans
        ▼
Ingest API (collector)
        ▼
Trace store (Postgres + object store for large payloads)
        ▼
Query API
        ▼
Dashboard (trace tree, cost, latency views)
```
Deliberately boring (OpenTelemetry-shaped spans where possible). The novelty is the *agent-aware data model*, not the plumbing.

## Stack for this layer
- **SDK + API + dashboard:** TypeScript (decided).
- **Ingest MVP:** TypeScript — fast to iterate, plenty fast for early volume.
- **Rust ingest/processing core:** Phase 1b, built only when trace volume forces it (the data tells us when).

## Open decisions (resolve before/while building)
- **Hosting:** hosted-first for fast feedback? (assume yes; enterprises will later ask self-host)
- **Span format:** OpenTelemetry (interop, less invention) vs. custom (full control of agent semantics)?
- **First integration:** auto-instrument LangChain.js / Vercel AI SDK, a generic `@trace` wrapper, or both?

## Success metric
Not revenue yet — **dependence**: number of teams running our tracing by default that would notice if it disappeared.

---

# Layer 5 — Dynamic Model Routing 📋

**Purpose:** automatically pick the best model for each task. Critical for cost and reliability.

### Routing factors
Cost · latency · reliability · context size · reasoning depth · tool usage · modality.

### Example policy
```txt
Simple task        → smaller model
Coding task        → coding model
Deep reasoning     → advanced reasoning model
Low latency        → Groq / local inference
Offline            → local model
```

### Features
- **Multi-provider support** — OpenAI, Anthropic, Gemini, Groq, local / open-source inference.
- **Fallback routing** — automatic provider switching on error/timeout.
- **Cost optimization** — reduce inference spend.
- **Latency optimization** — route geographically and by context.

### Architecture
```txt
Request → Router (policy + live metrics) → chosen provider
              ▲
        fed by L4 trace data (cost/latency/reliability history)
```

### Hard problems
- **Quality-aware routing** — cheaper model is only "better" if it doesn't tank task quality; needs eval signal (L9).
- **Provider API drift** — normalizing across providers is ongoing maintenance.

### Activation trigger
L4 trace data shows cost/latency pain large enough to justify optimization. **This layer is fed by L4 — natural Phase 2.**

---

# Layer 6 — Scaling Infrastructure 📋

**Purpose:** scale agent workers reliably under real load.

### Features
- **Horizontal scaling** — scale workers across clusters.
- **Vertical scaling** — dynamic compute per workload complexity.
- **GPU scheduling** — allocate GPUs intelligently.
- **Queue-aware autoscaling** — scale on workload pressure, not just CPU.
- **Regional distribution** — deploy globally.

### Architecture
```txt
Queue depth / load metrics → Autoscaler → adjusts Runtime Worker pool (L1)
                                              │
                                       GPU scheduler
```

### Tech direction
Kubernetes HPA/KEDA, GPU operators, queue metrics (Redis/Kafka), regional clusters.

### Hard problems
- **GPU scheduling** is its own discipline; cold-start and fragmentation are brutal.
- **Scaling stateful, long-running agents** (vs. stateless web pods) is much harder.

### Activation trigger
We run workloads at volume — requires L1 to exist first.

---

# Layer 7 — Agent Communication 📋

**Purpose:** give agents communication primitives so they can coordinate.

### Features
- **Event bus** — publish/subscribe architecture.
- **Agent messaging** — direct inter-agent communication.
- **Task delegation** — agents assign work to other agents.
- **Shared channels** — collaborative execution spaces.
- **Consensus workflows** — distributed coordination/agreement.
- **Context passing** — transfer relevant memory/state between agents.

### Architecture
```txt
Agents ↔ Event Bus (pub/sub) ↔ Agents
            │
     Context passing via Memory (L3)
```

### Tech direction
NATS/Kafka for the bus, schema/contracts for messages, ties into L3 for context payloads.

### Hard problems
- **Consensus among nondeterministic agents** — what does "agreement" even mean when outputs are stochastic?
- **Message-storm / infinite-delegation loops** — needs governance (L8) and observability (L4) to debug.

### Activation trigger
Real multi-agent demand exists (not speculative).

---

# Layer 8 — Security & Governance 📋

**Purpose:** the enterprise gate. Control what agents can do and prove it.

### Features
- **IAM system** — permissions for agents (identity, roles, scopes).
- **Policy engine** — restrict behavior (allow/deny rules on tools, data, actions).
- **Audit logs** — track all activity, immutable.
- **Sandbox isolation** — prevent unsafe execution (ties to L1).
- **Secret management** — secure credential storage/injection.
- **Compliance** — SOC2, GDPR, HIPAA readiness.
- **Execution boundaries** — cap resources and permissions per agent.

### Architecture
```txt
Every agent action → Policy Engine (allow/deny) → audit log
       │
   IAM identity + scoped secrets injected at runtime (L1)
```

### Tech direction
OPA-style policy engine, vault for secrets, append-only audit store, SSO/SCIM for IAM.

### Hard problems
- **Compliance certifications** (SOC2/HIPAA) are time + process, not just code.
- **Policy on nondeterministic agents** — defining "unsafe action" precisely.

### Activation trigger
The first enterprise deal that requires it pulls it in — don't pre-build.

---

# Layer 9 — Evaluation Infrastructure 📋

**Purpose:** continuous evaluation — agents must be tested like software, continuously.

### Features
- **Benchmark suites** — measure performance against task sets.
- **Regression testing** — catch quality degradation across versions.
- **Prompt / version testing** — track and A/B prompt changes.
- **Synthetic testing** — generate edge cases automatically.
- **Chaos engineering** — inject failures intentionally to test resilience.
- **Reliability scoring** — quantify production readiness.

### Architecture
```txt
L4 traces → captured as test cases → Eval runner → scores/regressions
                                          │
                                  feeds Routing (L5) quality signal
```

### Hard problems
- **What's "correct"** for an open-ended agent task — grading is itself an AI problem.
- **Chaos for agents** — injecting realistic cognitive failures, not just network faults.

### Activation trigger
L4 traces become regression tests — **strong Phase 2 add-on**, reuses L4 data.

---

# Layer 10 — Human Collaboration 📋

**Purpose:** keep humans in the loop where it matters.

### Features
- **Approval checkpoints** — human verification nodes in a workflow.
- **Intervention controls** — pause or redirect a live execution.
- **Co-pilot workflows** — human + agent working together.
- **Escalation chains** — move stuck/risky tasks to humans.
- **Editable reasoning** — correct an agent's output/plan mid-run.

### Architecture
```txt
Workflow (L2) hits a human node → notify human → approve/edit/redirect → resume
```

### Hard problems
- **Holding state cheaply** while blocked on a human for hours/days (depends on L1/L3).
- **Editable reasoning** — letting a human rewrite an agent's plan without corrupting downstream state.

### Activation trigger
Orchestration (L2) provides the intervention points this layer needs.

---

# Cross-layer dependency graph

```txt
        ┌─────────────────────────────────────────┐
        │              L4 Observability  🟢          │  ← start here
        └───────┬───────────────┬───────────────────┘
                │ feeds          │ feeds
                ▼                ▼
        L9 Evaluation       L5 Model Routing
                │                │
                └──────┬─────────┘
                       ▼
                  L1 Runtime ──► L6 Scaling
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
        L2 Orch    L3 Memory   L8 Security
            │          │
            ▼          │
        L10 Human ◄────┘
            │
            ▼
        L7 Agent Comms
```
Read it as: **L4 is the root.** Its trace data feeds eval and routing. Earning runtime (L1) unlocks scaling, orchestration, memory, security — which in turn unlock human-loop and multi-agent comms.

---

# Phasing

| Phase | Layers | Stack | Rationale |
|-------|--------|-------|-----------|
| **1 (now)** | L4 | TS | Observability MVP — SDK + API + dashboard in TypeScript. Get 10 teams depending on it. |
| **1b** | L4 | + Rust | Swap the ingest/processing core to Rust *when volume demands it*. Triggered by L4's own data. |
| **2** | L9, L5 | TS | Both *reuse L4's trace data* — minimal new surface, high leverage. |
| **3** | L1, then L6 | Rust | Runtime (Rust/WASM sandbox) then scaling. Heaviest infra; the big Rust build. |
| **4** | L2, L3 | TS + Rust | Orchestration (Rust agent compiler) + persistent memory on top of runtime. |
| **5** | L8, L10, L7 | TS | Enterprise governance, human-loop, multi-agent comms — demand-pulled. |

**The discipline:** this doc describes all 10 in full so the vision is legible — but only the 🟢 layer gets built. Everything else waits for its activation trigger.
