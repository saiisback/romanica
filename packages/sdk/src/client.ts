import { Trace } from "./trace.ts";
import { Exporter, NoopExporter, type IExporter } from "./exporter.ts";
import { httpTransport } from "./transport.ts";
import { traceContext } from "./context.ts";
import type { RomanicaConfig } from "./types.ts";

const DEFAULT_ENDPOINT = "http://localhost:4000";

export class Romanica {
  private readonly exporter: IExporter;
  private readonly now: () => number;

  constructor(config: RomanicaConfig = {}) {
    this.now = config.now ?? Date.now;

    if (config.disabled) {
      this.exporter = new NoopExporter();
      return;
    }

    const endpoint = config.endpoint ?? process.env.ROMANICA_ENDPOINT ?? DEFAULT_ENDPOINT;
    const apiKey = config.apiKey ?? process.env.ROMANICA_API_KEY;
    const transport = config.transport ?? httpTransport({ endpoint, apiKey });

    this.exporter = new Exporter({
      transport,
      flushIntervalMs: config.flushIntervalMs ?? 2000,
      maxQueue: config.maxQueue ?? 25,
      maxBatch: config.maxBatch ?? 100,
      debug: config.debug ?? false,
    });

    this.registerExitFlush();
  }

  /**
   * Wrap a full agent run. `fn` receives a {@link Trace}; use `trace.span(...)`
   * to record steps. The trace's start/end/status are captured automatically.
   * Errors thrown by `fn` are recorded and re-thrown unchanged.
   */
  async trace<T>(
    name: string,
    fn: (trace: Trace) => T | Promise<T>,
    opts?: { metadata?: Record<string, unknown> },
  ): Promise<T> {
    const trace = new Trace({ name, now: this.now, metadata: opts?.metadata }, this.now);
    try {
      // Expose the trace via AsyncLocalStorage so auto-instrumentation adapters
      // can find it without the user threading it through every call.
      return await traceContext.run(trace, () => fn(trace));
    } catch (err) {
      trace.markError();
      throw err;
    } finally {
      trace.end();
      this.exporter.enqueue(trace.toWire());
    }
  }

  /** Force-send buffered traces now (e.g. before a short-lived process exits). */
  flush(): Promise<void> {
    return this.exporter.flush();
  }

  /** Flush and stop. Call on graceful shutdown. */
  shutdown(): Promise<void> {
    return this.exporter.shutdown();
  }

  private registerExitFlush(): void {
    if (typeof process === "undefined" || typeof process.once !== "function") return;
    const flush = () => {
      void this.exporter.flush();
    };
    process.once("beforeExit", flush);
  }
}
