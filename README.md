# Romanica — Layer 4: AgentOps & Observability

Drop-in observability for AI agents. Wrap your agent → every run streams to the
backend as a structured trace → open the dashboard and see (and replay) exactly
what happened.

Build spec: [layer-4-observability.md](./layer-4-observability.md) ·
10-layer map: [BUILD.md](./BUILD.md) · vision: [romanica.md](./romanica.md)

## Stack

TypeScript everywhere, run on **Bun**. Postgres for trace/span metadata,
S3-compatible object store (MinIO in dev) for large input/output blobs. Rust
ingest core is Phase 1b — not yet.

## Layout

```
packages/shared   @romanica/shared — span/trace schema (single source of truth)
packages/sdk      @romanica/sdk — trace()/span() primitives          (M1)
apps/api          ingest + query API (Hono)                          (M2/M3)
apps/web          dashboard (Next.js)                                (M4)
db/migrations     Postgres schema
scripts/migrate.ts  forward-only migration runner (Bun-native PG)
```

## Dev setup

```bash
bun install
cp .env.example .env          # defaults match docker-compose
bun run db:up                 # Postgres (host :5433) + MinIO (:9000, console :9001)
bun run db:migrate            # apply migrations; seeds project "dev" / api key rom_dev_key
```

> Postgres is mapped to host port **5433** to avoid clashing with a local
> Postgres on 5432. MinIO console: http://localhost:9001 (romanica / romanica123).

Useful scripts:

| Command | Does |
|---------|------|
| `bun run typecheck` | typecheck all workspaces |
| `bun run db:up` / `db:down` | start / stop containers |
| `bun run db:migrate` | apply pending migrations (idempotent) |
| `bun run db:reset` | wipe volumes, recreate, re-migrate |

## Status

- [x] **M0** — monorepo, shared span schema, Postgres migrations
- [x] **M1** — SDK core (`trace()` / `span()`, batched async export)
- [x] **M2** — Ingest API (`POST /v1/traces`, auth, S3 blob offload, cost rollup)
- [x] **M3** — Query API (list / detail with span tree / cost + latency analytics)
- [ ] M4 — Dashboard: trace tree viewer
