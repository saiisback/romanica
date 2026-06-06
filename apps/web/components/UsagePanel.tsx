import { fmtCost, fmtDuration, fmtTokens } from "../lib/format.ts";

type Metric = {
  label: string;
  value: string;
  /** 0..1 fill of the quota bar */
  pct: number;
  quota: string;
};

function pct(n: number, max: number) {
  if (!Number.isFinite(n) || max <= 0) return 0;
  return Math.max(0.02, Math.min(1, n / max));
}

export function UsagePanel({
  traceCount,
  totalTokens,
  totalCostUsd,
  p95Ms,
}: {
  traceCount: number;
  totalTokens: number;
  totalCostUsd: number;
  p95Ms: number;
}) {
  // Display-only soft quotas, mirroring Vercel's used/limit bars.
  const metrics: Metric[] = [
    {
      label: "Agent Runs",
      value: `${traceCount}`,
      pct: pct(traceCount, 1000),
      quota: "1,000",
    },
    {
      label: "Tokens",
      value: fmtTokens(totalTokens),
      pct: pct(totalTokens, 10_000_000),
      quota: "10M",
    },
    {
      label: "Cost",
      value: fmtCost(totalCostUsd),
      pct: pct(totalCostUsd, 100),
      quota: "$100",
    },
    {
      label: "p95 Latency",
      value: fmtDuration(p95Ms),
      pct: pct(p95Ms, 60_000),
      quota: "60s",
    },
  ];

  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink">Usage</h2>
        <span className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] text-ink-2 ring-1 ring-inset ring-line">
          Last 30 days
        </span>
      </div>
      <div className="space-y-4 px-4 py-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-2">{m.label}</span>
              <span className="tabular-nums text-ink">
                {m.value}{" "}
                <span className="text-ink-3">/ {m.quota}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
                style={{ width: `${(m.pct * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StatusCard() {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-sm font-medium text-ink">Alerts</h2>
      <div className="mt-3 rounded-lg border border-line bg-panel-2/60 px-4 py-6 text-center">
        <p className="text-sm font-medium text-ink">Monitor for anomalies</p>
        <p className="mt-1 text-xs text-ink-2">
          Get notified when error rate, cost, or latency spikes across your
          agent runs.
        </p>
        <button className="mt-3 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90">
          Configure alerts
        </button>
      </div>
    </section>
  );
}
