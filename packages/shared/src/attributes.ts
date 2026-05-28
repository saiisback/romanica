/**
 * Type-specific span attributes.
 *
 * These are the *agent-native* fields layered on top of the OTel-shaped span.
 * The wire schema accepts an open attribute bag (so we never reject a user's
 * span over an unknown key) — these interfaces describe the well-known keys the
 * SDK helpers set and the dashboard reads.
 */

export interface LLMAttributes {
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  temperature?: number;
  /** number of tool/function calls the model requested */
  toolCalls?: number;
}

export interface ToolAttributes {
  toolName?: string;
  /** present when small; large args are offloaded to the span `input` blob */
  args?: unknown;
  result?: unknown;
}

export interface RetrievalAttributes {
  query?: string;
  topK?: number;
  documents?: Array<{ id: string; score?: number }>;
}

/** Open bag — any of the above plus arbitrary user keys. */
export type SpanAttributes = Record<string, unknown> &
  Partial<LLMAttributes & ToolAttributes & RetrievalAttributes>;
