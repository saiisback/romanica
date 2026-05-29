import { Nav } from "../components/Nav.tsx";
import { CodeWindow } from "../components/CodeWindow.tsx";
import { LAYERS } from "../components/layers.ts";

const GITHUB = "https://github.com/romanica/romanica";

export default function Home() {
  return (
    <div className="bg-grid">
      <Nav githubUrl={GITHUB} />

      {/* ───────────────────────── hero ───────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="glow-ember pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1 font-mono text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ember" />
              Layer 4 · AgentOps &amp; Observability — live
            </span>

            <h1 className="mt-7 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              The operating system for
              <br />
              <span className="text-gradient">autonomous AI agents</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted">
              Agents aren&apos;t chat sessions — they&apos;re long-running, distributed
              cognitive workers. Romanica is the runtime and operations layer that treats
              them that way. It starts where the pain is loudest:{" "}
              <span className="text-ink">observability</span>.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#start"
                className="btn-ember rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
              >
                Start tracing →
              </a>
              <a
                href={GITHUB}
                className="rounded-lg border border-line bg-panel/50 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-zinc-600"
              >
                View on GitHub
              </a>
            </div>

            <p className="mt-8 font-mono text-xs tracking-tight text-faint">
              AWS&nbsp;+&nbsp;Kubernetes&nbsp;+&nbsp;Datadog&nbsp;+&nbsp;Temporal — for
              autonomous AI systems.
            </p>
          </div>

          {/* hero terminal */}
          <div className="mx-auto mt-16 max-w-3xl">
            <CodeWindow title="support-agent.ts" code={HERO_CODE} />
          </div>
        </div>
      </section>

      {/* ───────────────────────── the pain ───────────────────────── */}
      <section className="border-y border-line bg-panel/30">
        <div className="mx-auto grid max-w-6xl gap-px px-6 sm:grid-cols-3">
          <Stat big="3 hrs" small="reading a wall of JSON logs to find which step broke" tone="dim" />
          <div className="hidden items-center justify-center sm:flex">
            <span className="font-mono text-2xl text-ember">→</span>
          </div>
          <Stat big="3 min" small="open the run, click the failed span, see exactly why" tone="hot" />
        </div>
      </section>

      {/* ───────────────────────── what it does ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionLabel>What ships today</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Wrap your agent. See every step it took.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          A few lines of SDK and every run streams to the backend as a structured trace —
          a tree of LLM calls, tool calls, and retrievals, with timing, I/O, tokens and cost.
          Export is async, batched, and fails silently. It never takes down your agent.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <Feature
            title="Execution tracing"
            body="Every run captured as a nested span tree. Click any step → the exact prompt, response, tool args, and error."
          />
          <Feature
            title="Token & cost analytics"
            body="Per-model pricing rolls tokens and dollars up from spans to the run. Know what each agent invocation actually cost."
          />
          <Feature
            title="Latency waterfall"
            body="See where the time went — p50 / p95 / p99 per step. Find the slow tool or the retry loop instantly."
          />
          <Feature
            title="Drop-in SDK"
            body="trace() / span() primitives with automatic nesting via AsyncLocalStorage. Under 10 lines to adopt, zero infra changes."
          />
          <Feature
            title="Built to not break you"
            body="Buffered, batched, unref'd background export. If the backend is down, your agent keeps running. Observability is never load-bearing."
          />
          <Feature
            title="Open data model"
            body="OpenTelemetry-shaped spans with agent-native attributes for llm / tool / retrieval. Big payloads offload to object storage."
            soon={false}
          />
        </div>
      </section>

      {/* ───────────────────────── adopt / code ───────────────────────── */}
      <section id="start" className="border-t border-line bg-panel/30">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
          <div>
            <SectionLabel>Adopt in minutes</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Three lines to adopt.
              <br />
              <span className="text-muted">Nothing to migrate.</span>
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Works with whatever you already run — Vercel AI SDK, LangChain.js, raw model
              calls, or custom loops. Spin up the stack with one command; auto-instrument
              adapters land next.
            </p>
            <ol className="mt-8 space-y-3 font-mono text-sm">
              {[
                ["bun install @romanica/sdk", "add the SDK"],
                ["new Romanica({ apiKey })", "init once"],
                ["romanica.trace(name, fn)", "wrap your run"],
              ].map(([cmd, note], i) => (
                <li key={cmd} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-line text-xs text-ember">
                    {i + 1}
                  </span>
                  <code className="text-ink">{cmd}</code>
                  <span className="text-faint">— {note}</span>
                </li>
              ))}
            </ol>
          </div>

          <CodeWindow title="quickstart" code={QUICKSTART_CODE} />
        </div>
      </section>

      {/* ───────────────────────── the 10 layers ───────────────────────── */}
      <section id="layers" className="mx-auto max-w-6xl px-6 py-24">
        <SectionLabel>The bigger picture</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          One platform. Ten layers. Built one at a time.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          The full vision is a complete infrastructure stack for autonomous systems. We ship
          a single layer until it has real, depending users — then earn the next. Layer 4 is
          the root: its trace data feeds evaluation and routing, and teaches us how agents run
          before we ever run them ourselves.
        </p>

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {LAYERS.map((l) => (
            <div
              key={l.n}
              className={`flex items-start gap-4 rounded-xl border p-5 transition ${
                l.active
                  ? "border-ember/50 bg-gradient-to-br from-ember/10 to-transparent"
                  : "border-line bg-panel/30 hover:border-zinc-700"
              }`}
            >
              <span
                className={`mt-0.5 font-mono text-sm tabular-nums ${
                  l.active ? "text-ember" : "text-faint"
                }`}
              >
                L{l.n}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-ink">{l.title}</h3>
                  {l.active ? (
                    <span className="rounded bg-ember/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-flame">
                      live
                    </span>
                  ) : (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                      roadmap
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{l.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 font-mono text-xs text-faint">
          // TS first, Rust when the data demands it. No premature engines.
        </p>
      </section>

      {/* ───────────────────────── architecture ───────────────────────── */}
      <section className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionLabel>How it flows</SectionLabel>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Deliberately boring plumbing.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            The novelty is the agent-aware data model — not the pipeline. TypeScript on Bun
            end to end; the hot ingest path swaps to a Rust core only when volume forces it.
          </p>
          <pre className="mt-10 overflow-x-auto rounded-xl border border-line bg-base p-6 font-mono text-[12px] leading-relaxed text-muted sm:text-sm">
{`  your agent  ──►  @romanica/sdk        buffers + batches spans
                       │  POST /v1/traces  (Bearer key)
                       ▼
                 `}<span className="text-ember">Ingest API (Hono)</span>{`     auth · validate · offload blobs · roll up cost
                       ▼
                 Storage              Postgres (meta) + S3/MinIO (big I/O)
                       ▼
                 `}<span className="text-ember">Query API (Hono)</span>{`      list · trace+tree · cost & latency
                       ▼
                 `}<span className="text-ember">Dashboard (Next.js)</span>{`   span tree · waterfall · I/O viewer`}
          </pre>
        </div>
      </section>

      {/* ───────────────────────── final CTA ───────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="glow-ember pointer-events-none absolute inset-x-0 bottom-0 h-96" />
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Stop reading logs.
            <br />
            <span className="text-gradient">Start seeing runs.</span>
          </h2>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href={GITHUB}
              className="btn-ember rounded-lg px-6 py-3 text-sm font-semibold text-white"
            >
              Get started on GitHub →
            </a>
            <a
              href="#layers"
              className="rounded-lg border border-line bg-panel/50 px-6 py-3 text-sm font-medium text-ink transition hover:border-zinc-600"
            >
              Explore the layers
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-faint sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">romanica</span>
            <span className="rule-ember h-px w-8" />
            <span>infrastructure for autonomous AI</span>
          </div>
          <div className="flex gap-5 font-mono text-xs">
            <a href={GITHUB} className="hover:text-ink">
              github
            </a>
            <a href="#layers" className="hover:text-ink">
              layers
            </a>
            <a href="#start" className="hover:text-ink">
              docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── small building blocks ───────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-ember">
      <span className="h-px w-6 bg-ember/60" />
      {children}
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string; soon?: boolean }) {
  return (
    <div className="group rounded-xl border border-line bg-panel/40 p-6 transition hover:border-ember/40">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-ember transition group-hover:shadow-[0_0_12px_2px_rgba(255,90,31,0.6)]" />
        <h3 className="font-medium text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Stat({
  big,
  small,
  tone,
}: {
  big: string;
  small: string;
  tone: "dim" | "hot";
}) {
  return (
    <div className="px-2 py-12 text-center sm:py-16">
      <div
        className={`font-mono text-5xl font-semibold tracking-tight ${
          tone === "hot" ? "text-gradient" : "text-faint line-through decoration-from-font"
        }`}
      >
        {big}
      </div>
      <p className="mx-auto mt-3 max-w-xs text-sm text-muted">{small}</p>
    </div>
  );
}

/* ───────────────────────── code samples ───────────────────────── */

const HERO_CODE = `import { Romanica } from "@romanica/sdk";

const romanica = new Romanica({ apiKey: process.env.ROMANICA_API_KEY });

await romanica.trace("support-agent", async (trace) => {
  await trace.span("retrieval", "search-kb", async (s) => {
    s.setRetrieval({ query: "refund policy", topK: 3 });
    s.setOutput(await searchKB("refund policy"));
  });

  await trace.span("llm", "draft-reply", async (s) => {
    const res = await openai.chat.completions.create({ model: "gpt-4o", messages });
    s.setLLM({ model: "gpt-4o", usage: res.usage }); // tokens + cost computed
    s.setOutput(res);
  });
});`;

const QUICKSTART_CODE = `# 1 — bring up Postgres + MinIO and migrate
bun run db:up && bun run db:migrate

# 2 — run the ingest + query API
bun run --filter '@romanica/api' dev    # :4000

# 3 — open the dashboard
bun run --filter '@romanica/web' dev     # :3000

# 4 — emit a sample trace, then watch it appear
bun run scripts/seed.ts`;
