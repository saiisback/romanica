import type {
  AuditEventSummary,
  AgentMessageSummary,
  AgentDefinitionSummary,
  AgentRunSummary,
  ApprovalSummary,
  CostAnalytics,
  EvaluationAnalytics,
  LatencyAnalytics,
  MemorySummary,
  ModelRoutingAnalytics,
  Page,
  TraceDetail,
  TraceSummary,
  WorkflowSummary,
  WorkerPoolSummary,
} from "@romanica/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const API_KEY = process.env.ROMANICA_API_KEY ?? "rom_dev_key";

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export function listTraces(query = ""): Promise<Page<TraceSummary>> {
  return api<Page<TraceSummary>>(`/v1/traces${query}`);
}

export async function getTrace(id: string): Promise<TraceDetail | null> {
  const res = await fetch(`${API_URL}/v1/traces/${id}`, {
    headers: { authorization: `Bearer ${API_KEY}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /v1/traces/${id} -> ${res.status}`);
  return (await res.json()) as TraceDetail;
}

export function getCost(query = ""): Promise<CostAnalytics> {
  return api<CostAnalytics>(`/v1/analytics/cost${query}`);
}

export function getLatency(query = ""): Promise<LatencyAnalytics> {
  return api<LatencyAnalytics>(`/v1/analytics/latency${query}`);
}

export function getModelRouting(query = ""): Promise<ModelRoutingAnalytics> {
  return api<ModelRoutingAnalytics>(`/v1/routing/models${query}`);
}

export function getEvaluationSummary(query = ""): Promise<EvaluationAnalytics> {
  return api<EvaluationAnalytics>(`/v1/evaluations/summary${query}`);
}

export function getAuditEvents(query = ""): Promise<Page<AuditEventSummary>> {
  return api<Page<AuditEventSummary>>(`/v1/audit/events${query}`);
}

export function getMessages(query = ""): Promise<Page<AgentMessageSummary>> {
  return api<Page<AgentMessageSummary>>(`/v1/messages${query}`);
}

export function getWorkflows(query = ""): Promise<Page<WorkflowSummary>> {
  return api<Page<WorkflowSummary>>(`/v1/workflows${query}`);
}

export function getMemories(query = ""): Promise<Page<MemorySummary>> {
  return api<Page<MemorySummary>>(`/v1/memories${query}`);
}

export function getPools(query = ""): Promise<Page<WorkerPoolSummary>> {
  return api<Page<WorkerPoolSummary>>(`/v1/pools${query}`);
}

export function getApprovals(query = ""): Promise<Page<ApprovalSummary>> {
  return api<Page<ApprovalSummary>>(`/v1/approvals${query}`);
}

export function getAgents(query = ""): Promise<Page<AgentDefinitionSummary>> {
  return api<Page<AgentDefinitionSummary>>(`/v1/agents${query}`);
}

export function getRuns(query = ""): Promise<Page<AgentRunSummary>> {
  return api<Page<AgentRunSummary>>(`/v1/runs${query}`);
}
