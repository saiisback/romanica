"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TraceSummary } from "@romanica/shared";
import { StatusBadge, StatusDot } from "./Badges.tsx";
import {
  ActivityIcon,
  ChevronRightIcon,
  DotsIcon,
  FilterIcon,
  GitBranchIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
} from "./icons.tsx";
import { fmtCost, fmtDuration, fmtRelative, fmtTokens } from "../lib/format.ts";

export function OverviewClient({
  traces,
  usagePanel,
}: {
  traces: TraceSummary[];
  usagePanel: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return traces;
    return traces.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.traceId.toLowerCase().includes(needle),
    );
  }, [q, traces]);

  return (
    <div>
      {/* toolbar */}
      <div className="mb-5 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
          <SearchIcon className="h-4 w-4 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agent runs…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>
        <button className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink-2 hover:text-ink">
          <FilterIcon className="h-4 w-4" />
        </button>
        <div className="flex items-center rounded-md border border-line bg-panel p-0.5">
          <button
            onClick={() => setView("grid")}
            className={`rounded p-1.5 ${
              view === "grid" ? "bg-panel-2 text-ink" : "text-ink-3"
            }`}
            aria-label="Grid view"
          >
            <GridIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded p-1.5 ${
              view === "list" ? "bg-panel-2 text-ink" : "text-ink-3"
            }`}
            aria-label="List view"
          >
            <ListIcon className="h-4 w-4" />
          </button>
        </div>
        <Link
          href="/analytics"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90"
        >
          Analytics
        </Link>
      </div>

      {/* two-column overview */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">{usagePanel}</div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-ink">Agent Runs</h2>
            <span className="text-xs text-ink-3">
              {filtered.length} of {traces.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty hasTraces={traces.length > 0} />
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((t) => (
                <TraceCard key={t.traceId} t={t} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
              {filtered.map((t) => (
                <TraceRow key={t.traceId} t={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceCard({ t }: { t: TraceSummary }) {
  return (
    <Link
      href={`/traces/${t.traceId}`}
      className="group block rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-2 ring-1 ring-inset ring-line">
          <ActivityIcon className="h-4 w-4 text-ink-2" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink group-hover:text-white">
              {t.name}
            </span>
            <StatusDot status={t.status} />
          </div>
          <div className="truncate font-mono text-[11px] text-ink-3">
            {t.traceId.slice(0, 18)}
          </div>
        </div>
        <DotsIcon className="h-4 w-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
        <span className="tabular-nums">{t.spanCount} spans</span>
        <span className="text-ink-3">·</span>
        <span className="tabular-nums">{fmtTokens(t.totalTokens)} tok</span>
        <span className="text-ink-3">·</span>
        <span className="tabular-nums">{fmtCost(t.totalCostUsd)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-3">
        <GitBranchIcon className="h-3.5 w-3.5" />
        <span>{fmtRelative(t.startTime)}</span>
        <span className="ml-auto tabular-nums">{fmtDuration(t.durationMs)}</span>
      </div>
    </Link>
  );
}

function TraceRow({ t }: { t: TraceSummary }) {
  return (
    <Link
      href={`/traces/${t.traceId}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-2/50"
    >
      <StatusDot status={t.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink group-hover:text-white">
          {t.name}
        </div>
        <div className="truncate font-mono text-[11px] text-ink-3">
          {t.traceId.slice(0, 18)}
        </div>
      </div>
      <span className="hidden w-20 text-right text-xs tabular-nums text-ink-2 sm:block">
        {t.spanCount} spans
      </span>
      <span className="hidden w-20 text-right text-xs tabular-nums text-ink-2 sm:block">
        {fmtTokens(t.totalTokens)}
      </span>
      <span className="hidden w-20 text-right text-xs tabular-nums text-ink-2 sm:block">
        {fmtCost(t.totalCostUsd)}
      </span>
      <span className="w-16 text-right text-xs tabular-nums text-ink-2">
        {fmtDuration(t.durationMs)}
      </span>
      <span className="w-16 text-right text-[11px] text-ink-3">
        {fmtRelative(t.startTime)}
      </span>
      <ChevronRightIcon className="h-4 w-4 text-ink-3" />
    </Link>
  );
}

function Empty({ hasTraces }: { hasTraces: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-12 text-center text-sm text-ink-2">
      {hasTraces ? (
        "No runs match your search."
      ) : (
        <>
          No agent runs yet. Wrap an agent with{" "}
          <code className="font-mono text-ink">@romanica/sdk</code> and run it.
        </>
      )}
    </div>
  );
}
