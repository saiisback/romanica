# romanica-agent-compiler

Rust seed for the Layer 2 workflow compiler. It validates a workflow DAG and
emits deterministic execution stages, grouping independent nodes that can run in
parallel.

This is not a workflow executor yet. It is the compiler boundary that future
orchestration/runtime services can call before dispatching work.

## Commands

```bash
cargo test -p romanica-agent-compiler
cat workflow.json | cargo run -q -p romanica-agent-compiler --bin romanica-agent-compiler
```

