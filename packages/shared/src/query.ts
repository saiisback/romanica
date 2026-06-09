import type { SpanType, SpanStatus, TraceStatus } from "./enums.ts";
import type { SpanAttributes } from "./attributes.ts";
import type { SpanError } from "./wire.ts";

/**
 * Query-API output shapes (what the dashboard consumes).
 * Timestamps are ISO-8601 strings here (display-friendly); the ingest wire
 * format uses epoch ms (runtime-friendly). Durations are milliseconds.
 */

export interface TraceSummary {
  traceId: string;
  projectId: string;
  name: string;
  status: TraceStatus;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  spanCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

/** A span enriched for display, with its children nested (the trace tree). */
export interface SpanNode {
  spanId: string;
  parentSpanId: string | null;
  type: SpanType;
  name: string;
  status: SpanStatus;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: SpanError | null;
  attributes: SpanAttributes;
  children: SpanNode[];
}

export interface TraceDetail extends TraceSummary {
  metadata: Record<string, unknown>;
  /** root spans (parentSpanId === null), each with nested children */
  spans: SpanNode[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// --- analytics ---

export interface CostBucket {
  /** ISO date or hour bucket */
  bucket: string;
  tokens: number;
  costUsd: number;
}

export interface CostByModel {
  model: string;
  tokens: number;
  costUsd: number;
  calls: number;
}

export interface CostAnalytics {
  totalTokens: number;
  totalCostUsd: number;
  series: CostBucket[];
  byModel: CostByModel[];
}

export interface LatencyByType {
  type: SpanType;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  count: number;
}

export interface LatencyAnalytics {
  traceP50Ms: number;
  traceP95Ms: number;
  traceP99Ms: number;
  byType: LatencyByType[];
}

// --- failure replay ---

export interface ReplayMessage {
  role: string;
  content: string;
}

/** Per-llm-step result of replaying a captured run. */
export interface ReplayStep {
  spanId: string;
  name: string;
  model: string | null;
  /** ok = re-issued; skipped = no provider/no request; error = call failed */
  status: "ok" | "skipped" | "error";
  reason?: string;
  /** the exact request we reconstructed from the captured span */
  request: { messages: ReplayMessage[]; params: Record<string, unknown> };
  originalOutput: unknown;
  replayedOutput?: string;
  /** did the model's output differ from the recorded run? */
  changed?: boolean;
  replayTokens?: number;
  replayCostUsd?: number;
  latencyMs?: number;
}

export interface ReplayResult {
  traceId: string;
  /** ok = all steps re-issued; partial = some skipped/errored; skipped = none ran */
  status: "ok" | "partial" | "skipped" | "error";
  steps: ReplayStep[];
  /** id of the new trace persisted from this replay, if any */
  replayTraceId?: string;
  message?: string;
}

// --- model routing (Layer 5 seed) ---

export interface ModelRoutingCandidate {
  model: string;
  calls: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgCostUsd: number;
  avgTokens: number;
  /** Lower is better. Cost, latency, and error rate are normalized together. */
  score: number;
  recommendation: "preferred" | "balanced" | "expensive" | "risky";
}

export interface ModelRoutingAnalytics {
  window: { from: string; to: string };
  candidates: ModelRoutingCandidate[];
}

export interface ModelSelection {
  selectedModel: string;
  task: string;
  reason: string;
  candidate: ModelRoutingCandidate | null;
  rejected: Array<{ model: string; reason: string }>;
}

// --- evaluation (Layer 9 seed) ---

export interface EvaluationSignal {
  kind: "trace_failure" | "span_error" | "slow_span";
  traceId: string;
  spanId?: string;
  name: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface EvaluationCase {
  traceId: string;
  spanId: string;
  name: string;
  model: string | null;
  input: unknown;
  expectedOutput: unknown;
  metadata: Record<string, unknown>;
}

export interface EvaluationAnalytics {
  window: { from: string; to: string };
  totalTraces: number;
  failedTraces: number;
  failureRate: number;
  replayTraces: number;
  replayCoverage: number;
  signals: EvaluationSignal[];
  cases: EvaluationCase[];
}

// --- audit / governance (Layer 8 seed) ---

export interface AuditEventSummary {
  id: string;
  projectId: string;
  actorType: "api_key" | "system";
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PolicyDecision {
  decision: "allow" | "deny" | "review";
  reason: string;
  requiredApproval: boolean;
  matchedRules: string[];
}

// --- agent communication (Layer 7 seed) ---

export interface AgentMessageSummary {
  id: string;
  projectId: string;
  channel: string;
  sender: string;
  recipient: string | null;
  traceId: string | null;
  status: "pending" | "acknowledged" | "failed";
  payload: unknown;
  createdAt: string;
  ackedAt: string | null;
}

// --- workflow orchestration (Layer 2 seed) ---

export interface WorkflowSummary {
  id: string;
  projectId: string;
  name: string;
  version: string;
  status: "draft" | "active" | "archived";
  nodeCount: number;
  edgeCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  definition: unknown;
}

export interface WorkflowRunSummary {
  id: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  input: unknown;
  plan: unknown;
  traceId: string | null;
  error: SpanError | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// --- state & memory (Layer 3 seed) ---

export interface MemorySummary {
  id: string;
  projectId: string;
  scope: string;
  kind: "semantic" | "episodic" | "procedural" | "fact";
  key: string;
  content: unknown;
  sourceType: string | null;
  sourceId: string | null;
  confidence: number | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchResult extends MemorySummary {
  score: number;
  rank: number;
}

// --- scaling infrastructure (Layer 6 seed) ---

export interface WorkerPoolSummary {
  id: string;
  projectId: string;
  name: string;
  status: "active" | "draining" | "paused";
  desiredWorkers: number;
  activeWorkers: number;
  queuedTasks: number;
  runningTasks: number;
  maxConcurrency: number;
  utilization: number;
  pressure: "idle" | "healthy" | "saturated";
  recommendedWorkers: number;
  scaleAction: "scale_down" | "hold" | "scale_up";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AutoscalingDecisionSummary {
  id: string;
  projectId: string;
  poolId: string;
  poolName: string;
  previousDesiredWorkers: number;
  recommendedWorkers: number;
  appliedWorkers: number | null;
  action: "scale_down" | "hold" | "scale_up";
  reason: string;
  metrics: Record<string, unknown>;
  appliedAt: string | null;
  createdAt: string;
}

// --- human collaboration (Layer 10 seed) ---

export interface ApprovalSummary {
  id: string;
  projectId: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requester: string;
  assignee: string | null;
  targetType: string | null;
  targetId: string | null;
  payload: unknown;
  decision: Record<string, unknown> | null;
  dueAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- agent runtime (Layer 1 seed) ---

export interface AgentDefinitionSummary {
  id: string;
  projectId: string;
  name: string;
  version: string;
  runtime: string;
  entrypoint: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunSummary {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  agentVersion: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  input: unknown;
  traceId: string | null;
  error: SpanError | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RuntimeAttemptSummary {
  id: string;
  projectId: string;
  runId: string;
  attempt: number;
  executor: string;
  status: "started" | "succeeded" | "failed";
  request: unknown;
  response: unknown;
  error: SpanError | null;
  startedAt: string;
  finishedAt: string | null;
}
