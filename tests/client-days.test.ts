/**
 * Weekday-selection rules used by the price-table settings page and the cost
 * readout: draft defaults, toggling, and the compact localized summary.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftDays, EVERY_DAY, formatDays, toggleDay, WEEKDAY_LABELS } from '../src/client/days.ts'
import type { PeakWindow } from '../src/pricing.ts'

/** A minimal peak window carrying only the fields the day helpers read. */
function window(days: number[] | undefined): PeakWindow {
  return {
    id: 'w',
    start: '09:00',
    end: '12:00',
    days: days as number[],
    cacheHitPrice: 0,
    cacheMissPrice: 0,
    outputPrice: 0,
  }
}

/** Translator over the plugin's own day labels, falling back to the key. */
const translate = (key: string): string => ({
  'days.mon': 'Mon', 'days.tue': 'Tue', 'days.wed': 'Wed', 'days.thu': 'Thu',
  'days.fri': 'Fri', 'days.sat': 'Sat', 'days.sun': 'Sun',
}[key] ?? key)

test('a window written before weekday selection defaults to the workweek', () => {
  assert.deepEqual(draftDays(window(undefined)), [1, 2, 3, 4, 5])
  assert.deepEqual(draftDays(window([6, 7])), [6, 7])
  assert.deepEqual(draftDays(window([3, 1, 3])), [1, 3])
  assert.deepEqual(draftDays(window([])), [])
})

test('toggleDay adds and removes one weekday, keeping the list sorted', () => {
  assert.deepEqual(toggleDay([1, 5], 3), [1, 3, 5])
  assert.deepEqual(toggleDay([1, 3, 5], 3), [1, 5])
  assert.deepEqual(toggleDay([], 7), [7])
  assert.deepEqual(toggleDay([1, 2, 3, 4, 5, 6, 7], 1), [2, 3, 4, 5, 6, 7])
})

test('every ISO weekday is offered once, Monday first', () => {
  assert.deepEqual(WEEKDAY_LABELS.map(entry => entry.day), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(EVERY_DAY, [1, 2, 3, 4, 5, 6, 7])
})

test('formatDays groups consecutive weekdays and localizes the labels', () => {
  assert.equal(formatDays([1, 2, 3, 4, 5], translate), 'Mon\u2013Fri')
  assert.equal(formatDays([6, 7], translate), 'Sat\u2013Sun')
  assert.equal(formatDays([1, 3], translate), 'Mon, Wed')
  assert.equal(formatDays([], translate), '\u2014')
})
