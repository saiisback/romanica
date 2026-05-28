import Link from "next/link";
import type { Page, TraceSummary } from "@romanica/shared";
import { listTraces } from "../lib/api.ts";
import { StatusBadge } from "../components/Badges.tsx";
import { fmtCost, fmtDuration, fmtRelative, fmtTokens } from "../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function TracesPage() {
  let page: Page<TraceSummary> | null = null;
  let error: string | null = null;
  try {
    page = await listTraces("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Traces</h1>
        <p className="text-sm text-zinc-500">Every agent run, newest first.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Couldn&apos;t reach the API ({error}). Is it running on{" "}
          <code className="font-mono">localhost:4000</code>?
        </div>
      )}

      {page && page.items.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-400">
          No traces yet. Wrap an agent with{" "}
          <code className="font-mono text-zinc-200">@romanica/sdk</code> and run it.
        </div>
      )}

      {page && page.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 text-right font-medium">Duration</th>
                <th className="px-4 py-2 text-right font-medium">Spans</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {page.items.map((t) => (
                <tr key={t.traceId} className="group hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/traces/${t.traceId}`}
                      className="font-medium text-zinc-100 group-hover:text-violet-300"
                    >
                      {t.name}
                    </Link>
                    <div className="font-mono text-[11px] text-zinc-600">
                      {t.traceId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{fmtRelative(t.startTime)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                    {fmtDuration(t.durationMs)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                    {t.spanCount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                    {fmtTokens(t.totalTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                    {fmtCost(t.totalCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
