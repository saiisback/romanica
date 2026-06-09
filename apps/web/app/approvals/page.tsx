import type { ApprovalSummary, Page } from "@romanica/shared";
import { getApprovals } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  let page: Page<ApprovalSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getApprovals("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-ink-2">Human checkpoints and decisions.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={String(page.items.length)} />
        <Stat label="Pending" value={String(page.items.filter((a) => a.status === "pending").length)} />
        <Stat label="Approved" value={String(page.items.filter((a) => a.status === "approved").length)} />
        <Stat label="Rejected" value={String(page.items.filter((a) => a.status === "rejected").length)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Checkpoints
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No approval checkpoints yet.
            </div>
          ) : (
            page.items.map((approval) => <ApprovalRow key={approval.id} approval={approval} />)
          )}
        </div>
      </section>
    </div>
  );
}

function ApprovalRow({ approval }: { approval: ApprovalSummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[300px_1fr_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={approval.status} />
          <span className="text-xs text-ink-3">{fmtRelative(approval.updatedAt)}</span>
        </div>
        <div className="mt-2 truncate text-sm font-medium text-ink">{approval.title}</div>
        <div className="mt-1 text-xs text-ink-3">
          {approval.requester}
          {approval.assignee ? ` → ${approval.assignee}` : ""}
        </div>
        {approval.targetType && (
          <div className="mt-1 truncate font-mono text-xs text-ink-3">
            {approval.targetType}:{approval.targetId ?? "unknown"}
          </div>
        )}
      </div>
      <Payload label="Payload" value={approval.payload} />
      <Payload label="Decision" value={approval.decision} />
    </div>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <pre className="max-h-40 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(value)}
      </pre>
    </div>
  );
}

function StatusBadge({ value }: { value: ApprovalSummary["status"] }) {
  const cls =
    value === "approved"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "rejected"
        ? "border-red-500/25 bg-red-500/10 text-red-300"
        : value === "cancelled"
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
