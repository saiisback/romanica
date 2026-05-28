import type { IngestTrace } from "@romanica/shared";
import type { Transport } from "./types.ts";

export interface IExporter {
  enqueue(trace: IngestTrace): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ExporterOptions {
  transport: Transport;
  flushIntervalMs: number;
  maxQueue: number;
  maxBatch: number;
  debug: boolean;
}

/**
 * Buffers completed traces and ships them in batches.
 * Guarantees: never throws into the caller, never blocks the agent, and never
 * keeps the process alive on its own (timer is unref'd).
 */
export class Exporter implements IExporter {
  private queue: IngestTrace[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(private readonly opts: ExporterOptions) {}

  enqueue(trace: IngestTrace): void {
    this.queue.push(trace);
    if (this.queue.length >= this.opts.maxQueue) {
      void this.flush();
    } else {
      this.ensureTimer();
    }
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.opts.flushIntervalMs);
    // don't let a pending flush keep the process alive
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Drain the queue to the transport. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.opts.maxBatch);
        try {
          await this.opts.transport({ traces: batch });
        } catch (err) {
          if (this.opts.debug) {
            console.warn("[romanica] export failed, dropping batch:", err);
          }
          // fail silently — observability must never break or stall the app
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Flush remaining traces and stop the timer. */
  async shutdown(): Promise<void> {
    await this.flush();
  }
}

/** No-op exporter used when the SDK is disabled. */
export class NoopExporter implements IExporter {
  enqueue(_trace: IngestTrace): void {}
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
