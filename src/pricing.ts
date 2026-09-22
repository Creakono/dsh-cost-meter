/**
 * Shared pricing vocabulary and math for the host ledger and the browser UI:
 * the per-model price table, optional peak-time branches, token buckets, and
 * the cost estimation.
 */

/** A billing currency accepted by the price table. */
export type Currency = 'CNY' | 'USD'

/** Currency display symbols used by the browser half. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '\u00a5',
  USD: '$',
}

/** Three prices per 1,000,000 tokens shared by base tiers and peak windows. */
export interface PriceValues {
  /** Input cache-hit price per 1M tokens. */
  cacheHitPrice: number
  /** Input cache-miss price per 1M tokens (cache writes bill at this rate too). */
  cacheMissPrice: number
  /** Output price per 1M tokens. */
  outputPrice: number
}

/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** One ISO weekday number (1 = Monday … 7 = Sunday). */
export type Weekday = typeof WEEKDAYS[number]

/**
 * Weekdays a peak window applies to by default: Monday–Friday. This is the
 * official DeepSeek peak schedule (工作日 09:00–12:00 / 14:00–18:00), and it is
 * also what every window written before weekday selection existed resolves to.
 */
export const DEFAULT_PEAK_DAYS: readonly Weekday[] = [1, 2, 3, 4, 5]

/**
 * One optional peak-time branch. Times are local `HH:mm` strings; a window
 * with `start > end` crosses midnight. Prices are per 1,000,000 tokens.
 *
 * `days` selects the weekdays the window is billed on. An overnight window
 * belongs to the weekday it starts on, so a 22:00–06:00 window enabled for
 * Friday also covers the early hours of Saturday. An empty `days` list means
 * the window never applies (an explicit way to park a branch).
 */
export interface PeakWindow extends PriceValues {
  /** Stable id used to tag ledger entries billed through this window. */
  id: string
  /** Local start time, `HH:mm`. */
  start: string
  /** Local end time, `HH:mm` (exclusive). */
  end: string
  /** Weekdays (ISO 1–7) the window applies to; empty means "never". */
  days: number[]
}

/**
 * One price tier: base prices per 1,000,000 tokens plus optional peak
 * windows. A model not currently inside one of its windows bills at the base
 * prices; inside a window it bills at that window's prices.
 */
export interface PriceTier extends PriceValues {
  /** Peak-time branches; the first matching window wins. */
  peakWindows: PeakWindow[]
}

/** Local price table: a fallback tier plus per-model overrides. */
export interface CostConfig {
  /** Billing currency (CNY = ¥, USD = $). */
  currency: Currency
  /** Fallback tier for models absent from `models`. */
  default: PriceTier
  /** Per-model tiers keyed by provider-owned model id. */
  models: Record<string, PriceTier>
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

/** Minutes since local midnight. */
function minutesOfTime(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (match === null) return NaN
  return Number(match[1]) * 60 + Number(match[2])
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: Date): Weekday {
  const day = date.getDay()
  return (day === 0 ? 7 : day) as Weekday
}

/** The weekday before `weekday`, wrapping Sunday back to Saturday. */
function previousWeekday(weekday: Weekday): Weekday {
  return (weekday === 1 ? 7 : weekday - 1) as Weekday
}

/** Normalize one configured day list: integers 1–7, de-duplicated and sorted. */
export function normalizeDays(days: readonly number[] | undefined): number[] {
  if (days === undefined) return []
  const seen = new Set<number>()
  for (const day of days) {
    if (Number.isSafeInteger(day) && day >= 1 && day <= 7) seen.add(day)
  }
  return [...seen].sort((left, right) => left - right)
}

/**
 * Whether one window is active at `time` (epoch ms, local time), honoring both
 * its time span and its weekday selection. A window with `start < end` is a
 * plain same-day span; one with `start > end` crosses midnight and is charged
 * to the weekday it started on.
 * @param window - the window whose span and days are checked.
 * @param time - billing instant.
 * @returns true when the instant bills at this window's prices.
 */
export function isWindowActiveAt(window: PeakWindow, time: number): boolean {
  const startMinutes = minutesOfTime(window.start)
  const endMinutes = minutesOfTime(window.end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes === endMinutes) {
    return false
  }
  const days = normalizeDays(window.days)
  if (days.length === 0) return false
  const date = new Date(time)
  const minutes = date.getHours() * 60 + date.getMinutes()
  const weekday = weekdayOf(date)
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes && days.includes(weekday)
  }
  // Overnight: the pre-midnight part belongs to today, the post-midnight part
  // to the window that started yesterday.
  if (minutes >= startMinutes) return days.includes(weekday)
  if (minutes < endMinutes) return days.includes(previousWeekday(weekday))
  return false
}

/**
 * Group selected weekdays into inclusive ISO ranges for compact display
 * (`[1,2,3,4,5]` → `[[1,5]]`). A Sunday-first run such as `[6,7,1]` is not
 * wrapped: the calendar week ends on Sunday.
 * @param days - configured day numbers (any order, duplicates allowed).
 * @returns inclusive `[first, last]` ranges in ascending order.
 */
export function dayRanges(days: readonly number[]): Array<readonly [number, number]> {
  const normalized = normalizeDays(days)
  const ranges: Array<[number, number]> = []
  for (const day of normalized) {
    const last = ranges.at(-1)
    if (last !== undefined && day === last[1] + 1) last[1] = day
    else ranges.push([day, day])
  }
  return ranges
}

/**
 * The active peak window for one tier at `time` (epoch ms, local time).
 * @param tier - the tier whose windows are checked.
 * @param time - billing instant.
 * @returns the first matching window, or null.
 */
export function activePeakWindow(tier: PriceTier, time: number): PeakWindow | null {
  for (const window of tier.peakWindows) {
    if (isWindowActiveAt(window, time)) return window
  }
  return null
}

/** A tier chosen for one billing instant plus the peak window that supplied it, if any. */
export interface ResolvedTier {
  /** The applicable prices (base prices or one peak window's prices). */
  tier: PriceValues
  /** The matched peak window, when the instant falls inside one. */
  peakWindow: PeakWindow | null
}

/**
 * Resolve the price tier for one model at one billing instant: its table
 * entry when present (with peak windows applied), the `default` fallback
 * otherwise.
 * @param config - the local price table.
 * @param model - provider-owned model id, or null/undefined when unknown.
 * @param time - billing instant (epoch ms, local time).
 * @returns the applicable tier and the matched peak window, if any.
 */
export function resolveTierAt(config: CostConfig, model: string | null | undefined, time: number): ResolvedTier {
  const base = model !== null && model !== undefined && config.models[model] !== undefined
    ? config.models[model]!
    : config.default
  const peakWindow = activePeakWindow(base, time)
  return peakWindow === null ? { tier: base, peakWindow: null } : { tier: peakWindow, peakWindow }
}

/**
 * The active peak window for one model right now, or null. Used by the dock
 * to warn while the current session's model is billing at peak prices.
 */
export function currentPeakWindow(config: CostConfig, model: string | null, now: number): PeakWindow | null {
  const resolved = resolveTierAt(config, model, now)
  return resolved.peakWindow
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
 * Estimate a cost from provider usage and one price tier. Cache reads bill
 * at the cache-hit price; uncached input and cache writes bill at the
 * cache-miss price.
 * @param usage - one step's `tokenUsage` buckets.
 * @param tier - the price tier (per 1M tokens).
 * @returns the per-bucket and total cost.
 */
export function estimateCost(usage: TokenUsageBucket, tier: PriceValues): CostBreakdown {
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
