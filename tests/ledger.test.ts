/**
 * Ledger rules: which committed events carry billable usage, how a session's
 * committed prefix is read, and how one immutable entry is built.
 *
 * The usage payloads below are copied from real session logs of the current
 * harness, so a provider/event-shape change shows up here as a failing test
 * instead of as a silently empty cost line.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEntry,
  buildCostEntry,
  LEDGER_DOMAIN_SPEC,
  modelOf,
  priorEventsOf,
  seedFold,
  snapshotRecord,
  usageSampleOf,
  type LedgerEventLike,
  type LedgerSessionLike,
} from '../src/ledger.ts'
import type { CostConfig } from '../src/pricing.ts'

/** One committed event envelope. */
function event(type: string, data: unknown, seq = 1, time = Date.UTC(2026, 8, 22, 12, 0)): LedgerEventLike {
  return { type, seq, time, data }
}

/** The current Assistant settlement shape (assistant/message + data.usage). */
const CURRENT_SETTLEMENT = event('assistant/message', {
  turn: 1,
  step: 1,
  message: { role: 'assistant', content: [] },
  usage: { inputTokens: 20666, outputTokens: 289, totalTokens: 20955, cacheReadTokens: 0, reasoningTokens: 99 },
  stream: [{ type: 'chunk', chunk: { type: 'text-delta', text: 'hi' } }],
})

const CONFIG: CostConfig = {
  currency: 'CNY',
  default: { cacheHitPrice: 0.15, cacheMissPrice: 4.5, outputPrice: 13.5, peakWindows: [] },
  models: {
    'deepseek-flash': { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 4, peakWindows: [] },
  },
}

test('the current settlement carrier yields one usage sample', () => {
  assert.deepEqual(usageSampleOf(CURRENT_SETTLEMENT), {
    turn: 1,
    step: 1,
    buckets: { uncachedInputTokens: 20666, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 289 },
  })
})

test('an attempt settlement reads its embedded stream usage chunk', () => {
  const attempt = event('assistant/attempt', {
    turn: 2,
    step: 3,
    stream: [
      { type: 'chunk', chunk: { type: 'text-delta', text: 'x' } },
      { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 5, outputTokens: 7, cacheReadTokens: 3 } } },
    ],
  })
  assert.deepEqual(usageSampleOf(attempt)?.buckets, {
    uncachedInputTokens: 5,
    cacheReadTokens: 3,
    cacheWriteTokens: 0,
    outputTokens: 7,
  })
})

test('a message without its own usage falls back to the stream usage chunk', () => {
  const message = event('assistant/message', {
    turn: 1,
    step: 2,
    stream: [{ type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 8, outputTokens: 9 } } }],
  })
  assert.deepEqual(usageSampleOf(message)?.buckets, {
    uncachedInputTokens: 8,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 9,
  })
})

test('the pre-V3 streaming carrier still bills', () => {
  const legacy = event('assistant/chunk', {
    turn: 1,
    step: 1,
    chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 1 } },
  })
  assert.deepEqual(usageSampleOf(legacy)?.buckets, {
    uncachedInputTokens: 10,
    cacheReadTokens: 1,
    cacheWriteTokens: 0,
    outputTokens: 2,
  })
})

test('events without usage are ignored and never throw', () => {
  assert.equal(usageSampleOf(event('tool/call', { turn: 1, step: 1 })), null)
  assert.equal(usageSampleOf(event('turn/start', { turn: 1 })), null)
  assert.equal(usageSampleOf(event('assistant/message', { turn: 1, step: 1 })), null)
  assert.equal(usageSampleOf(event('assistant/message', null)), null)
  assert.equal(usageSampleOf(event('assistant/attempt', { turn: 'x', step: 1, usage: {} })), null)
})

test('the model fold reads the current request header shape', () => {
  const header = event('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash' } } })
  assert.equal(modelOf(header), 'deepseek-flash')
  assert.equal(modelOf(event('request/header', { header: { config: {} } })), null)
  assert.equal(modelOf(event('user/message', {})), null)
})

test('a session prefix is read through the current snapshotEvents API', () => {
  const events = [
    event('request/header', { header: { config: { model: 'deepseek-v4-pro' } } }, 0),
    event('turn/start', { turn: 1 }, 1),
  ]
  const session: LedgerSessionLike = {
    id: 's1',
    snapshotEvents: (from = 0, to = events.length) => events.slice(from, to),
  }
  assert.deepEqual(priorEventsOf(session, 2), events)
  assert.deepEqual(priorEventsOf(session, 1), [events[0]])
})

