import { z } from "zod";
import { spanTypeSchema, spanStatusSchema, traceStatusSchema } from "./enums.ts";

/**
 * The wire format: exactly what the SDK sends to `POST /v1/traces`.
 *
 * Conventions:
 *  - ids are client-generated UUIDs (the SDK owns id generation so it can build
 *    the parent/child tree before export).
 *  - timestamps are epoch milliseconds (numbers) — unambiguous across runtimes.
 *  - `project` is NOT in the payload; it is resolved from the API key.
 *  - we are liberal in what we accept: attributes/metadata are open bags and
 *    input/output are arbitrary JSON, so a user's span is never rejected over
 *    an unexpected field. Observability must never break the user's app.
 */

const epochMs = z.number().int().nonnegative();

export const spanErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
});
export type SpanError = z.infer<typeof spanErrorSchema>;

export const ingestSpanSchema = z.object({
  spanId: z.string().uuid(),
  parentSpanId: z.string().uuid().nullish(),
  type: spanTypeSchema,
  name: z.string().min(1).max(512),
  status: spanStatusSchema.default("ok"),
  startTime: epochMs,
  endTime: epochMs.optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: spanErrorSchema.nullish(),
  attributes: z.record(z.unknown()).default({}),
});
export type IngestSpan = z.infer<typeof ingestSpanSchema>;

export const ingestTraceSchema = z.object({
  traceId: z.string().uuid(),
  name: z.string().min(1).max(512),
  status: traceStatusSchema.default("running"),
  startTime: epochMs,
  endTime: epochMs.optional(),
  metadata: z.record(z.unknown()).default({}),
  spans: z.array(ingestSpanSchema).max(10_000),
});
export type IngestTrace = z.infer<typeof ingestTraceSchema>;

export const ingestPayloadSchema = z.object({
  traces: z.array(ingestTraceSchema).min(1).max(1000),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export const ingestResponseSchema = z.object({
  ok: z.literal(true),
  tracesReceived: z.number().int(),
  spansReceived: z.number().int(),
});
export type IngestResponse = z.infer<typeof ingestResponseSchema>;

// --- agent communication (Layer 7 seed) ---

export const publishMessageSchema = z.object({
  channel: z.string().min(1).max(128),
  sender: z.string().min(1).max(128),
  recipient: z.string().min(1).max(128).optional(),
  traceId: z.string().uuid().optional(),
  payload: z.unknown().default({}),
});
export type PublishMessage = z.infer<typeof publishMessageSchema>;

export const ackMessageSchema = z.object({
  status: z.enum(["acknowledged", "failed"]).default("acknowledged"),
});
export type AckMessage = z.infer<typeof ackMessageSchema>;

// --- workflow orchestration (Layer 2 seed) ---

export const workflowStatusSchema = z.enum(["draft", "active", "archived"]);

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(256),
  version: z.string().min(1).max(64).default("v1"),
  status: workflowStatusSchema.default("draft"),
  definition: z.unknown().default({}),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateWorkflow = z.infer<typeof createWorkflowSchema>;

export const createWorkflowRunSchema = z.object({
  workflowId: z.string().uuid(),
  input: z.unknown().default({}),
  traceId: z.string().uuid().optional(),
});
export type CreateWorkflowRun = z.infer<typeof createWorkflowRunSchema>;

export const updateWorkflowRunSchema = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  traceId: z.string().uuid().optional(),
  plan: z.unknown().optional(),
  error: spanErrorSchema.optional(),
});
export type UpdateWorkflowRun = z.infer<typeof updateWorkflowRunSchema>;

// --- state & memory (Layer 3 seed) ---

export const memoryKindSchema = z.enum(["semantic", "episodic", "procedural", "fact"]);

