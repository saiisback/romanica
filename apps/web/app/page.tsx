import type {
  CostAnalytics,
  LatencyAnalytics,
  Page,
  TraceSummary,
} from "@romanica/shared";
import { getCost, getLatency, listTraces } from "../lib/api.ts";
import { OverviewClient } from "../components/OverviewClient.tsx";
import { UsagePanel, StatusCard } from "../components/UsagePanel.tsx";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function OverviewPage() {
  const now = Date.now();
  const from = new Date(now - 30 * DAY_MS).toISOString();
  const to = new Date(now).toISOString();
  const window = `?from=${from}&to=${to}`;

  let page: Page<TraceSummary> | null = null;
  let cost: CostAnalytics | null = null;
  let latency: LatencyAnalytics | null = null;
  let error: string | null = null;

  try {
    [page, cost, latency] = await Promise.all([
      listTraces(`${window}&limit=100`),
      getCost(window),
      getLatency(window),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
        Couldn&apos;t reach the API ({error}). Is it running on{" "}
        <code className="font-mono">localhost:4000</code>? Start it with{" "}
        <code className="font-mono">
          bun run --filter &apos;@romanica/api&apos; dev
        </code>
        .
      </div>
    );
  }

  const traces = page?.items ?? [];

  return (
    <OverviewClient
      traces={traces}
      usagePanel={
        <>
          <UsagePanel
            traceCount={traces.length}
            totalTokens={cost?.totalTokens ?? 0}
            totalCostUsd={cost?.totalCostUsd ?? 0}
            p95Ms={latency?.traceP95Ms ?? 0}
          />
          <StatusCard />
        </>
      }
    />
  );
}
