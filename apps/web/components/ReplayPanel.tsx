"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReplayResult, ReplayStep } from "@romanica/shared";
import { fmtCost, fmtDuration, fmtJson, fmtTokens } from "../lib/format.ts";
import { AlertIcon, ReplayIcon } from "./icons.tsx";

const STATUS_TINT: Record<ReplayResult["status"], string> = {
  ok: "text-emerald-400",
  partial: "text-amber-400",
  skipped: "text-ink-2",
  error: "text-red-400",
};

/**
 * Re-issues a trace's captured LLM calls and diffs the fresh output against the
 * recorded run — the M7 "does it still fail, and did the model change?" view.
 */
export function ReplayPanel({ traceId }: { traceId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/traces/${traceId}/replay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`replay failed (${res.status})`);
      setResult((await res.json()) as ReplayResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "replay failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ReplayIcon className="h-4 w-4 text-ink-2" />
          Failure replay
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ReplayIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Replaying…" : result ? "Replay again" : "Replay run"}
        </button>
      </div>

      <div className="px-4 py-4">
        {!result && !error && (
          <p className="text-sm text-ink-2">
            Re-issue this run&apos;s captured LLM calls against the provider and
            compare the fresh output with what was recorded.
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-300">
            <AlertIcon className="h-4 w-4" /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className={`font-medium ${STATUS_TINT[result.status]}`}>
                {result.status}
              </span>
              <span className="text-ink-3">
                {result.steps.length} LLM call
                {result.steps.length === 1 ? "" : "s"}
              </span>
              {result.replayTraceId && (
                <Link
                  href={`/traces/${result.replayTraceId}`}
                  className="text-sky-400 hover:underline"
                >
                  open replay trace →
                </Link>
              )}
            </div>

            {result.message && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-200/90">
                {result.message}
              </div>
            )}

            <div className="space-y-3">
              {result.steps.map((step) => (
                <StepCard key={step.spanId} step={step} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StepCard({ step }: { step: ReplayStep }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-xs">
        <span className="font-mono text-ink">{step.name}</span>
        {step.model && <span className="text-ink-3">{step.model}</span>}
        <StepStatus step={step} />
        {step.latencyMs != null && (
          <span className="text-ink-3">{fmtDuration(step.latencyMs)}</span>
        )}
        {step.replayTokens != null && (
          <span className="text-ink-3">{fmtTokens(step.replayTokens)} tok</span>
        )}
        {step.replayCostUsd != null && step.replayCostUsd > 0 && (
          <span className="text-ink-3">{fmtCost(step.replayCostUsd)}</span>
        )}
      </div>

      {step.status === "ok" ? (
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          <OutputCol label="Original" value={fmtJson(step.originalOutput)} />
          <OutputCol
            label={step.changed ? "Replay · changed" : "Replay · identical"}
            value={step.replayedOutput ?? "—"}
            tint={step.changed ? "text-amber-200" : "text-emerald-200"}
          />
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-ink-2">
          {step.reason ?? "not replayed"} · request:{" "}
          <span className="font-mono text-ink-3">
            {step.request.messages.length} message
            {step.request.messages.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

function StepStatus({ step }: { step: ReplayStep }) {
  if (step.status === "ok") {
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${
          step.changed
            ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
            : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
        }`}
      >
        {step.changed ? "changed" : "stable"}
      </span>
    );
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${
        step.status === "error"
          ? "bg-red-500/15 text-red-300 ring-red-500/30"
          : "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30"
      }`}
    >
      {step.status}
    </span>
  );
}

function OutputCol({
  label,
  value,
  tint = "text-ink-2",
}: {
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="bg-panel px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <pre className={`max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs ${tint}`}>
        {value}
      </pre>
    </div>
  );
}
