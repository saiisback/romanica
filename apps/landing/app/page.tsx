import Image from "next/image";
import { Clock } from "../components/Clock.tsx";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#2e0a06]">
      {/* hero artwork + readability scrim */}
      <Image
        src="/landing.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="hero-scrim pointer-events-none absolute inset-0" />

      {/* nav */}
      <header className="rise relative z-10 px-4 pt-4 sm:px-6 sm:pt-6">
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-5 py-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <a
            href="#"
            className="text-xl italic tracking-tight text-cream transition-opacity hover:opacity-80"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            romanica.
          </a>

          <div className="hidden items-center gap-8 text-[13px] text-cream-dim/80 sm:flex">
            <a href="#" className="navlink transition hover:text-cream">Services</a>
            <a href="#" className="navlink transition hover:text-cream">Featured Work</a>
            <a href="#" className="navlink transition hover:text-cream">Reviews</a>
          </div>

          <a
            href="#"
            className="rounded-lg bg-cream px-4 py-2 text-[13px] font-medium text-[#2e0a06] shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
          >
            Get In Touch
          </a>
        </nav>
      </header>

      {/* center */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1
          className="headline rise text-balance text-4xl font-normal leading-[1.12] text-cream sm:text-6xl"
          style={{ fontFamily: "var(--font-serif)", animationDelay: "0.12s" }}
        >
          Imagine a space
          <br />
          between vision &amp; impact
        </h1>
        <p
          className="rise mt-6 text-sm uppercase tracking-[0.25em] text-cream-dim/75 sm:text-[15px]"
          style={{ animationDelay: "0.28s" }}
        >
          That&apos;s where we thrive.
        </p>
      </div>

      {/* bottom status bar */}
      <footer
        className="rise relative z-10 flex items-center justify-between px-6 pb-5 font-mono text-[11px] uppercase tracking-[0.15em] text-cream-dim/55 sm:px-8 sm:pb-7"
        style={{ animationDelay: "0.44s" }}
      >
        <Clock />
        <span className="hidden items-center gap-2 sm:flex">
          Scroll to <span className="italic lowercase tracking-normal text-cream-dim/80">Explore</span>
          <svg
            className="scroll-cue"
            width="10"
            height="14"
            viewBox="0 0 10 14"
            fill="none"
            aria-hidden="true"
          >
            <path d="M5 1v11M1.5 8.5 5 12l3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>PNG_001</span>
      </footer>
    </main>
  );
}