test('a session prefix falls back to the legacy array and to eventAt', () => {
  const events = [event('request/header', { header: { config: { model: 'legacy-model' } } }, 0)]
  const legacy: LedgerSessionLike = { id: 's2', events }
  assert.deepEqual(priorEventsOf(legacy, 1), events)
  const random: LedgerSessionLike = { id: 's3', eventAt: seq => events[seq] }
  assert.deepEqual(priorEventsOf(random, 1), events)
  assert.deepEqual(priorEventsOf({ id: 's4' }, 5), [], 'an unknown session shape degrades instead of throwing')
  const throwing: LedgerSessionLike = {
    id: 's5',
    snapshotEvents: () => { throw new TypeError('removed api') },
    events,
  }
  assert.deepEqual(priorEventsOf(throwing, 1), events)
})

test('seedFold keeps the last model strictly before the current event', () => {
  const events = [
    event('request/header', { header: { config: { model: 'a' } } }, 0),
    event('request/header', { header: { config: { model: 'b' } } }, 1),
    event('request/header', { header: { config: { model: 'c' } } }, 2),
  ]
  assert.equal(seedFold(events, 2).model, 'b')
  assert.equal(seedFold(events, 0).model, null)
  assert.equal(seedFold([], 3).model, null)
})

test('buildCostEntry snapshots the tier, the model, and the container currency', () => {
  const sample = usageSampleOf(CURRENT_SETTLEMENT)!
  const entry = buildCostEntry(CONFIG, 'deepseek-flash', sample, CURRENT_SETTLEMENT.time)
  assert.equal(entry.model, 'deepseek-flash')
  assert.equal(entry.currency, 'CNY')
  assert.equal(entry.peakWindowId, null)
  assert.deepEqual(entry.prices, { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 4 })
  assert.equal(entry.tokens.cacheMissTokens, 20666)
  assert.equal(entry.costs.totalCost, entry.costs.cacheHitCost + entry.costs.cacheMissCost + entry.costs.outputCost)
  const unknown = buildCostEntry(CONFIG, null, sample, CURRENT_SETTLEMENT.time)
  assert.deepEqual(unknown.prices, { cacheHitPrice: 0.15, cacheMissPrice: 4.5, outputPrice: 13.5 })
})

test('applying an entry replaces the step in place and snapshotRecord sums the session', () => {
  const sample = usageSampleOf(CURRENT_SETTLEMENT)!
  const first = buildCostEntry(CONFIG, 'deepseek-flash', sample, CURRENT_SETTLEMENT.time)
  let record = applyEntry({ sessionId: 's1', entries: {} }, first)
  assert.equal(Object.keys(record.entries).length, 1)
  record = applyEntry(record, first)
  assert.equal(Object.keys(record.entries).length, 1, 'a repeated sample replaces its step')
  const second = buildCostEntry(CONFIG, 'deepseek-flash', { ...sample, turn: 2 }, CURRENT_SETTLEMENT.time + 1000)
  record = applyEntry(record, second)
  const snapshot = snapshotRecord(record)
  assert.equal(snapshot.entries.length, 2)
  assert.equal(snapshot.tokens.cacheMissTokens, first.tokens.cacheMissTokens * 2)
  assert.equal(
    snapshot.costs.totalCost,
    snapshot.costs.cacheHitCost + snapshot.costs.cacheMissCost + snapshot.costs.outputCost,
  )
  assert.deepEqual(snapshotRecord(undefined).entries, [])
})

test('the storage-domain spec validates stored records at the durable boundary', () => {
  assert.equal(LEDGER_DOMAIN_SPEC.name, 'dsh_cost_meter')
  assert.equal(LEDGER_DOMAIN_SPEC.version, 1)
  const parse = LEDGER_DOMAIN_SPEC.tables.sessions.valueSchema.parse
  const stored = {
    sessionId: 's1',
    entries: {
      't:1:1': {
        turn: 1,
        step: 1,
        time: 1,
        model: 'deepseek-flash',
        currency: 'CNY',
        peakWindowId: null,
        prices: { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 4 },
        tokens: { cacheHitTokens: 1, cacheMissTokens: 2, outputTokens: 3 },
        costs: { cacheHitCost: 0, cacheMissCost: 0, outputCost: 0, totalCost: 0 },
      },
    },
  }
  assert.deepEqual(parse(stored), stored)
  assert.throws(() => parse({ sessionId: 's1', entries: { bad: { turn: -1 } } }))
  assert.throws(() => parse({ entries: {} }))
})
