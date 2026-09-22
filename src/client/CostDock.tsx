/**
 * Cost readout appended to the chat stats line: one entry in
 * `conversation.composer.dock` right after the shipped stats pills (order 0).
 *
 * The reading is a pill button. Clicking it opens a detail panel portaled to
 * `document.body` and clamped above the pill — the same interaction, primitives
 * (`useAnchoredPosition` + `useDismissOnOutsidePointer`) and surface skin as the
 * shipped session-stats / token-usage pills. A second click, an outside
 * pointerdown, or Escape closes it.
 *
 * The figure is the sum of the session's durable per-step ledger entries
 * (immutable price snapshots), not a live re-estimate. The panel also reports
 * whether the current model is inside one of its configured peak windows.
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconDataOutline16,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties } from 'react'
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
import { formatDays } from './days.ts'
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

/** Gap kept between the pill and its panel (the shipped stat dialogs' value). */
const PANEL_GAP = 8

/** Viewport margin the panel's placement clamp keeps (the shipped value). */
const PANEL_MARGIN = 12

/**
 * Layout for the unplaced portal panel: hidden but laid out, so the placement
 * hook's first pass measures real dimensions before anything paints.
 */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

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
 * least one step has a durable entry. The click-opened panel carries the priced
 * model, the active peak window with its weekdays, the billed step count, and
 * the per-bucket breakdown.
 * @param props - composed slot props.
 * @returns the cost pill and its detail panel, or null while there is nothing to show.
 */
export function CostDock({ sessionId, useProjection, useConfig, useModel, t }: CostDockProps) {
  const usage = useProjection('tokenUsage')
  const config = useConfig()
  const model = useModel()
  const ledger = useSessionLedger(sessionId, usage)
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => { clearInterval(timer) }
  }, [])

  // Placement and dismissal mirror the shipped stat pills: viewport-clamped
  // above the trigger, closed by an outside pointerdown or Escape.
  const pos = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  const snapshot = ledger.snapshot
  const show = usage !== undefined
    && config !== null
    && (billedInputTokens(usage) !== 0 || usage.outputTokens !== 0)
    && snapshot !== null
    && snapshot.entries.length > 0

  // A reading that disappears (archived session, or a ledger that turned
  // unavailable) must not leave an orphaned open panel behind.
  useEffect(() => {
    if (!show && open) setOpen(false)
  }, [show, open])

  if (!show) return null

  const peak = currentPeakWindow(config, model, now)
  const symbol = CURRENCY_SYMBOLS[config.currency]
  const total = `~${symbol}${formatCost(snapshot.costs.totalCost)}`
  const modelLine = model !== null ? model : t('dock.fallback')
  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'model', label: t('dock.model'), value: modelLine },
    { key: 'entries', label: t('dock.entries'), value: String(snapshot.entries.length) },
  ]
  if (peak !== null) {
    rows.push({
      key: 'window',
      label: t('dock.peakWindow'),
      value: `${formatWindow(peak.start, peak.end)} \u00b7 ${t('dock.peakActive')}`,
    })
    rows.push({ key: 'days', label: t('dock.peakDays'), value: formatDays(peak.days, t) })
  }
  rows.push({
    key: 'hit',
    label: t('dock.cacheHit'),
    value: `${formatTokens(snapshot.tokens.cacheHitTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheHitCost)}`,
  })
  rows.push({
    key: 'miss',
    label: t('dock.cacheMiss'),
    value: `${formatTokens(snapshot.tokens.cacheMissTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.cacheMissCost)}`,
  })
  rows.push({
    key: 'output',
    label: t('dock.output'),
    value: `${formatTokens(snapshot.tokens.outputTokens)} \u00b7 ${symbol}${formatCost(snapshot.costs.outputCost)}`,
  })
  const ariaLabel = peak === null
    ? `${t('dock.estimate')} ${total}`
    : `${t('dock.estimate')} ${total} \u00b7 ${t('dock.peak')} ${formatWindow(peak.start, peak.end)}`

  return (
    <div className={css.root}>
      <span ref={rootRef} className={css.anchor}>
        <button
          type="button"
          className={css.pill}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => { setOpen(!open) }}
        >
          <IconDataOutline16 />
          <span className={css.label}>
            {t('dock.estimate')}
            <span className={css.sep} aria-hidden>{'\u00b7'}</span>
            <span className={css.value}>{total}</span>
          </span>
          {peak !== null && <span className={css.peak}>{t('dock.peak')}</span>}
        </button>
        {open && createPortal(
          <div
            ref={panelRef}
            className={css.panel}
            role="dialog"
            aria-label={t('dock.title')}
            style={pos ?? MEASURE_STYLE}
          >
            <div className={css.title}>
              <span className={css.titleLabel}>
                <IconDataOutline16 />
                {t('dock.title')}
              </span>
              <span className={css.titleValue}>{total}</span>
            </div>
            <div className={css.titleRule} aria-hidden />
            <dl className={css.details}>
              {rows.map(row => (
                <Fragment key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          </div>,
          document.body,
        )}
      </span>
    </div>
  )
}
