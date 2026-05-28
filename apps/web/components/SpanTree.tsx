"use client";

import { useMemo, useState } from "react";
import type { SpanNode } from "@romanica/shared";
import { StatusBadge, TypeBadge } from "./Badges.tsx";
import { fmtDuration, fmtJson } from "../lib/format.ts";

interface FlatRow {
  span: SpanNode;
  depth: number;
  hasChildren: boolean;
}

/** Depth-first flatten, skipping descendants of collapsed nodes. */
function flatten(spans: SpanNode[], collapsed: Set<string>, depth = 0, out: FlatRow[] = []) {
  for (const span of spans) {
    const hasChildren = span.children.length > 0;
    out.push({ span, depth, hasChildren });
    if (hasChildren && !collapsed.has(span.spanId)) {
      flatten(span.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

function findSpan(spans: SpanNode[], id: string): SpanNode | null {
  for (const s of spans) {
    if (s.spanId === id) return s;
    const found = findSpan(s.children, id);
    if (found) return found;
  }
  return null;
}

export function SpanTree({
  spans,
  traceStartMs,
  traceDurationMs,
}: {
  spans: SpanNode[];
  traceStartMs: number;
  traceDurationMs: number;
}) {
  const firstId = spans[0]?.spanId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rows = useMemo(() => flatten(spans, collapsed), [spans, collapsed]);
  const selected = selectedId ? findSpan(spans, selectedId) : null;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const span = Math.max(1, traceDurationMs);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* tree / waterfall */}
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
          Span tree
        </div>
        <ul className="divide-y divide-zinc-900">
          {rows.map(({ span: s, depth, hasChildren }) => {
            const startMs = new Date(s.startTime).getTime();
            const offset = Math.min(100, Math.max(0, ((startMs - traceStartMs) / span) * 100));
            const width = Math.min(100 - offset, Math.max(1, ((s.durationMs ?? 0) / span) * 100));
            const isSel = s.spanId === selectedId;
            return (
              <li key={s.spanId}>
                <button
                  onClick={() => setSelectedId(s.spanId)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900/60 ${
                    isSel ? "bg-violet-500/10 ring-1 ring-inset ring-violet-500/30" : ""
                  }`}
                >
                  <span style={{ width: depth * 14 }} className="shrink-0" />
                  {hasChildren ? (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(s.spanId);
                      }}
                      className="w-3 shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-200"
                    >
                      {collapsed.has(s.spanId) ? "▶" : "▼"}
                    </span>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <TypeBadge type={s.type} />
                  <span
                    className={`shrink-0 truncate ${
                      s.status === "error" ? "text-red-300" : "text-zinc-200"
                    }`}
                  >
                    {s.name}
                  </span>
                  {s.status === "error" && (
                    <span className="shrink-0 text-xs text-red-400">●</span>
                  )}

                  {/* mini waterfall */}
                  <span className="relative ml-auto h-1.5 w-24 shrink-0 rounded bg-zinc-800 sm:w-40">
                    <span
                      className={`absolute top-0 h-1.5 rounded ${
                        s.status === "error" ? "bg-red-500/70" : "bg-violet-500/70"
                      }`}
                      style={{ left: `${offset}%`, width: `${width}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-xs text-zinc-400">
                    {fmtDuration(s.durationMs)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* detail */}
      <div className="rounded-lg border border-zinc-800">
        {selected ? (
          <SpanDetail span={selected} />
        ) : (
          <div className="p-6 text-sm text-zinc-500">Select a span.</div>
        )}
      </div>
    </div>
  );
}

function SpanDetail({ span }: { span: SpanNode }) {
  const attrEntries = Object.entries(span.attributes ?? {});
  return (
    <div className="flex flex-col">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeBadge type={span.type} />
          <span className="font-medium">{span.name}</span>
          <span className="ml-auto">
            <StatusBadge status={span.status} />
          </span>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {fmtDuration(span.durationMs)} · {new Date(span.startTime).toLocaleTimeString()}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {span.error && (
          <Section title="Error" tone="error">
            <pre className="whitespace-pre-wrap break-words text-xs text-red-300">
              {span.error.message}
              {span.error.stack ? `\n\n${span.error.stack}` : ""}
            </pre>
          </Section>
        )}

        {attrEntries.length > 0 && (
          <Section title="Attributes">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {attrEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-zinc-500">{k}</dt>
                  <dd className="truncate text-right font-mono text-zinc-200">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title="Input">
          <JsonBlock value={span.input} />
        </Section>
        <Section title="Output">
          <JsonBlock value={span.output} />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "error";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`mb-1 text-xs font-medium uppercase tracking-wide ${
          tone === "error" ? "text-red-400" : "text-zinc-500"
        }`}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded bg-zinc-900/70 p-3 text-xs leading-relaxed text-zinc-200 ring-1 ring-inset ring-zinc-800">
      {fmtJson(value)}
    </pre>
  );
}
