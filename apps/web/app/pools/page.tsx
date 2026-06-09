import type { Page, WorkerPoolSummary } from "@romanica/shared";
import { getPools } from "../../lib/api.ts";
import { fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function PoolsPage() {
  let page: Page<WorkerPoolSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getPools("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  const queued = page.items.reduce((sum, pool) => sum + pool.queuedTasks, 0);
  const activeWorkers = page.items.reduce((sum, pool) => sum + pool.activeWorkers, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Worker Pools</h1>
        <p className="text-sm text-ink-2">Capacity snapshots and queue pressure.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pools" value={String(page.items.length)} />
        <Stat label="Workers" value={String(activeWorkers)} />
        <Stat label="Queued" value={String(queued)} />
        <Stat label="Saturated" value={String(page.items.filter((p) => p.pressure === "saturated").length)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Capacity
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Pool</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Pressure</th>
              <th className="px-4 py-2 text-right font-medium">Workers</th>
              <th className="px-4 py-2 text-right font-medium">Running</th>
              <th className="px-4 py-2 text-right font-medium">Queued</th>
              <th className="px-4 py-2 text-right font-medium">Utilization</th>
              <th className="px-4 py-2 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                  No worker pool snapshots yet.
                </td>
              </tr>
            ) : (
              page.items.map((pool) => (
                <tr key={pool.id}>
                  <td className="px-4 py-2 font-medium text-ink">{pool.name}</td>
                  <td className="px-4 py-2"><StatusBadge value={pool.status} /></td>
                  <td className="px-4 py-2"><PressureBadge value={pool.pressure} /></td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">
                    {pool.activeWorkers}/{pool.desiredWorkers}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">{pool.runningTasks}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">{pool.queuedTasks}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">
                    {(pool.utilization * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2 text-right text-ink-3">{fmtRelative(pool.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusBadge({ value }: { value: WorkerPoolSummary["status"] }) {
  const cls =
    value === "active"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "draining"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
        : "border-line bg-panel-2 text-ink-3";
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{value}</span>;
}

function PressureBadge({ value }: { value: WorkerPoolSummary["pressure"] }) {
  const cls =
    value === "saturated"
      ? "border-red-500/25 bg-red-500/10 text-red-300"
      : value === "healthy"
        ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
        : "border-line bg-panel-2 text-ink-3";
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