export const upsertMemorySchema = z.object({
  scope: z.string().min(1).max(128).default("project"),
  kind: memoryKindSchema,
  key: z.string().min(1).max(256),
  content: z.unknown(),
  sourceType: z.string().min(1).max(64).optional(),
  sourceId: z.string().min(1).max(256).optional(),
  confidence: z.number().min(0).max(1).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type UpsertMemory = z.infer<typeof upsertMemorySchema>;

export const searchMemoriesSchema = z.object({
  query: z.string().min(1).max(512),
  scope: z.string().min(1).max(128).optional(),
  kind: memoryKindSchema.optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SearchMemories = z.infer<typeof searchMemoriesSchema>;

// --- model routing (Layer 5 runtime) ---

export const selectModelSchema = z.object({
  task: z.string().min(1).max(128).default("general"),
  candidates: z.array(z.string().min(1).max(128)).optional(),
  maxCostUsd: z.number().min(0).optional(),
  maxLatencyMs: z.number().int().min(1).optional(),
  requireHealthy: z.boolean().default(true),
});
export type SelectModel = z.infer<typeof selectModelSchema>;

// --- governance policy (Layer 8 runtime) ---

export const evaluatePolicySchema = z.object({
  actor: z.string().min(1).max(128).default("api_key"),
  action: z.string().min(1).max(128),
  targetType: z.string().min(1).max(64),
  targetId: z.string().min(1).max(256).optional(),
  context: z.record(z.unknown()).default({}),
});
export type EvaluatePolicy = z.infer<typeof evaluatePolicySchema>;

// --- scaling infrastructure (Layer 6 seed) ---

export const workerPoolStatusSchema = z.enum(["active", "draining", "paused"]);

export const upsertWorkerPoolSchema = z.object({
  name: z.string().min(1).max(128),
  status: workerPoolStatusSchema.default("active"),
  desiredWorkers: z.number().int().min(0).default(1),
  activeWorkers: z.number().int().min(0).default(0),
  queuedTasks: z.number().int().min(0).default(0),
  runningTasks: z.number().int().min(0).default(0),
  maxConcurrency: z.number().int().min(1).default(1),
  metadata: z.record(z.unknown()).default({}),
});
export type UpsertWorkerPool = z.infer<typeof upsertWorkerPoolSchema>;

// --- human collaboration (Layer 10 seed) ---

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);

export const createApprovalSchema = z.object({
  title: z.string().min(1).max(256),
  requester: z.string().min(1).max(128),
  assignee: z.string().min(1).max(128).optional(),
  targetType: z.string().min(1).max(64).optional(),
  targetId: z.string().min(1).max(256).optional(),
  payload: z.unknown().default({}),
  dueAt: z.string().datetime().optional(),
});
export type CreateApproval = z.infer<typeof createApprovalSchema>;

export const decideApprovalSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
  reviewer: z.string().min(1).max(128),
  reason: z.string().max(1000).optional(),
  output: z.unknown().optional(),
});
export type DecideApproval = z.infer<typeof decideApprovalSchema>;

// --- agent runtime (Layer 1 seed) ---

export const createAgentDefinitionSchema = z.object({
  name: z.string().min(1).max(256),
  version: z.string().min(1).max(64).default("v1"),
  runtime: z.string().min(1).max(64).default("external"),
  entrypoint: z.string().min(1).max(512),
  config: z.record(z.unknown()).default({}),
});
export type CreateAgentDefinition = z.infer<typeof createAgentDefinitionSchema>;

export const createAgentRunSchema = z.object({
  agentId: z.string().uuid(),
  input: z.unknown().default({}),
  traceId: z.string().uuid().optional(),
});
export type CreateAgentRun = z.infer<typeof createAgentRunSchema>;

export const updateAgentRunSchema = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  traceId: z.string().uuid().optional(),
  error: spanErrorSchema.optional(),
});
export type UpdateAgentRun = z.infer<typeof updateAgentRunSchema>;

export const executeAgentRunSchema = z.object({
  timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
});
export type ExecuteAgentRun = z.infer<typeof executeAgentRunSchema>;
