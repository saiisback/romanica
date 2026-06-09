# romanica-ingest-core

Rust seed for the Layer 4 ingest engine. It validates the SDK/API ingest wire
payload and computes trace rollups: span count, duration, tokens, and model cost.

This does not replace the TypeScript API yet. It is the engine boundary that can
be called from the API or moved behind a service when ingest volume justifies it.

## Commands

```bash
cargo test -p romanica-ingest-core
cat payload.json | cargo run -q -p romanica-ingest-core --bin romanica-ingest-core
```

The CLI reads one ingest payload from stdin and writes a JSON summary.

