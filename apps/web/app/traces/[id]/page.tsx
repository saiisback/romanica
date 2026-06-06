import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrace } from "../../../lib/api.ts";
import { SpanTree } from "../../../components/SpanTree.tsx";
import { ReplayPanel } from "../../../components/ReplayPanel.tsx";
import { StatusBadge } from "../../../components/Badges.tsx";
import { fmtCost, fmtDuration, fmtTokens } from "../../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trace = await getTrace(id);
  if (!trace) notFound();

  const traceStartMs = new Date(trace.startTime).getTime();
  const traceDurationMs = trace.durationMs ?? 0;
  const metaEntries = Object.entries(trace.metadata ?? {});

  return (
    <div>
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">
        ← Agent Runs
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{trace.name}</h1>
        <StatusBadge status={trace.status} />
        <span className="font-mono text-xs text-ink-3">{trace.traceId}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Duration" value={fmtDuration(trace.durationMs)} />
        <Stat label="Spans" value={String(trace.spanCount)} />
        <Stat label="Tokens" value={fmtTokens(trace.totalTokens)} />
        <Stat label="Cost" value={fmtCost(trace.totalCostUsd)} />
      </div>

      {metaEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {metaEntries.map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-panel px-2 py-1 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-line"
            >
              {k}={typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SpanTree
          spans={trace.spans}
          traceStartMs={traceStartMs}
          traceDurationMs={traceDurationMs}
        />
      </div>

      <div className="mt-6">
        <ReplayPanel traceId={trace.traceId} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
