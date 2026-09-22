/**
 * Pricing rules: weekday-aware peak windows, tier resolution, and the display
 * helpers the browser half shares.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activePeakWindow,
  currentPeakWindow,
  dayRanges,
  estimateCost,
  formatCost,
  formatTokens,
  isWindowActiveAt,
  normalizeDays,
  resolveTierAt,
  weekdayOf,
  type CostConfig,
  type PeakWindow,
  type PriceTier,
} from '../src/pricing.ts'

/** One instant on a given local weekday (ISO 1 = Monday … 7 = Sunday). */
function atWeekday(weekday: number, hours: number, minutes = 0): number {
  const date = new Date(2026, 0, 5, hours, minutes) // 2026-01-05 is a Monday.
  while (weekdayOf(date) !== weekday) date.setDate(date.getDate() + 1)
  return date.getTime()
}

/** One peak window with sensible defaults for all three prices. */
function window(overrides: Partial<PeakWindow> & { start: string; end: string }): PeakWindow {
  return {
    id: 'w',
    days: [1, 2, 3, 4, 5],
    cacheHitPrice: 2,
    cacheMissPrice: 4,
    outputPrice: 8,
    ...overrides,
  }
}

const TIER: PriceTier = {
  cacheHitPrice: 1,
  cacheMissPrice: 2,
  outputPrice: 4,
  peakWindows: [window({ id: 'morning', start: '09:00', end: '12:00' })],
}

test('same-day windows apply only on their selected weekdays', () => {
  const mondayMorning = atWeekday(1, 10)
  const saturdayMorning = atWeekday(6, 10)
  assert.equal(isWindowActiveAt(TIER.peakWindows[0]!, mondayMorning), true)
  assert.equal(isWindowActiveAt(TIER.peakWindows[0]!, saturdayMorning), false)
  assert.equal(isWindowActiveAt(window({ start: '09:00', end: '12:00', days: [6, 7] }), saturdayMorning), true)
})

test('window boundaries are half-open [start, end)', () => {
  const w = window({ start: '09:00', end: '12:00' })
  assert.equal(isWindowActiveAt(w, atWeekday(1, 8, 59)), false)
  assert.equal(isWindowActiveAt(w, atWeekday(1, 9, 0)), true)
  assert.equal(isWindowActiveAt(w, atWeekday(1, 11, 59)), true)
  assert.equal(isWindowActiveAt(w, atWeekday(1, 12, 0)), false)
})

test('an empty or absent weekday selection never applies', () => {
  const monday = atWeekday(1, 10)
  assert.equal(isWindowActiveAt(window({ start: '09:00', end: '12:00', days: [] }), monday), false)
  assert.equal(isWindowActiveAt({ ...window({ start: '09:00', end: '12:00' }), days: undefined as never }, monday), false)
})

test('a degenerate window (start === end) never applies', () => {
  assert.equal(isWindowActiveAt(window({ start: '09:00', end: '09:00' }), atWeekday(1, 9)), false)
})

test('an overnight window belongs to the weekday it starts on', () => {
  const fridayNight = window({ start: '22:00', end: '06:00', days: [5] })
  assert.equal(isWindowActiveAt(fridayNight, atWeekday(5, 23)), true)
  assert.equal(isWindowActiveAt(fridayNight, atWeekday(6, 2)), true, 'Saturday 02:00 is Friday evening')
  assert.equal(isWindowActiveAt(fridayNight, atWeekday(6, 23)), false, 'Saturday evening is not selected')
  assert.equal(isWindowActiveAt(fridayNight, atWeekday(7, 2)), false, 'Sunday 02:00 belongs to Saturday')
  assert.equal(isWindowActiveAt(fridayNight, atWeekday(5, 12)), false)
})

test('day selection accepts any subset of Monday–Sunday', () => {
  const weekend = window({ start: '00:00', end: '23:59', days: [6, 7] })
  assert.equal(isWindowActiveAt(weekend, atWeekday(6, 12)), true)
  assert.equal(isWindowActiveAt(weekend, atWeekday(7, 12)), true)
  assert.equal(isWindowActiveAt(weekend, atWeekday(1, 12)), false)
})

test('normalizeDays keeps only ISO weekday integers, sorted and unique', () => {
  assert.deepEqual(normalizeDays([7, 1, 1, 3]), [1, 3, 7])
  assert.deepEqual(normalizeDays([0, 8, 2.5, 4]), [4])
  assert.deepEqual(normalizeDays([]), [])
})

test('dayRanges groups consecutive weekdays', () => {
  assert.deepEqual(dayRanges([1, 2, 3, 4, 5]), [[1, 5]])
  assert.deepEqual(dayRanges([1, 3, 5]), [[1, 1], [3, 3], [5, 5]])
  assert.deepEqual(dayRanges([6, 7, 1]), [[1, 1], [6, 7]])
  assert.deepEqual(dayRanges([]), [])
})

test('activePeakWindow takes the first matching window in list order', () => {
  const tier: PriceTier = {
    ...TIER,
    peakWindows: [
      window({ id: 'first', start: '09:00', end: '12:00' }),
      window({ id: 'second', start: '10:00', end: '11:00' }),
    ],
  }
  assert.equal(activePeakWindow(tier, atWeekday(1, 10))?.id, 'first')
})

test('resolveTierAt prefers the model entry, falls back to default, and applies peak prices', () => {
  const config: CostConfig = {
    currency: 'CNY',
    default: { cacheHitPrice: 9, cacheMissPrice: 9, outputPrice: 9, peakWindows: [] },
    models: { 'deepseek-flash': TIER },
  }
  const offPeak = resolveTierAt(config, 'deepseek-flash', atWeekday(1, 8))
  assert.equal(offPeak.tier.outputPrice, 4)
  assert.equal(offPeak.peakWindow, null)
  const peak = resolveTierAt(config, 'deepseek-flash', atWeekday(1, 10))
  assert.equal(peak.tier.outputPrice, 8)
  assert.equal(peak.peakWindow?.id, 'morning')
  const fallback = resolveTierAt(config, 'unknown-model', atWeekday(1, 10))
  assert.equal(fallback.tier.outputPrice, 9)
  assert.equal(currentPeakWindow(config, 'deepseek-flash', atWeekday(1, 10))?.id, 'morning')
  assert.equal(currentPeakWindow(config, 'deepseek-flash', atWeekday(6, 10)), null)
})

test('estimateCost bills cache reads at the hit price and the rest of the prompt at the miss price', () => {
  const breakdown = estimateCost(
    { uncachedInputTokens: 1_000_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 500_000, outputTokens: 1_000_000 },
    { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 4 },
  )
  assert.equal(breakdown.cacheHitTokens, 2_000_000)
  assert.equal(breakdown.cacheMissTokens, 1_500_000)
  assert.equal(breakdown.cacheHitCost, 2_000_000 * 0.02 / 1_000_000)
  assert.equal(breakdown.cacheMissCost, 1.5)
  assert.equal(breakdown.outputCost, 4)
  assert.equal(breakdown.totalCost, breakdown.cacheHitCost + 1.5 + 4)
})

test('display helpers keep the shipped formatting rules', () => {
  assert.equal(formatTokens(517), '517')
  assert.equal(formatTokens(12_200), '12.2K')
  assert.equal(formatTokens(517_000), '517K')
  assert.equal(formatTokens(1_200_000), '1.2M')
  assert.equal(formatCost(0.0004), '0.0004')
  assert.equal(formatCost(0.5), '0.500')
  assert.equal(formatCost(12.345), '12.35')
})
