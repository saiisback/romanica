export function Nav({ githubUrl }: { githubUrl: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-base/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="#" className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded bg-gradient-to-br from-flame to-blood font-mono text-sm font-bold text-black">
            R
          </span>
          <span className="font-mono text-[15px] font-semibold tracking-tight text-ink">
            romanica
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#layers" className="transition hover:text-ink">
            Layers
          </a>
          <a href="#start" className="transition hover:text-ink">
            Quickstart
          </a>
          <a href={githubUrl} className="transition hover:text-ink">
            GitHub
          </a>
        </nav>

        <a
          href="#start"
          className="rounded-md border border-ember/40 bg-ember/10 px-3.5 py-1.5 text-sm font-medium text-flame transition hover:bg-ember/20"
        >
          Start tracing
        </a>
      </div>
    </header>
  );
}
