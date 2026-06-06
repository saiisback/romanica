import type { SpanType, SpanStatus, TraceStatus } from "@romanica/shared";

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  error: "bg-red-500/15 text-red-400 ring-red-500/30",
  running: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
};

const DOT_STYLES: Record<string, string> = {
  ok: "bg-emerald-400",
  error: "bg-red-400",
  running: "bg-amber-400 animate-pulse",
};

export function StatusBadge({ status }: { status: TraceStatus | SpanStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] ?? STATUS_STYLES.ok
      }`}
    >
      {status}
    </span>
  );
}

export function StatusDot({ status }: { status: TraceStatus | SpanStatus }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        DOT_STYLES[status] ?? DOT_STYLES.ok
      }`}
      title={status}
    />
  );
}

const TYPE_STYLES: Record<SpanType, string> = {
  llm: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  tool: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  retrieval: "bg-teal-500/15 text-teal-300 ring-teal-500/30",
  agent: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  custom: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
};

export function TypeBadge({ type }: { type: SpanType }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ring-1 ring-inset ${TYPE_STYLES[type]}`}
    >
      {type}
    </span>
  );
}
