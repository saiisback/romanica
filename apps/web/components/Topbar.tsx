import { ChevronDownIcon, DotsIcon } from "./icons.tsx";

export function Topbar({ title = "Overview" }: { title?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg px-5">
      <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-panel-2 hover:text-ink">
        All Projects
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      <div className="h-4 w-px rotate-12 bg-line" />
      <h1 className="text-sm font-medium text-ink">{title}</h1>
      <div className="flex-1" />
      <button className="rounded-md p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink">
        <DotsIcon className="h-4 w-4" />
      </button>
    </header>
  );
}
