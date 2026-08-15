/**
 * Host-side cost ledger vocabulary and pure math. The ledger records one
 * immutable price entry per model step billed after this plugin version was
 * installed (no backfill). Each entry snapshots the token buckets, the model,
 * the peak window (if any), the prices actually used, and the resulting cost.
 *
 * The storage-domain record schema is validated by a plain `parse` object so
 * the host bundle stays self-contained (no zod import).
 */
import {
  estimateCost,
  resolveTierAt,
  type CostConfig,
  type Currency,
  type TokenUsageBucket,
} from './pricing.ts'

/** One billing sample extracted from a committed session event. */
export interface UsageSample {
  turn: number
  step: number
  buckets: TokenUsageBucket
}

/** Minimal committed-event shape the ledger reads. */
export interface LedgerEventLike {
  type: string
  seq: number
  time: number
  data: unknown
}

/** Minimal live-session shape the ledger folds. */
export interface LedgerSessionLike {
  id: string
  events: readonly LedgerEventLike[]
}

/** One immutable per-step cost entry. */
export interface CostEntry {
  turn: number
  step: number
  /** Billing instant (epoch ms) — the committed event's own time. */
  time: number
  /** Provider model id from the latest `request/header`, or null. */
  model: string | null
  currency: Currency
  /** Matched peak window id, or null when billed at base prices. */
  peakWindowId: string | null
  /** Price snapshot used for this entry (per 1M tokens). */
  prices: {
    cacheHitPrice: number
    cacheMissPrice: number
    outputPrice: number
  }
  /** Token buckets billed by this entry. */
  tokens: {
    cacheHitTokens: number
    cacheMissTokens: number
    outputTokens: number
  }
  /** Immutable per-bucket and total costs in the snapshot currency. */
  costs: {
    cacheHitCost: number
    cacheMissCost: number
    outputCost: number
    totalCost: number
  }
}

/** One session's durable ledger record, keyed by session id in the sidecar table. */
export interface SessionCostRecord {
  sessionId: string
  /** Entries keyed by `turn:step` so a later sample replaces its step. */
  entries: Record<string, CostEntry>
}

/** Read-side snapshot served to the browser. */
export interface SessionLedgerSnapshot {
  entries: CostEntry[]
  tokens: {
    cacheHitTokens: number
    cacheMissTokens: number
    outputTokens: number
  }
  costs: {
    cacheHitCost: number
    cacheMissCost: number
    outputCost: number
    totalCost: number
  }
}

const ENTRY_PREFIX = 't:'

/** Stable record key for one turn/step. */
export function entryKey(turn: number, step: number): string {
  return `${ENTRY_PREFIX}${turn}:${step}`
}

/** Extract the provider usage carried by one committed event, if any. */
export function usageSampleOf(event: LedgerEventLike): UsageSample | null {
  const data = event.data as {
    turn?: unknown
    step?: unknown
    chunk?: { type?: unknown; usage?: unknown }
    usage?: unknown
  } | null | undefined
  if (data === null || data === undefined) return null
  const usage = event.type === 'assistant/chunk' && (data.chunk as { type?: unknown } | undefined)?.type === 'usage'
    ? (data.chunk as { usage?: unknown } | undefined)?.usage
    : event.type === 'assistant/message'
      ? data.usage
      : undefined
  if (usage === undefined) return null
  const turn = Number(data.turn)
  const step = Number(data.step)
  const buckets = bucketsOf(usage)
  if (buckets === null || !Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(step) || step < 0) {
    return null
  }
  return { turn, step, buckets }
}

