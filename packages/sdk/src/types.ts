import type { AgentMessageSummary, IngestPayload, PublishMessage } from "@romanica/shared";

export interface RomanicaConfig {
  /** Project API key. Resolved to a project server-side. */
  apiKey?: string;
  /** Optional human label for the project (not sent; for your own clarity). */
  project?: string;
  /** Ingest endpoint base URL. Default: ROMANICA_ENDPOINT or http://localhost:4000 */
  endpoint?: string;
  /** Flush the buffer at least this often (ms). Default 2000. */
  flushIntervalMs?: number;
  /** Flush early once this many traces are queued. Default 25. */
  maxQueue?: number;
  /** Hard cap on a single export batch. Default 100. */
  maxBatch?: number;
  /** Turn the SDK into a no-op (e.g. in tests/local). Default false. */
  disabled?: boolean;
  /** Log export failures to console.warn. Default false (silent). */
  debug?: boolean;
  /** Inject a transport (testing). Defaults to fetch-based transport. */
  transport?: Transport;
  /** Inject direct API calls (testing). Defaults to fetch-based calls. */
  direct?: DirectApi;
  /** Clock injection (testing). Defaults to Date.now. */
  now?: () => number;
}

/** A transport ships one batch of traces. Must never throw. */
export type Transport = (payload: IngestPayload) => Promise<void>;

export interface DirectApi {
  publishMessage(message: PublishMessage): Promise<AgentMessageSummary>;
  ackMessage(id: string, status?: "acknowledged" | "failed"): Promise<AgentMessageSummary>;
}
