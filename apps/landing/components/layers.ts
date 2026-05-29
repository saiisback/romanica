export interface Layer {
  n: number;
  title: string;
  body: string;
  active?: boolean;
}

export const LAYERS: Layer[] = [
  {
    n: 1,
    title: "Agent Runtime",
    body: "Run agents as isolated, persistent, long-running workers — sandbox, pause/resume, scheduling, recovery.",
  },
  {
    n: 2,
    title: "Workflow Orchestration",
    body: "DAG workflows, multi-agent coordination, human-in-loop nodes, retries, fallbacks, versioning.",
  },
  {
    n: 3,
    title: "State & Memory",
    body: "Agent state as distributed cognition — episodic, semantic and temporal memory with checkpointing and lineage.",
  },
  {
    n: 4,
    title: "AgentOps & Observability",
    body: "Trace every run as a step tree, replay failures, and see token cost & latency. The root layer — built and live.",
    active: true,
  },
  {
    n: 5,
    title: "Dynamic Model Routing",
    body: "Pick the best model per task by cost, latency and reliability — fed directly by Layer 4 trace data.",
  },
  {
    n: 6,
    title: "Scaling Infrastructure",
    body: "Horizontal & vertical autoscaling, GPU scheduling, queue-aware scaling, regional distribution.",
  },
  {
    n: 7,
    title: "Agent Communication",
    body: "Event bus, inter-agent messaging, task delegation, shared channels and consensus workflows.",
  },
  {
    n: 8,
    title: "Security & Governance",
    body: "IAM for agents, policy engine, immutable audit logs, secret management and compliance.",
  },
  {
    n: 9,
    title: "Evaluation Infra",
    body: "Turn captured traces into regression tests — benchmarks, synthetic edge cases, reliability scoring.",
  },
  {
    n: 10,
    title: "Human Collaboration",
    body: "Approval checkpoints, live intervention, co-pilot workflows, escalation chains, editable reasoning.",
  },
];
