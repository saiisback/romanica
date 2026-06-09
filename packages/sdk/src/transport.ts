import type { AgentMessageSummary, IngestPayload, PublishMessage } from "@romanica/shared";
import type { DirectApi, Transport } from "./types.ts";

/**
 * Default transport: POST the batch to the ingest endpoint.
 * Throws on network error / non-2xx; the exporter catches and fails silently.
 */
export function httpTransport(opts: {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}): Transport {
  const url = `${opts.endpoint.replace(/\/$/, "")}/v1/traces`;
  return async (payload: IngestPayload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      throw new Error(`romanica ingest ${res.status}: ${await safeText(res)}`);
    }
  };
}

export function httpDirectApi(opts: {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}): DirectApi {
  const base = opts.endpoint.replace(/\/$/, "");
  const headers = {
    "content-type": "application/json",
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
  };
  return {
    publishMessage: (message: PublishMessage) =>
      request<AgentMessageSummary>(`${base}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      }),
    ackMessage: (id: string, status = "acknowledged") =>
      request<AgentMessageSummary>(`${base}/v1/messages/${id}/ack`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      }),
  };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`romanica api ${res.status}: ${await safeText(res)}`);
  }
  return (await res.json()) as T;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}