function bucketsOf(usage: unknown): TokenUsageBucket | null {
  if (!isPlainObject(usage)) return null
  const value = usage as Record<string, unknown>
  const uncachedInputTokens = nonNegativeNumber(value.inputTokens)
  const outputTokens = nonNegativeNumber(value.outputTokens)
  const cacheReadTokens = nonNegativeNumber(value.cacheReadTokens ?? 0)
  const cacheWriteTokens = nonNegativeNumber(value.cacheWriteTokens ?? 0)
  if (uncachedInputTokens === null || outputTokens === null || cacheReadTokens === null || cacheWriteTokens === null) {
    return null
  }
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/** The model id carried by a `request/header` event, if any. */
export function modelOf(event: LedgerEventLike): string | null {
  if (event.type !== 'request/header') return null
  const data = event.data as { header?: { config?: { model?: unknown } } } | null | undefined
  const model = data?.header?.config?.model
  return typeof model === 'string' && model !== '' ? model : null
}

/** Live fold state: only the latest model route matters for post-upgrade events. */
export interface SessionFold {
  model: string | null
}

/** Seed a fold from the committed prefix WITHOUT generating entries (no backfill). */
export function seedFold(events: readonly LedgerEventLike[], untilSeq: number): SessionFold {
  let model: string | null = null
  for (const event of events) {
    if (event.seq >= untilSeq) break
    const next = modelOf(event)
    if (next !== null) model = next
  }
  return { model }
}

/** Fold one new event's model state (no entry generation here). */
export function foldModel(state: SessionFold, event: LedgerEventLike): SessionFold {
  const model = modelOf(event)
  return model === null || model === state.model ? state : { model }
}

/**
 * Build the immutable cost entry for one usage sample at its own event time.
 */
export function buildCostEntry(
  config: CostConfig,
  model: string | null,
  sample: UsageSample,
  time: number,
): CostEntry {
  const { tier, peakWindow } = resolveTierAt(config, model, time)
  const breakdown = estimateCost(sample.buckets, tier)
  return {
    turn: sample.turn,
    step: sample.step,
    time,
    model,
    currency: config.currency,
    peakWindowId: peakWindow?.id ?? null,
    prices: {
      cacheHitPrice: tier.cacheHitPrice,
      cacheMissPrice: tier.cacheMissPrice,
      outputPrice: tier.outputPrice,
    },
    tokens: {
      cacheHitTokens: breakdown.cacheHitTokens,
      cacheMissTokens: breakdown.cacheMissTokens,
      outputTokens: breakdown.outputTokens,
    },
    costs: {
      cacheHitCost: breakdown.cacheHitCost,
      cacheMissCost: breakdown.cacheMissCost,
      outputCost: breakdown.outputCost,
      totalCost: breakdown.totalCost,
    },
  }
}

/** True when two entries carry the same billed facts (avoids a no-op write). */
export function sameEntry(left: CostEntry, right: CostEntry): boolean {
  return left.turn === right.turn
    && left.step === right.step
    && left.time === right.time
    && left.model === right.model
    && left.currency === right.currency
    && left.peakWindowId === right.peakWindowId
    && left.prices.cacheHitPrice === right.prices.cacheHitPrice
    && left.prices.cacheMissPrice === right.prices.cacheMissPrice
    && left.prices.outputPrice === right.prices.outputPrice
    && left.tokens.cacheHitTokens === right.tokens.cacheHitTokens
    && left.tokens.cacheMissTokens === right.tokens.cacheMissTokens
    && left.tokens.outputTokens === right.tokens.outputTokens
    && left.costs.cacheHitCost === right.costs.cacheHitCost
    && left.costs.cacheMissCost === right.costs.cacheMissCost
    && left.costs.outputCost === right.costs.outputCost
    && left.costs.totalCost === right.costs.totalCost
}

/** Replace (or insert) one step entry in a record; same reference when unchanged. */
export function applyEntry(record: SessionCostRecord, entry: CostEntry): SessionCostRecord {
  const key = entryKey(entry.turn, entry.step)
  const current = record.entries[key]
  if (current !== undefined && sameEntry(current, entry)) return record
  return { ...record, entries: { ...record.entries, [key]: entry } }
}

/** Read-side snapshot: sorted entries plus summed buckets and costs. */
export function snapshotRecord(record: SessionCostRecord | undefined): SessionLedgerSnapshot {
  const entries = Object.values(record?.entries ?? {})
    .sort((a, b) => a.time - b.time || a.turn - b.turn || a.step - b.step)
  const snapshot: SessionLedgerSnapshot = {
    entries,
    tokens: { cacheHitTokens: 0, cacheMissTokens: 0, outputTokens: 0 },
    costs: { cacheHitCost: 0, cacheMissCost: 0, outputCost: 0, totalCost: 0 },
  }
  for (const entry of entries) {
    snapshot.tokens.cacheHitTokens += entry.tokens.cacheHitTokens
    snapshot.tokens.cacheMissTokens += entry.tokens.cacheMissTokens
    snapshot.tokens.outputTokens += entry.tokens.outputTokens
    snapshot.costs.cacheHitCost += entry.costs.cacheHitCost
    snapshot.costs.cacheMissCost += entry.costs.cacheMissCost
    snapshot.costs.outputCost += entry.costs.outputCost
    snapshot.costs.totalCost += entry.costs.totalCost
  }
  return snapshot
}

/**
 * Structural domain spec accepted by `ctx.storageDomain.open`. The record
 * `parse` validates stored rows by hand, so this package imports no zod.
 */
export const LEDGER_DOMAIN_SPEC = {
  // Storage unit names must match /^[a-z][a-z0-9_]*$/ (no hyphens) — the
  // plugin id stays `dsh-cost-meter`, only the unit/file name differs.
  name: 'dsh_cost_meter',
  version: 1,
  tables: {
    sessions: {
      valueSchema: {
        parse(raw: unknown): SessionCostRecord {
          return parseSessionCostRecord(raw)
        },
      },
    },
  },
}

function parseSessionCostRecord(raw: unknown): SessionCostRecord {
  if (!isPlainObject(raw)) throw new Error('cost-ledger session record must be an object')
  const value = raw as Record<string, unknown>
  if (typeof value.sessionId !== 'string' || value.sessionId === '') {
    throw new Error('cost-ledger session record has no sessionId')
  }
  if (!isPlainObject(value.entries)) throw new Error('cost-ledger session record entries must be an object')
  const entries: Record<string, CostEntry> = {}
  for (const [key, rawEntry] of Object.entries(value.entries as Record<string, unknown>)) {
    entries[key] = parseCostEntry(rawEntry)
  }
  return { sessionId: value.sessionId, entries }
}

function parseCostEntry(raw: unknown): CostEntry {
  if (!isPlainObject(raw)) throw new Error('cost-ledger entry must be an object')
  const value = raw as Record<string, unknown>
  const turn = nonNegativeInteger(value.turn, 'turn')
  const step = nonNegativeInteger(value.step, 'step')
  const time = finiteNumber(value.time, 'time')
  if (time < 0) throw new Error('cost-ledger entry time must be non-negative')
  if (value.model !== null && typeof value.model !== 'string') {
    throw new Error('cost-ledger entry model must be a string or null')
  }
  if (value.currency !== 'CNY' && value.currency !== 'USD') {
    throw new Error('cost-ledger entry currency must be CNY or USD')
  }
  if (value.peakWindowId !== null && typeof value.peakWindowId !== 'string') {
    throw new Error('cost-ledger entry peakWindowId must be a string or null')
  }
  if (!isPlainObject(value.tokens)) throw new Error('cost-ledger entry tokens must be an object')
  const tokens = value.tokens
  return {
    turn,
    step,
    time,
    model: value.model as string | null,
    currency: value.currency,
    peakWindowId: value.peakWindowId as string | null,
    prices: {
      cacheHitPrice: nonNegativePrice(value, 'prices.cacheHitPrice'),
      cacheMissPrice: nonNegativePrice(value, 'prices.cacheMissPrice'),
      outputPrice: nonNegativePrice(value, 'prices.outputPrice'),
    },
    tokens: {
      cacheHitTokens: nonNegativeInteger(tokens.cacheHitTokens, 'tokens.cacheHitTokens'),
      cacheMissTokens: nonNegativeInteger(tokens.cacheMissTokens, 'tokens.cacheMissTokens'),
      outputTokens: nonNegativeInteger(tokens.outputTokens, 'tokens.outputTokens'),
    },
    costs: {
      cacheHitCost: nonNegativePrice(value, 'costs.cacheHitCost'),
      cacheMissCost: nonNegativePrice(value, 'costs.cacheMissCost'),
      outputCost: nonNegativePrice(value, 'costs.outputCost'),
      totalCost: nonNegativePrice(value, 'costs.totalCost'),
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`cost-ledger ${field} must be a finite number`)
  return value
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`cost-ledger ${field} must be a non-negative integer`)
  }
  return value
}

function nonNegativePrice(value: Record<string, unknown>, field: string): number {
  const nested = field.split('.')
  let current: unknown = value
  for (const key of nested) {
    if (!isPlainObject(current)) throw new Error(`cost-ledger ${field} must be a non-negative number`)
    current = current[key]
  }
  const parsed = nonNegativeNumber(current)
  if (parsed === null) throw new Error(`cost-ledger ${field} must be a non-negative number`)
  return parsed
}
