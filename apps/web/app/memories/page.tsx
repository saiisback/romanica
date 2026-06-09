import type { MemorySummary, Page } from "@romanica/shared";
import { getMemories } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  let page: Page<MemorySummary> | null = null;
  let error: string | null = null;
  try {
    page = await getMemories("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) {
    return <ApiError error={error} />;
  }

  const scopes = new Set(page.items.map((memory) => memory.scope));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Memories</h1>
        <p className="text-sm text-ink-2">Project-scoped state and knowledge records.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Records" value={String(page.items.length)} />
        <Stat label="Scopes" value={String(scopes.size)} />
        <Stat label="Semantic" value={String(page.items.filter((m) => m.kind === "semantic").length)} />
        <Stat label="Episodic" value={String(page.items.filter((m) => m.kind === "episodic").length)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Active memories
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No memory records yet.
            </div>
          ) : (
            page.items.map((memory) => <MemoryRow key={memory.id} memory={memory} />)
          )}
        </div>
      </section>
    </div>
  );
}

function MemoryRow({ memory }: { memory: MemorySummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[280px_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-xs text-ink">
            {memory.scope}
          </span>
          <KindBadge value={memory.kind} />
        </div>
        <div className="mt-2 truncate text-sm font-medium text-ink">{memory.key}</div>
        <div className="mt-1 text-xs text-ink-3">
          {fmtRelative(memory.updatedAt)}
          {memory.confidence != null ? ` · confidence ${(memory.confidence * 100).toFixed(0)}%` : ""}
        </div>
        {memory.sourceType && (
          <div className="mt-1 truncate font-mono text-xs text-ink-3">
            {memory.sourceType}:{memory.sourceId ?? "unknown"}
          </div>
        )}
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(memory.content)}
      </pre>
    </div>
  );
}

function KindBadge({ value }: { value: MemorySummary["kind"] }) {
  const cls =
    value === "semantic"
      ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
      : value === "episodic"
        ? "border-violet-500/25 bg-violet-500/10 text-violet-300"
        : value === "procedural"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
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
