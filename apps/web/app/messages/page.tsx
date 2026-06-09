import type { AgentMessageSummary, Page } from "@romanica/shared";
import Link from "next/link";
import { getMessages } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  let page: Page<AgentMessageSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getMessages("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  const pending = page.items.filter((message) => message.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Messages</h1>
        <p className="text-sm text-ink-2">Agent communication channels and handoffs.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Recent" value={String(page.items.length)} />
        <Stat label="Pending" value={String(pending)} />
        <Stat label="Channels" value={String(new Set(page.items.map((m) => m.channel)).size)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Recent messages
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No agent messages yet.
            </div>
          ) : (
            page.items.map((message) => <MessageRow key={message.id} message={message} />)
          )}
        </div>
      </section>
    </div>
  );
}

function MessageRow({ message }: { message: AgentMessageSummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[280px_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-xs text-ink">
            {message.channel}
          </span>
          <StatusBadge value={message.status} />
        </div>
        <div className="mt-2 text-sm text-ink">
          {message.sender}
          <span className="text-ink-3"> → </span>
          {message.recipient ?? "broadcast"}
        </div>
        <div className="mt-1 text-xs text-ink-3">{fmtRelative(message.createdAt)}</div>
        {message.traceId && (
          <Link
            href={`/traces/${message.traceId}`}
            className="mt-1 block truncate font-mono text-xs text-sky-300 hover:underline"
          >
            trace:{message.traceId}
          </Link>
        )}
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(message.payload)}
      </pre>
    </div>
  );
}

function StatusBadge({ value }: { value: AgentMessageSummary["status"] }) {
  const cls =
    value === "acknowledged"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "failed"
        ? "border-red-500/25 bg-red-500/10 text-red-300"
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
