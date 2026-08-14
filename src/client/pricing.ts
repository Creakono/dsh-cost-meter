/**
 * Pure pricing math shared by the dock readout and the settings section: the
 * per-model price table, the token buckets, and the cost estimation.
 */

/** One price tier: every price is per 1,000,000 tokens, in the table currency. */
export interface PriceTier {
  /** Input cache-hit price per 1M tokens. */
  cacheHitPrice: number
  /** Input cache-miss price per 1M tokens (cache writes bill at this rate too). */
  cacheMissPrice: number
  /** Output price per 1M tokens. */
  outputPrice: number
}

/** Local price table: a fallback tier plus per-model overrides. */
export interface CostConfig {
  /** Billing currency (CNY = ¥, USD = $). */
  currency: 'CNY' | 'USD'
  /** Fallback tier for models absent from `models`. */
  default: PriceTier
  /** Per-model tiers keyed by provider-owned model id. */
  models: Record<string, PriceTier>
}

/** Currency display symbols. */
export const CURRENCY_SYMBOLS: Record<CostConfig['currency'], string> = {
  CNY: '\u00a5',
  USD: '$',
}

/** The disjoint provider usage buckets the `tokenUsage` projection carries. */
export interface TokenUsageBucket {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

/**
 * Merge this plugin's `tokenUsage` read into the projection type table —
 * the same declaration-merging seam the token-meter package uses, declared
 * locally so the client bundle never imports a host-side package.
 */
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Provider-reported usage accumulated across the complete durable log. */
    tokenUsage: TokenUsageBucket
  }
}

/** Sum the three disjoint prompt-side billing buckets (same rule as the stats line). */
export function billedInputTokens(usage: TokenUsageBucket): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Resolve the price tier for one model id: its table entry when present,
 * the `default` fallback otherwise.
 * @param config - the local price table.
 * @param model - provider-owned model id, or null/undefined when unknown.
 * @returns the applicable price tier.
 */
export function resolveTier(config: CostConfig, model: string | null | undefined): PriceTier {
  if (model !== null && model !== undefined) {
    const tier = config.models[model]
    if (tier !== undefined) return tier
  }
  return config.default
}

/** One session's estimated cost, split by billing bucket. */
export interface CostBreakdown {
  cacheHitTokens: number
  cacheMissTokens: number
  outputTokens: number
  cacheHitCost: number
  cacheMissCost: number
  outputCost: number
  totalCost: number
}

/**
 * Estimate the session cost from the durable provider usage and one price
 * tier. Cache reads bill at the cache-hit price; uncached input and cache
 * writes bill at the cache-miss price.
 * @param usage - the session's `tokenUsage` projection value.
 * @param tier - the price tier (per 1M tokens).
 * @returns the per-bucket and total cost.
 */
export function estimateCost(usage: TokenUsageBucket, tier: PriceTier): CostBreakdown {
  const cacheHitTokens = usage.cacheReadTokens
  const cacheMissTokens = usage.uncachedInputTokens + usage.cacheWriteTokens
  const outputTokens = usage.outputTokens
  const cacheHitCost = cacheHitTokens * tier.cacheHitPrice / 1_000_000
  const cacheMissCost = cacheMissTokens * tier.cacheMissPrice / 1_000_000
  const outputCost = outputTokens * tier.outputPrice / 1_000_000
  return {
    cacheHitTokens,
    cacheMissTokens,
    outputTokens,
    cacheHitCost,
    cacheMissCost,
    outputCost,
    totalCost: cacheHitCost + cacheMissCost + outputCost,
  }
}

/**
 * Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three
 * digits) — the same display rule the shipped stats line uses.
 * @param n - token count.
 * @returns display string.
 */
export function formatTokens(n: number): string {
  const scaled = (v: number) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/**
 * Format an estimated cost: four decimals under one cent, three under one
 * unit, two from there on.
 * @param cost - cost in the configured currency.
 * @returns display string without the currency symbol.
 */
export function formatCost(cost: number): string {
  const decimals = cost > 0 && cost < 0.01 ? 4 : cost < 1 ? 3 : 2
  return cost.toFixed(decimals)
}
