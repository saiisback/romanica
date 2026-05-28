export { Romanica } from "./client.ts";
export { Trace } from "./trace.ts";
export { Span } from "./span.ts";
export type { SetLLMArgs } from "./span.ts";
export type { RomanicaConfig, Transport } from "./types.ts";
export { Exporter, NoopExporter, type IExporter } from "./exporter.ts";
export { httpTransport } from "./transport.ts";

// re-export shared types so users import everything from one place
export type {
  SpanType,
  SpanStatus,
  TraceStatus,
  IngestSpan,
  IngestTrace,
  IngestPayload,
} from "@romanica/shared";
