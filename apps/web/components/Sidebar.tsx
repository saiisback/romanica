"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  BarsIcon,
  BoxIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ClockIcon,
  GitBranchIcon,
  LayersIcon,
  ListIcon,
  DotsIcon,
  SearchIcon,
} from "./icons.tsx";

const NAV = [
  { href: "/", label: "Overview", icon: BoxIcon },
  { href: "/?view=traces", label: "Traces", icon: ActivityIcon },
  { href: "/agents", label: "Agents", icon: BoxIcon },
  { href: "/runs", label: "Runs", icon: ActivityIcon },
  { href: "/analytics", label: "Analytics", icon: BarsIcon },
  { href: "/analytics#latency", label: "Latency", icon: ClockIcon },
  { href: "/workflows", label: "Workflows", icon: LayersIcon },
  { href: "/memories", label: "Memories", icon: BoxIcon },
  { href: "/pools", label: "Pools", icon: BarsIcon },
  { href: "/routing", label: "Routing", icon: GitBranchIcon },
  { href: "/evaluations", label: "Evaluations", icon: CheckCircleIcon },
  { href: "/messages", label: "Messages", icon: DotsIcon },
  { href: "/approvals", label: "Approvals", icon: CheckCircleIcon },
  { href: "/audit", label: "Audit", icon: ListIcon },
];

const ROADMAP = ["Rust engines", "Autoscaling loop", "Workflow execution"];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-bg">
      {/* workspace selector */}
      <div className="px-3 pt-3">
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[11px] font-bold text-black">
            R
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            Romanica
          </span>
          <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-2 ring-1 ring-inset ring-line">
            L4+
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 text-ink-3" />
        </button>
      </div>

      {/* search */}
      <div className="px-3 pt-2">
        <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 text-ink-3" />
          <input
            placeholder="Find…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <kbd className="rounded border border-line px-1 text-[10px] text-ink-3">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* nav */}
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href.split("?")[0].split("#")[0]) &&
                item.href !== "/";
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-panel-2 font-medium text-ink"
                  : "text-ink-2 hover:bg-panel-2 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="px-2 pb-1 pt-5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Roadmap
        </div>
        {ROADMAP.map((label) => (
          <div
            key={label}
            className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-3"
          >
            <LayersIcon className="h-4 w-4 shrink-0 opacity-60" />
            {label}
          </div>
        ))}
      </nav>

      {/* status card */}
      <div className="px-3 pb-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Layer 4 · Active
          </div>
          <p className="mt-1 text-[11px] leading-snug text-ink-2">
            AgentOps is live, with runtime seeds, workflows, memory, pools, approvals, and audit.
          </p>
        </div>
      </div>

      {/* user footer */}
      <div className="border-t border-line px-3 py-2.5">
        <button className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-panel-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-500 text-[11px] font-semibold text-white">
            SK
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-ink">
              sai karthik
            </div>
            <div className="truncate text-[10px] text-ink-3">Pro</div>
          </div>
          <BoxIcon className="h-3.5 w-3.5 text-ink-3" />
        </button>
      </div>
    </aside>
  );
}
