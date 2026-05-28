import type {
  CostAnalytics,
  LatencyAnalytics,
  Page,
  TraceDetail,
  TraceSummary,
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
