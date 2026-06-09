import type { AuditEventSummary, Page } from "@romanica/shared";
import { getAuditEvents } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  let page: Page<AuditEventSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getAuditEvents("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit</h1>
        <p className="text-sm text-ink-2">Project event trail for ingest and replay.</p>
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Events
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No audit events yet.
            </div>
          ) : (
            page.items.map((event) => <AuditRow key={event.id} event={event} />)
          )}
        </div>
      </section>
    </div>
  );
}

function AuditRow({ event }: { event: AuditEventSummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[220px_1fr]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
            {event.action}
          </span>
          <span className="text-xs text-ink-3">{fmtRelative(event.createdAt)}</span>
        </div>
        <div className="mt-2 truncate font-mono text-xs text-ink-3">
          {event.targetType}
          {event.targetId ? `:${event.targetId}` : ""}
        </div>
        <div className="mt-1 text-xs text-ink-3">actor: {event.actorType}</div>
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(event.metadata)}
      </pre>
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
