import type { EvaluationAnalytics, EvaluationSignal } from "@romanica/shared";
import Link from "next/link";
import { getEvaluationSummary } from "../../lib/api.ts";
import { fmtJson } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function EvaluationsPage() {
  const now = Date.now();
  const window = `?from=${new Date(now - 30 * DAY_MS).toISOString()}&to=${new Date(
    now,
  ).toISOString()}&limit=25`;

  let evaluation: EvaluationAnalytics | null = null;
  let error: string | null = null;
  try {
    evaluation = await getEvaluationSummary(window);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load";
  }

  if (error || !evaluation) {
    return <ApiError error={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Evaluations</h1>
        <p className="text-sm text-ink-2">Trace-derived signals and cases · last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Traces" value={String(evaluation.totalTraces)} />
        <Stat label="Failed" value={String(evaluation.failedTraces)} />
        <Stat label="Failure rate" value={fmtPct(evaluation.failureRate)} />
        <Stat label="Replay coverage" value={fmtPct(evaluation.replayCoverage)} />
      </div>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Evaluation signals
        </div>
        <div className="divide-y divide-line">
          {evaluation.signals.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No failing or slow spans in this window.
            </div>
          ) : (
            evaluation.signals.map((signal) => (
              <SignalRow key={`${signal.kind}:${signal.traceId}:${signal.spanId}`} signal={signal} />
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">
          Captured LLM cases
        </div>
        <div className="divide-y divide-line">
          {evaluation.cases.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-3">
              No replayable LLM cases yet.
            </div>
          ) : (
            evaluation.cases.map((testCase) => (
              <div key={testCase.spanId} className="grid gap-3 px-4 py-4 lg:grid-cols-[220px_1fr_1fr]">
                <div className="min-w-0">
                  <Link
                    href={`/traces/${testCase.traceId}`}
                    className="block truncate text-sm font-medium text-ink hover:underline"
                  >
                    {testCase.name}
                  </Link>
                  <div className="mt-1 truncate font-mono text-xs text-ink-3">
                    {testCase.model ?? "unknown model"}
                  </div>
                </div>
                <Payload label="Input" value={testCase.input} />
                <Payload label="Expected" value={testCase.expectedOutput} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SignalRow({ signal }: { signal: EvaluationSignal }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <SeverityBadge value={signal.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/traces/${signal.traceId}`}
            className="text-sm font-medium text-ink hover:underline"
          >
            {signal.name}
          </Link>
          <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2">
            {signal.kind}
          </span>
        </div>
        <div className="mt-1 text-sm text-ink-2">{signal.message}</div>
      </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SeverityBadge({ value }: { value: EvaluationSignal["severity"] }) {
  const cls =
    value === "high"
      ? "border-red-500/25 bg-red-500/10 text-red-300"
      : value === "medium"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
        : "border-sky-500/25 bg-sky-500/10 text-sky-300";
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(n === 0 ? 0 : 1)}%`;
}

function ApiError({ error }: { error: string | null }) {
  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
      Couldn&apos;t reach the API ({error}). Is it running on{" "}
      <code className="font-mono">localhost:4000</code>?
    </div>
  );
}
