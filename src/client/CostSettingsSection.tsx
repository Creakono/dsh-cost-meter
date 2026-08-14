/**
 * Settings page editing the per-model price table: currency, a `default`
 * fallback tier, and a list of per-model tiers. Renders as one Settings
 * section (`settings.section`); reads/writes through this plugin's host
 * routes via the injected save/reset face.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CostConfig, PriceTier } from './pricing.ts'
import css from './CostSettingsSection.module.css'

/** Component props: the section runtime share, the pricing face, and the locale seat. */
export type CostSettingsSectionProps =
  PropsRuntime<'settings.section'> &
  PropsLocale<'dsh-cost-meter'> &
  {
    useConfig: () => CostConfig | null
    save: (config: CostConfig) => Promise<CostConfig>
    reset: () => Promise<CostConfig>
  }

/** Price fields rendered as number inputs, in display order. */
const PRICE_FIELDS = [
  { field: 'cacheHitPrice', labelKey: 'prices.cacheHit' },
  { field: 'cacheMissPrice', labelKey: 'prices.cacheMiss' },
  { field: 'outputPrice', labelKey: 'prices.output' },
] as const
type PriceField = typeof PRICE_FIELDS[number]['field']

/** One editable per-model row (uid keeps the React key stable across renames). */
interface ModelDraft {
  uid: number
  name: string
  tier: PriceTier
}

/** The editable draft: models as a stable array instead of a record. */
interface CostConfigDraft {
  currency: 'CNY' | 'USD'
  default: PriceTier
  models: ModelDraft[]
}

/** Save/status progression shown beside the action buttons. */
type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'error'; message: string }

let nextUid = 1

/** Convert the persisted record to the editable array draft. */
function toDraft(config: CostConfig): CostConfigDraft {
  return {
    currency: config.currency,
    default: { ...config.default },
    models: Object.entries(config.models).map(([name, tier]) => ({
      uid: nextUid++,
      name,
      tier: { ...tier },
    })),
  }
}

/** Convert the editable array draft back to the persisted record. */
function fromDraft(draft: CostConfigDraft): CostConfig {
  const models: Record<string, PriceTier> = {}
  for (const model of draft.models) {
    const name = model.name.trim()
    if (name !== '') models[name] = model.tier
  }
  return {
    currency: draft.currency,
    default: draft.default,
    models,
  }
}

/** One numeric price input with a local text draft so typing decimals stays smooth. */
function NumberField(props: { value: number; disabled?: boolean; onChange: (v: number) => void }) {
  const { value, disabled, onChange } = props
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <input
      className={css.input}
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        const parsed = Number(text)
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) onChange(parsed)
      }}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value.trim() === '') return
        const parsed = Number(e.target.value)
        if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed)
      }}
    />
  )
}

/** One editable per-model tier row. */
function ModelRow(props: {
  model: ModelDraft
  disabled: boolean
  t: CostSettingsSectionProps['t']
  onChangeName: (name: string) => void
  onChangePrice: (field: PriceField, value: number) => void
  onRemove: () => void
}) {
  const { model, disabled, t, onChangeName, onChangePrice, onRemove } = props
  return (
    <div className={css.modelRow}>
      <input
        className={css.nameInput}
        type="text"
        value={model.name}
        placeholder={t('models.namePlaceholder')}
        disabled={disabled}
        onChange={(e) => onChangeName(e.target.value)}
      />
      {PRICE_FIELDS.map(({ field, labelKey }) => (
        <label className={css.priceCell} key={field}>
          <span className={css.priceLabel}>{t(labelKey)}</span>
          <NumberField
            value={model.tier[field]}
            disabled={disabled}
            onChange={(v) => onChangePrice(field, v)}
          />
        </label>
      ))}
      <button type="button" className={css.removeButton} disabled={disabled} onClick={onRemove}>
        {t('models.remove')}
      </button>
    </div>
  )
}

