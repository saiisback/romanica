# Romanica Platform Status

Current implementation keeps Layer 4 as the production center, then adds
control-plane seeds for the roadmap layers. These seeds make the platform
coherent end-to-end without pretending the deferred hard parts are complete.

## Built

| Layer | Surface | What exists |
|---|---|---|
| L1 Runtime | `/v1/agents`, `/v1/runs`, `/agents`, `/runs` | Agent definitions and run lifecycle requests. No user-code execution yet. |
| L2 Orchestration | `/v1/workflows`, `/v1/workflow-runs`, `/workflows`, `/workflow-runs` | Versioned workflow definitions plus execution lifecycle records. |
| L3 Memory | `/v1/memories`, `/v1/memories/search`, `/memories` | Scoped records plus ranked retrieval by query, kind, scope, confidence, and freshness. |
| L4 Observability | traces, analytics, replay, SDK | Full active MVP: ingest, query, dashboard, replay, adapters. |
| L5 Routing | `/v1/routing/models`, `/v1/routing/select`, `/routing` | Observed candidates plus call-time model selection with cost, latency, and health constraints. |
| L6 Scaling | `/v1/pools`, `/pools` | Worker-pool capacity snapshots and queue pressure. No autoscaler loop yet. |
| L7 Communication | `/v1/messages`, `/messages` | Project-scoped JSON message bus for agent handoffs. |
| L8 Governance | `/v1/policies/evaluate`, `/v1/audit/events`, `/governance`, `/audit` | Policy decisions for planned actions plus immutable audit events. |
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

The remaining hard engine work is sandboxed user-code execution, Rust-backed workflow
dispatch, durable autoscaling loops, secret storage/IAM scopes, and deployment packaging.
Memory retrieval, model selection, and policy evaluation now have active API paths and tests.

## Rust Engines

- `engines/ingest-core`: validates the ingest wire payload and computes trace
  rollups in Rust. It includes a stdin/stdout CLI for exercising the boundary.
- `engines/agent-compiler`: validates workflow DAGs and emits deterministic
  execution stages. It includes a stdin/stdout CLI for compiler-boundary tests.
