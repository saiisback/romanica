# Romanica Platform Status

Current implementation keeps Layer 4 as the production center, then adds
control-plane seeds for the roadmap layers. These seeds make the platform
coherent end-to-end without pretending the deferred hard parts are complete.

## Built

| Layer | Surface | What exists |
|---|---|---|
| L1 Runtime | `/v1/agents`, `/v1/runs`, `/agents`, `/runs` | Agent definitions and run lifecycle requests. No user-code execution yet. |
| L2 Orchestration | `/v1/workflows`, `/workflows` | Versioned workflow definitions. No workflow executor yet. |
| L3 Memory | `/v1/memories`, `/memories` | Scoped semantic/episodic/procedural/fact records with source links. |
| L4 Observability | traces, analytics, replay, SDK | Full active MVP: ingest, query, dashboard, replay, adapters. |
| L5 Routing | `/v1/routing/models`, `/routing` | Observed model candidates ranked by cost, latency, and error rate. |
| L6 Scaling | `/v1/pools`, `/pools` | Worker-pool capacity snapshots and queue pressure. No autoscaler loop yet. |
| L7 Communication | `/v1/messages`, `/messages` | Project-scoped JSON message bus for agent handoffs. |
| L8 Governance | `/v1/audit/events`, `/audit` | Append-only audit events for platform actions. |
| L9 Evaluation | `/v1/evaluations/summary`, `/evaluations` | Trace-derived failure signals and LLM regression cases. |
| L10 Collaboration | `/v1/approvals`, `/approvals` | Human approval checkpoints and decisions. |

## Validation

- `bun run typecheck`
- `bun test`
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

The runtime, workflow executor, memory retrieval engine, autoscaler, policy engine,
and model router are not active engines yet. What exists now is the shared data
model, API surface, audit trail, dashboard visibility, and tests needed to build
those engines incrementally.
