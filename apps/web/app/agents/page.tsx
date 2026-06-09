import type { AgentDefinitionSummary, Page } from "@romanica/shared";
import { getAgents } from "../../lib/api.ts";
import { fmtJson, fmtRelative } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  let page: Page<AgentDefinitionSummary> | null = null;
  let error: string | null = null;
  try {
    page = await getAgents("?limit=100");
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !page) return <ApiError error={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-ink-2">Runtime definitions and entrypoints.</p>
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Definitions
        </div>
        <div className="divide-y divide-line">
          {page.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No agent definitions yet.
            </div>
          ) : (
            page.items.map((agent) => <AgentRow key={agent.id} agent={agent} />)
          )}
        </div>
      </section>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentDefinitionSummary }) {
  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[300px_1fr]">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{agent.name}</div>
        <div className="mt-1 font-mono text-xs text-ink-3">
          {agent.version} · {agent.runtime}
        </div>
        <div className="mt-1 truncate font-mono text-xs text-ink-2">{agent.entrypoint}</div>
        <div className="mt-2 text-xs text-ink-3">updated {fmtRelative(agent.updatedAt)}</div>
      </div>
      <pre className="max-h-44 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-ink-2">
        {fmtJson(agent.config)}
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
