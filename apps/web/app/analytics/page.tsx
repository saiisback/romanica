import type { CostAnalytics, LatencyAnalytics } from "@romanica/shared";
import { getCost, getLatency } from "../../lib/api.ts";
import { TypeBadge } from "../../components/Badges.tsx";
import { fmtCost, fmtDuration, fmtTokens } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function AnalyticsPage() {
  const now = Date.now();
  const window = `?from=${new Date(now - 30 * DAY_MS).toISOString()}&to=${new Date(
    now,
  ).toISOString()}`;

  let cost: CostAnalytics | null = null;
  let latency: LatencyAnalytics | null = null;
  let error: string | null = null;
  try {
    [cost, latency] = await Promise.all([getCost(window), getLatency(window)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !cost || !latency) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
        Couldn&apos;t reach the API ({error}). Is it running on{" "}
        <code className="font-mono">localhost:4000</code>?
      </div>
    );
  }

  const maxCost = Math.max(...cost.series.map((b) => b.costUsd), 0.0001);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-ink-2">Cost &amp; latency · last 30 days.</p>
      </div>

      {/* top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total tokens" value={fmtTokens(cost.totalTokens)} />
        <Stat label="Total cost" value={fmtCost(cost.totalCostUsd)} />
        <Stat label="Trace p50" value={fmtDuration(latency.traceP50Ms)} />
        <Stat label="Trace p95" value={fmtDuration(latency.traceP95Ms)} />
      </div>

      {/* cost over time */}
      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Cost over time
        </div>
        <div className="px-4 py-5">
          {cost.series.length === 0 ? (
            <p className="text-sm text-ink-2">No data in this window.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {cost.series.map((b) => (
                <div
                  key={b.bucket}
                  className="group relative flex-1"
                  title={`${b.bucket}: ${fmtCost(b.costUsd)} · ${fmtTokens(
                    b.tokens,
                  )} tok`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-sky-500/70 to-violet-500/70 transition-colors group-hover:from-sky-400 group-hover:to-violet-400"
                    style={{
                      height: `${Math.max(2, (b.costUsd / maxCost) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* cost by model */}
        <section className="rounded-xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-sm font-medium">
            Cost by model
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 text-right font-medium">Calls</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cost.byModel.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-3">
                    No model usage yet.
                  </td>
                </tr>
              ) : (
                cost.byModel.map((m) => (
                  <tr key={m.model}>
                    <td className="px-4 py-2 font-mono text-xs text-ink">
                      {m.model}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                      {m.calls}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                      {fmtTokens(m.tokens)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                      {fmtCost(m.costUsd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* latency by type */}
        <section id="latency" className="rounded-xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-sm font-medium">
            Latency by span type
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Count</th>
                <th className="px-4 py-2 text-right font-medium">p50</th>
                <th className="px-4 py-2 text-right font-medium">p95</th>
                <th className="px-4 py-2 text-right font-medium">p99</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {latency.byType.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    No spans yet.
                  </td>
                </tr>
              ) : (
                latency.byType.map((l) => (
                  <tr key={l.type}>
                    <td className="px-4 py-2">
                      <TypeBadge type={l.type} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                      {l.count}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                      {fmtDuration(l.p50Ms)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                      {fmtDuration(l.p95Ms)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                      {fmtDuration(l.p99Ms)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