/**
 * Render the price-table section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function CostSettingsSection({ t, useConfig, save, reset }: CostSettingsSectionProps) {
  const config = useConfig()
  const [draft, setDraft] = useState<CostConfigDraft | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' })

  // Adopt the store value once it first arrives (and never clobber edits).
  useEffect(() => {
    if (config !== null) setDraft((current) => current ?? toDraft(config))
  }, [config])

  const disabled = draft === null
  const setDraftField = (mutate: (d: CostConfigDraft) => void) => {
    setDraft((d) => {
      if (d === null) return d
      const next: CostConfigDraft = {
        currency: d.currency,
        default: { ...d.default },
        models: d.models.map((m) => ({ ...m, tier: { ...m.tier } })),
      }
      mutate(next)
      return next
    })
  }

  const onSave = () => {
    if (draft === null) return
    setSaveState({ phase: 'saving' })
    void save(fromDraft(draft))
      .then((value) => {
        setDraft(toDraft(value))
        setSaveState({ phase: 'saved' })
      })
      .catch((error: unknown) => setSaveState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      }))
  }

  const onReset = () => {
    if (!window.confirm(t('actions.resetConfirm'))) return
    setSaveState({ phase: 'saving' })
    void reset()
      .then((value) => {
        setDraft(toDraft(value))
        setSaveState({ phase: 'saved' })
      })
      .catch((error: unknown) => setSaveState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      }))
  }

  if (draft === null) {
    return (
      <div className={css.group}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.hint}>{config === null ? t('loading') : t('loadFailed')}</div>
      </div>
    )
  }

  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      <div className={css.hint}>{t('hint')}</div>

      <div className={css.currencyRow}>
        <span className={css.fieldLabel}>{t('currency')}</span>
        <select
          className={css.select}
          value={draft.currency}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value
            if (next === 'CNY' || next === 'USD') setDraftField((d) => { d.currency = next })
          }}
        >
          <option value="CNY">{t('currency.cny')}</option>
          <option value="USD">{t('currency.usd')}</option>
        </select>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('default.title')}</div>
        <div className={css.blockHint}>{t('default.hint')}</div>
        <div className={css.tierRow}>
          {PRICE_FIELDS.map(({ field, labelKey }) => (
            <label className={css.priceCell} key={field}>
              <span className={css.priceLabel}>{t(labelKey)}</span>
              <NumberField
                value={draft.default[field]}
                disabled={disabled}
                onChange={(v) => setDraftField((d) => { d.default[field] = v })}
              />
            </label>
          ))}
          <span className={css.unit}>{t('prices.unit')}</span>
        </div>
      </div>

      <div className={css.block}>
        <div className={css.blockTitle}>{t('models.title')}</div>
        {draft.models.length === 0 && <div className={css.blockHint}>{t('models.empty')}</div>}
        {draft.models.map((model) => (
          <ModelRow
            key={model.uid}
            model={model}
            disabled={disabled}
            t={t}
            onChangeName={(name) => setDraftField((d) => {
              const row = d.models.find((m) => m.uid === model.uid)
              if (row !== undefined) row.name = name
            })}
            onChangePrice={(field, value) => setDraftField((d) => {
              const row = d.models.find((m) => m.uid === model.uid)
              if (row !== undefined) row.tier[field] = value
            })}
            onRemove={() => setDraftField((d) => {
              d.models = d.models.filter((m) => m.uid !== model.uid)
            })}
          />
        ))}
        <button
          type="button"
          className={css.addButton}
          disabled={disabled}
          onClick={() => setDraftField((d) => {
            d.models.push({ uid: nextUid++, name: '', tier: { ...d.default } })
          })}
        >
          {t('models.add')}
        </button>
      </div>

      <div className={css.actions}>
        <button type="button" className={css.button} disabled={disabled || saveState.phase === 'saving'} onClick={onSave}>
          {saveState.phase === 'saving' ? t('actions.saving') : t('actions.save')}
        </button>
        <button type="button" className={css.button} disabled={disabled || saveState.phase === 'saving'} onClick={onReset}>
          {t('actions.reset')}
        </button>
        {saveState.phase === 'saved' && <span className={css.statusOk} role="status">{t('actions.saved')}</span>}
        {saveState.phase === 'error' && (
          <span className={css.statusError} role="alert">{t('actions.saveFailed')}: {saveState.message}</span>
        )}
      </div>
    </div>
  )
}
