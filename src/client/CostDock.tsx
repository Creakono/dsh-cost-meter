/**
 * Cost readout appended to the chat stats line: one entry in
 * `conversation.composer.dock` right after the shipped stats entry (order 0).
 *
 * The figure is the sum of the session's durable per-step ledger entries
 * (immutable price snapshots), not a live re-estimate. It also warns while
 * the current model is inside one of its configured peak windows.
 */
import { useEffect, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  billedInputTokens,
  CURRENCY_SYMBOLS,
  currentPeakWindow,
  formatCost,
  formatTokens,
  type CostConfig,
  type TokenUsageBucket,
} from './pricing.ts'
import type { SessionLedgerSnapshot } from '../ledger.ts'
import css from './CostDock.module.css'

/** Component props: the dock runtime share, the pricing/model hooks, and the locale seat. */
export type CostDockProps =
  PropsRuntime<'conversation.composer.dock'> &
  PropsLocale<'dsh-cost-meter'> &
  {
    sessionId: string
    useConfig: () => CostConfig | null
    useModel: () => string | null
  }

/** Ledger fetch state: null until the first route response lands. */
interface LedgerRead {
  snapshot: SessionLedgerSnapshot | null
  failed: boolean
}

/**
 * Read the session's durable cost ledger, refetching whenever the usage
 * projection advances (a step just billed) and every 30 seconds (archive
 * reconciliation and peak-time refreshes).
 */
function useSessionLedger(sessionId: string, usage: TokenUsageBucket | undefined): LedgerRead {
  const [state, setState] = useState<LedgerRead>({ snapshot: null, failed: false })
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void fetch(`/dsh-cost-meter/sessions/${encodeURIComponent(sessionId)}/ledger`)
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status))
          return response.json()
        })
        .then((body: unknown) => {
          if (cancelled) return
          const payload = body as { ok?: boolean; archived?: boolean; value?: SessionLedgerSnapshot | null }
          setState({
            snapshot: payload.ok === true && payload.archived !== true ? payload.value ?? null : null,
            failed: payload.ok !== true,
          })
        })
        .catch(() => {
          if (!cancelled) setState(current => ({ ...current, failed: true }))
        })
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, usage])
  return state
}

/** Local `HH:mm` window label. */
function formatWindow(start: string, end: string): string {
  return `${start}\u2013${end}`
}

/**
 * Render the ledger total after the stats line. Renders nothing until the
 * provider has reported usage, the price table and ledger have loaded, and at
 * least one step has a durable entry. The hover tooltip carries the priced
 * model, the active peak window, the billed step count, and the per-bucket
 * breakdown.
 * @param props - composed slot props.
 * @returns the cost line element tree, or null while there is nothing to show.
 */
export function CostDock({ sessionId, useProjection, useConfig, useModel, t }: CostDockProps) {
  const usage = useProjection('tokenUsage')
  const config = useConfig()
  const model = useModel()
  const ledger = useSessionLedger(sessionId, usage)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => { clearInterval(timer) }
  }, [])

  if (usage === undefined) return null
  if (config === null) return null
  if (billedInputTokens(usage) === 0 && usage.outputTokens === 0) return null
  const snapshot = ledger.snapshot
  if (snapshot === null || snapshot.entries.length === 0) return null

  const peak = currentPeakWindow(config, model, now)
  const symbol = CURRENCY_SYMBOLS[config.currency]
  const modelLine = model !== null
    ? `${t('dock.model')} ${model}`
    : t('dock.fallback')
  const detail = [
    modelLine,
    `${t('dock.entries')} ${snapshot.entries.length}`,
    ...peak !== null
      ? [`${t('dock.peakWindow')} ${formatWindow(peak.start, peak.end)} \u00b7 ${t('dock.peakActive')}`]
      : [],
    `${t('dock.cacheHit')} ${formatTokens(snapshot.tokens.cacheHitTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheHitCost)}`,
    `${t('dock.cacheMiss')} ${formatTokens(snapshot.tokens.cacheMissTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheMissCost)}`,
    `${t('dock.output')} ${formatTokens(snapshot.tokens.outputTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.outputCost)}`,
  ].join(' \u00b7 ')

  return (
    <Tooltip label={detail} side="top" delayMs={500}>
      <div className={css.root}>
        <span>{t('dock.estimate')}</span>
        <span className={css.value}>~{symbol}{formatCost(snapshot.costs.totalCost)}</span>
        {peak !== null && <span className={css.peak}>{t('dock.peak')}</span>}
      </div>
    </Tooltip>
  )
}
