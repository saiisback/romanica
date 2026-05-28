/**
 * Best-effort model pricing for cost rollups, in USD per 1M tokens.
 * Used when an `llm` span reports token usage but no explicit `costUsd`.
 * Prices drift — treat as a sane default, overridable by the caller passing
 * `costUsd` directly on the span.
 */
export interface ModelPrice {
  /** USD per 1M input/prompt tokens */
  input: number;
  /** USD per 1M output/completion tokens */
  output: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "o3": { input: 2, output: 8 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  // Google
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

/** Normalise a provider model id to a pricing key (strips dates/versions). */
function normalizeModel(model: string): string {
  const lower = model.toLowerCase();
  // exact match first
  if (MODEL_PRICES[lower]) return lower;
  // longest known prefix wins (e.g. "claude-sonnet-4-20250101" -> "claude-sonnet-4")
  let best = "";
  for (const key of Object.keys(MODEL_PRICES)) {
    if (lower.startsWith(key) && key.length > best.length) best = key;
  }
  return best;
}

/**
 * Estimate cost in USD. Returns 0 when the model is unknown (we never guess
 * wildly — an unknown model just contributes nothing rather than a wrong number).
 */
export function estimateCostUsd(
  model: string | undefined,
  promptTokens = 0,
  completionTokens = 0,
): number {
  if (!model) return 0;
  const price = MODEL_PRICES[normalizeModel(model)];
  if (!price) return 0;
  return (
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output
  );
}
