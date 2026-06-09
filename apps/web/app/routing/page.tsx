import type { ModelRoutingAnalytics, ModelSelection } from "@romanica/shared";
import { getModelRouting, selectModel } from "../../lib/api.ts";
import { fmtCost, fmtDuration, fmtTokens } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function RoutingPage() {
  const now = Date.now();
  const window = `?from=${new Date(now - 30 * DAY_MS).toISOString()}&to=${new Date(
    now,
  ).toISOString()}`;

  let routing: ModelRoutingAnalytics | null = null;
  let selection: ModelSelection | null = null;
  let error: string | null = null;
  try {
    [routing, selection] = await Promise.all([
      getModelRouting(window),
      selectModel({ task: "support_reply", requireHealthy: true }, window),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !routing) {
    return <ApiError error={error} />;
  }

  const best = routing.candidates[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Model Routing</h1>
        <p className="text-sm text-ink-2">Observed routing candidates · last 30 days.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Candidates" value={String(routing.candidates.length)} />
        <Stat label="Preferred model" value={best?.model ?? "—"} mono />
        <Stat label="Selected now" value={selection?.selectedModel ?? "—"} mono />
      </div>

      {selection && (
        <section className="rounded-xl border border-line bg-panel px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">Runtime selection</div>
              <div className="mt-1 text-xs text-ink-3">{selection.reason}</div>
            </div>
            <div className="rounded border border-line bg-panel-2 px-2.5 py-1 font-mono text-xs text-ink">
              {selection.selectedModel}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Candidate ranking
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 text-right font-medium">Calls</th>
              <th className="px-4 py-2 text-right font-medium">Error</th>
              <th className="px-4 py-2 text-right font-medium">p95</th>
              <th className="px-4 py-2 text-right font-medium">Avg cost</th>
              <th className="px-4 py-2 text-right font-medium">Avg tokens</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Policy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {routing.candidates.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                  No LLM spans with model attributes yet.
                </td>
              </tr>
            ) : (
              routing.candidates.map((candidate) => (
                <tr key={candidate.model}>
                  <td className="px-4 py-2 font-mono text-xs text-ink">
                    {candidate.model}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {candidate.calls}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {fmtPct(candidate.errorRate)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {fmtDuration(candidate.p95LatencyMs)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {fmtCost(candidate.avgCostUsd)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {fmtTokens(Math.round(candidate.avgTokens))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">
                    {candidate.score.toFixed(4)}
                  </td>
                  <td className="px-4 py-2">
                    <RecommendationBadge value={candidate.recommendation} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function RecommendationBadge({
  value,
}: {
  value: ModelRoutingAnalytics["candidates"][number]["recommendation"];
}) {
  const cls =
    value === "preferred"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "risky"
        ? "border-red-500/25 bg-red-500/10 text-red-300"
        : value === "expensive"
          ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
          : "border-sky-500/25 bg-sky-500/10 text-sky-300";
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(n === 0 ? 0 : 1)}%`;
}

function ApiError({ error }: { error: string | null }) {
  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
      Couldn&apos;t reach the API ({error}). Is it running on{" "}
      <code className="font-mono">localhost:4000</code>?
    </div>
  );
}
