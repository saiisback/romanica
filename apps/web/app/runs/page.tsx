import type { AgentRunSummary, Page } from "@romanica/shared";
import Link from "next/link";
import { getRuns } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  let page: Page<AgentRunSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getRuns("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) return <ApiError error={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="text-sm text-ink-2">Queued runtime requests and lifecycle state.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={String(page.items.length)} />
        <Stat label="Queued" value={String(page.items.filter((r) => r.status === "queued").length)} />
        <Stat label="Running" value={String(page.items.filter((r) => r.status === "running").length)} />
        <Stat label="Failed" value={String(page.items.filter((r) => r.status === "failed").length)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Requests
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No runtime requests yet.
            </div>
          ) : (
            page.items.map((run) => <RunRow key={run.id} run={run} />)
          )}
        </div>
      </section>
    </div>
  );
}

function RunRow({ run }: { run: AgentRunSummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[320px_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={run.status} />
          <span className="font-mono text-xs text-ink-3">{run.agentVersion}</span>
        </div>
        <div className="mt-2 truncate text-sm font-medium text-ink">{run.agentName}</div>
        <div className="mt-1 text-xs text-ink-3">queued {fmtRelative(run.queuedAt)}</div>
        {run.traceId && (
          <Link
            href={`/traces/${run.traceId}`}
            className="mt-1 block truncate font-mono text-xs text-sky-300 hover:underline"
          >
            trace:{run.traceId}
          </Link>
        )}
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(run.input)}
      </pre>
    </div>
  );
}

function StatusBadge({ value }: { value: AgentRunSummary["status"] }) {
  const cls =
    value === "succeeded"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "failed"
        ? "border-red-500/25 bg-red-500/10 text-red-300"
        : value === "running"
          ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
          : "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{value}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ApiError({ error }: { error: string | null }) {
  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
      Couldn&apos;t reach the API ({error}). Is it running on{" "}
      <code className="font-mono">localhost:4000</code>?
    </div>
  );
}
