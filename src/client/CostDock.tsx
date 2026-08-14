/**
 * Cost readout appended to the chat stats line: one entry in
 * `conversation.composer.dock` right after the shipped stats entry (order 0),
 * fed by the durable `tokenUsage` projection, the session's current model, and
 * the per-model price table.
 */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  billedInputTokens,
  CURRENCY_SYMBOLS,
  estimateCost,
  formatCost,
  formatTokens,
  resolveTier,
  type CostConfig,
} from './pricing.ts'
import css from './CostDock.module.css'

/** Component props: the dock runtime share, the pricing/model hooks, and the locale seat. */
export type CostDockProps =
  PropsRuntime<'conversation.composer.dock'> &
  PropsLocale<'dsh-cost-meter'> &
  {
    useConfig: () => CostConfig | null
    useModel: () => string | null
  }

/**
 * Render the estimated cost after the stats line. Renders nothing until the
 * provider has reported usage (the stats line gates its token groups the same
 * way) and the price table has loaded; the hover tooltip carries the priced
 * model and the per-bucket breakdown.
 * @param props - composed slot props.
 * @returns the cost line element tree, or null while there is nothing to show.
 */
export function CostDock({ useProjection, useConfig, useModel, t }: CostDockProps) {
  const usage = useProjection('tokenUsage')
  const config = useConfig()
  const model = useModel()
  if (usage === undefined) return null
  if (config === null) return null
  if (billedInputTokens(usage) === 0 && usage.outputTokens === 0) return null
  const tier = resolveTier(config, model)
  const breakdown = estimateCost(usage, tier)
  const symbol = CURRENCY_SYMBOLS[config.currency]
  const modelLine = model !== null
    ? `${t('dock.model')} ${model}`
    : t('dock.fallback')
  const detail = [
    modelLine,
    `${t('dock.cacheHit')} ${formatTokens(breakdown.cacheHitTokens)} \u00b7 ${symbol}${formatCost(breakdown.cacheHitCost)}`,
    `${t('dock.cacheMiss')} ${formatTokens(breakdown.cacheMissTokens)} \u00b7 ${symbol}${formatCost(breakdown.cacheMissCost)}`,
    `${t('dock.output')} ${formatTokens(breakdown.outputTokens)} \u00b7 ${symbol}${formatCost(breakdown.outputCost)}`,
  ].join(' \u00b7 ')
  return (
    <Tooltip label={detail} side="top" delayMs={500}>
      <div className={css.root}>
        <span>{t('dock.estimate')}</span>
        <span className={css.value}>~{symbol}{formatCost(breakdown.totalCost)}</span>
      </div>
    </Tooltip>
  )
}
