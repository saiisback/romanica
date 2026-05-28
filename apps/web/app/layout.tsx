import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Romanica — AgentOps",
  description: "Observability for AI agents — trace every run, replay any failure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight">Romanica</span>
              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300 ring-1 ring-inset ring-violet-500/30">
                AgentOps
              </span>
            </Link>
            <nav className="ml-6 flex gap-4 text-sm text-zinc-400">
              <Link href="/" className="hover:text-zinc-100">
                Traces
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
