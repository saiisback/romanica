# Romanica Platform Status

Current implementation keeps Layer 4 as the production center, then adds real
control-plane paths for the roadmap layers. The local platform now has active
APIs, persistence, dashboard visibility, and tests across all ten layers.

## Built

| Layer | Surface | What exists |
|---|---|---|
| L1 Runtime | `/v1/agents`, `/v1/runs`, `/v1/runs/:id/execute`, `/agents`, `/runs` | Agent definitions, run lifecycle, and persisted HTTP-agent execution attempts. |
| L2 Orchestration | `/v1/workflows`, `/v1/workflows/:id/compile`, `/v1/workflow-runs`, `/v1/workflow-runs/:id/dispatch`, `/workflows`, `/workflow-runs` | Versioned workflows, Rust DAG compilation, and dispatch lifecycle records. |
| L3 Memory | `/v1/memories`, `/v1/memories/search`, `/memories` | Scoped records plus ranked retrieval by query, kind, scope, confidence, and freshness. |
| L4 Observability | traces, analytics, replay, SDK | Full active MVP: ingest, query, dashboard, replay, adapters. |
| L5 Routing | `/v1/routing/models`, `/v1/routing/select`, `/routing` | Observed candidates plus call-time model selection with cost, latency, and health constraints. |
| L6 Scaling | `/v1/pools`, `/v1/pools/:id/autoscale`, `/v1/autoscaling/decisions`, `/pools` | Worker-pool pressure, recommended counts, applied decisions, and desired-worker updates. |
| L7 Communication | `/v1/messages`, `/messages` | Project-scoped JSON message bus for agent handoffs. |
| L8 Governance | scoped API keys, `/v1/policies/evaluate`, `/v1/audit/events`, `/governance`, `/audit` | Route-family API scopes, policy decisions for planned actions, and immutable audit events. |
| L9 Evaluation | `/v1/evaluations/summary`, `/evaluations` | Trace-derived failure signals and LLM regression cases. |
| L10 Collaboration | `/v1/approvals`, `/approvals` | Human approval checkpoints and decisions. |

## Validation

- `bun run typecheck`
- `bun test`
- `bun run rust:test`
- `bun run --filter '@romanica/web' build`
- `bun run scripts/check-dashboard.ts` with API and web servers running

## Useful Dev Flow

```bash
bun run db:up
bun run db:migrate
bun run --filter '@romanica/api' start
bun run --filter '@romanica/web' dev
bun run scripts/seed-platform.ts
bun run scripts/check-dashboard.ts
```

## Boundaries

The remaining production work is mostly infrastructure hardening: OS/container sandboxing
for arbitrary user code, distributed worker deployment, secret storage, rollout packaging,
and migration rollback operations. The local product paths now exercise the engines
without requiring those external control planes.

## Rust Engines

- `engines/ingest-core`: validates the ingest wire payload and computes trace
  rollups in Rust. It includes a stdin/stdout CLI for exercising the boundary.
- `engines/agent-compiler`: validates workflow DAGs and emits deterministic
  execution stages. It includes a stdin/stdout CLI for compiler-boundary tests.
