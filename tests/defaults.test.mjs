/**
 * Shipped defaults (the Host bundle artifact) must match the official DeepSeek
 * price table, with peak pricing enabled for the documented weekday windows.
 * Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 *
 * The Host bundle is self-contained, so this test can import the shipped
 * artifact directly with plain Node — no build tooling involved.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_COST_CONFIG, DEFAULT_PEAK_DAYS, WEEKDAYS } from '../index.mjs'

const FLASH = { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 4 }
const PRO = { cacheHitPrice: 0.15, cacheMissPrice: 4.5, outputPrice: 13.5 }
const PEAK_SPANS = [['09:00', '12:00'], ['14:00', '18:00']]

/** Assert one tier's off-peak prices, peak spans, and doubled peak prices. */
function assertTier(name, tier, offPeak) {
  assert.equal(tier.cacheHitPrice, offPeak.cacheHitPrice, `${name} cache-hit price`)
  assert.equal(tier.cacheMissPrice, offPeak.cacheMissPrice, `${name} cache-miss price`)
  assert.equal(tier.outputPrice, offPeak.outputPrice, `${name} output price`)
  assert.equal(tier.peakWindows.length, PEAK_SPANS.length, `${name} peak window count`)
  tier.peakWindows.forEach((window, index) => {
    assert.deepEqual([window.start, window.end], PEAK_SPANS[index], `${name} peak span ${index}`)
    assert.deepEqual(window.days, [1, 2, 3, 4, 5], `${name} bills peak on Monday–Friday`)
    assert.equal(window.cacheHitPrice, offPeak.cacheHitPrice * 2, `${name} peak cache-hit price`)
    assert.equal(window.cacheMissPrice, offPeak.cacheMissPrice * 2, `${name} peak cache-miss price`)
    assert.equal(window.outputPrice, offPeak.outputPrice * 2, `${name} peak output price`)
  })
}

test('the shipped currency is CNY', () => {
  assert.equal(DEFAULT_COST_CONFIG.currency, 'CNY')
})

test('default peak days are Monday–Friday', () => {
  assert.deepEqual([...DEFAULT_PEAK_DAYS], [1, 2, 3, 4, 5])
  assert.deepEqual([...WEEKDAYS], [1, 2, 3, 4, 5, 6, 7])
})

test('deepseek-flash ships the documented off-peak and peak prices', () => {
  assertTier('deepseek-flash', DEFAULT_COST_CONFIG.models['deepseek-flash'], FLASH)
})

test('deepseek-v4-pro ships the documented off-peak and peak prices', () => {
  assertTier('deepseek-v4-pro', DEFAULT_COST_CONFIG.models['deepseek-v4-pro'], PRO)
})

test('retired Flash ids stay on Flash prices', () => {
  assertTier('deepseek-v4-flash', DEFAULT_COST_CONFIG.models['deepseek-v4-flash'], FLASH)
  assertTier('deepseek-v4-flash-vision-exp', DEFAULT_COST_CONFIG.models['deepseek-v4-flash-vision-exp'], FLASH)
})

test('the fallback tier mirrors deepseek-v4-pro', () => {
  assert.deepEqual(DEFAULT_COST_CONFIG.default, DEFAULT_COST_CONFIG.models['deepseek-v4-pro'])
})
