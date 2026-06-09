import type { PolicyDecision } from "@romanica/shared";
import { evaluatePolicy } from "../../lib/api.ts";

export const dynamic = "force-dynamic";

const CHECKS = [
  {
    name: "Workflow publish",
    body: { action: "workflow.publish", targetType: "workflow", context: { highRisk: true } },
  },
  {
    name: "Memory search",
    body: { action: "memory.search", targetType: "memory", context: {} },
  },
  {
    name: "Audit deletion",
    body: { action: "audit.delete", targetType: "audit", context: {} },
  },
];

export default async function GovernancePage() {
  let decisions: Array<{ name: string; decision: PolicyDecision }> = [];
  let error: string | null = null;
  try {
    decisions = await Promise.all(
      CHECKS.map(async (check) => ({
        name: check.name,
        decision: await evaluatePolicy(check.body),
      })),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error) {
    return <ApiError error={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Governance</h1>
        <p className="text-sm text-ink-2">Policy decisions for platform actions.</p>
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Policy engine
        </div>
        <div className="divide-y divide-line">
          {decisions.map(({ name, decision }) => (
            <div key={name} className="grid gap-3 px-4 py-4 sm:grid-cols-[220px_1fr_auto]">
              <div>
                <div className="text-sm font-medium text-ink">{name}</div>
                <div className="mt-1 text-xs text-ink-3">
                  {decision.requiredApproval ? "Approval required" : "No approval required"}
                </div>
              </div>
              <div className="text-sm text-ink-2">{decision.reason}</div>
              <DecisionBadge value={decision.decision} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DecisionBadge({ value }: { value: PolicyDecision["decision"] }) {
  const cls =
    value === "allow"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : value === "review"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
        : "border-red-500/25 bg-red-500/10 text-red-300";
  return (
    <span className={`h-fit rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
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
