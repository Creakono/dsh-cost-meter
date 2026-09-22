/**
 * Weekday selection vocabulary shared by the cost readout and the settings
 * section: the localized labels, the draft defaults, the toggle fold, and the
 * compact display of a selection.
 *
 * Pure functions only — the React components own the state; this module owns the
 * rules, so the rules stay testable without a DOM.
 */
import { DEFAULT_PEAK_DAYS, dayRanges, normalizeDays, type PeakWindow } from './pricing.ts'
import type { CostKey } from './locales.ts'

/** The weekdays a window offers, with the locale key of each short label. */
export const WEEKDAY_LABELS = [
  { day: 1, key: 'days.mon' },
  { day: 2, key: 'days.tue' },
  { day: 3, key: 'days.wed' },
  { day: 4, key: 'days.thu' },
  { day: 5, key: 'days.fri' },
  { day: 6, key: 'days.sat' },
  { day: 7, key: 'days.sun' },
] as const

/** Every ISO weekday, the "every day" preset. */
export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/**
 * The weekday selection of one window as an editable draft. A window written
 * before weekday selection existed carries no `days`; it resolves to the shipped
 * workweek default rather than to "never", so an older value cannot silently
 * disable a configured branch.
 * @param window - persisted peak window.
 * @returns normalized ISO weekday numbers.
 */
export function draftDays(window: PeakWindow): number[] {
  const days = (window as { days?: number[] }).days
  return normalizeDays(days === undefined ? DEFAULT_PEAK_DAYS : days)
}

/**
 * Add or remove one weekday from a selection, keeping it sorted.
 * @param days - current selection.
 * @param day - ISO weekday to toggle.
 * @returns the next selection.
 */
export function toggleDay(days: readonly number[], day: number): number[] {
  const next = new Set(normalizeDays(days))
  if (next.has(day)) next.delete(day)
  else next.add(day)
  return [...next].sort((left, right) => left - right)
}

/**
 * Localized weekday summary of one selection, grouping consecutive days
 * (`[1,2,3,4,5]` → `Mon–Fri`). An empty selection reads as an em dash.
 * @param days - configured ISO weekday numbers.
 * @param t - namespace-bound translator.
 * @returns display text for the selection.
 */
export function formatDays(days: readonly number[], t: (key: CostKey) => string): string {
  const ranges = dayRanges(days)
  if (ranges.length === 0) return '\u2014'
  return ranges
    .map(([first, last]) => {
      const firstKey = (WEEKDAY_LABELS[first - 1]?.key ?? 'days.mon') as CostKey
      const lastKey = (WEEKDAY_LABELS[last - 1]?.key ?? 'days.mon') as CostKey
      return first === last ? t(firstKey) : `${t(firstKey)}\u2013${t(lastKey)}`
    })
    .join(', ')
}
