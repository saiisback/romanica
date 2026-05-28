import type { IngestPayload } from "@romanica/shared";
import type { Transport } from "./types.ts";

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

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}
