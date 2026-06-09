import type { Page, WorkflowSummary } from "@romanica/shared";
import { getWorkflows } from "../../lib/api.ts";
import { fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  let page: Page<WorkflowSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getWorkflows("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  const active = page.items.filter((workflow) => workflow.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workflows</h1>
        <p className="text-sm text-ink-2">Versioned orchestration definitions.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Definitions" value={String(page.items.length)} />
        <Stat label="Active" value={String(active)} />
        <Stat label="Nodes" value={String(page.items.reduce((sum, workflow) => sum + workflow.nodeCount, 0))} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Definitions
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Nodes</th>
              <th className="px-4 py-2 text-right font-medium">Edges</th>
              <th className="px-4 py-2 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No workflow definitions yet.
                </td>
              </tr>
            ) : (
              page.items.map((workflow) => (
                <tr key={workflow.id}>
                  <td className="px-4 py-2 font-medium text-ink">{workflow.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-2">{workflow.version}</td>
                  <td className="px-4 py-2"><StatusBadge value={workflow.status} /></td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">{workflow.nodeCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-2">{workflow.edgeCount}</td>
                  <td className="px-4 py-2 text-right text-ink-3">{fmtRelative(workflow.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusBadge({ value }: { value: WorkflowSummary["status"] }) {
  const cls =
    value === "active"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "archived"
        ? "border-line bg-panel-2 text-ink-3"
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
