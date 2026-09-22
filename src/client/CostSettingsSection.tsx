/**
 * Settings page editing the per-model price table: currency, a `default`
 * fallback tier, and a list of per-model tiers. Each model tier can enable
 * any number of daily peak-time windows; every window carries its own three
 * prices. Renders as one Settings section (`settings.section`); reads/writes
 * through this plugin's host routes via the injected save/reset face.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_PEAK_DAYS, normalizeDays, type CostConfig, type PeakWindow, type PriceTier, type PriceValues } from './pricing.ts'
import { draftDays, EVERY_DAY, toggleDay, WEEKDAY_LABELS } from './days.ts'
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

/** One editable peak window (uid keeps the React key stable). */
type PeakWindowDraft = Omit<PeakWindow, 'days'> & { uid: number; days: number[] }

/** One editable per-model row (uid keeps the React key stable across renames). */
interface ModelDraft {
  uid: number
  name: string
  tier: PriceTier
  peakEnabled: boolean
  peakWindows: PeakWindowDraft[]
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

/** Strip the branch metadata and copy the three base prices. */
function basePrices(tier: PriceTier): PriceTier {
  return {
    cacheHitPrice: tier.cacheHitPrice,
    cacheMissPrice: tier.cacheMissPrice,
    outputPrice: tier.outputPrice,
    peakWindows: [],
  }
}

/** Convert the persisted record to the editable array draft. */
function toDraft(config: CostConfig): CostConfigDraft {
  return {
    currency: config.currency,
    default: { ...config.default },
    models: Object.entries(config.models).map(([name, tier]) => ({
      uid: nextUid++,
      name,
      tier: basePrices(tier),
      peakEnabled: tier.peakWindows.length > 0,
      peakWindows: tier.peakWindows.map(window => ({
        ...window,
        days: draftDays(window),
        uid: nextUid++,
      })),
    })),
  }
}

/** Convert the editable array draft back to the persisted record. */
function fromDraft(draft: CostConfigDraft): CostConfig {
  const models: Record<string, PriceTier> = {}
  for (const model of draft.models) {
    const name = model.name.trim()
    if (name === '') continue
    models[name] = {
      ...model.tier,
      ...model.peakEnabled && model.peakWindows.length > 0
        ? { peakWindows: model.peakWindows.map(({ uid: _uid, ...window }) => window) }
        : {},
    }
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

/** One local `HH:mm` time input. */
function TimeField(props: { value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const { value, disabled, onChange } = props
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])
  return (
    <input
      className={css.timeInput}
      type="time"
      disabled={disabled}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text) && text !== value) onChange(text)
        else setText(value)
      }}
      onChange={(e) => { setText(e.target.value) }}
    />
  )
}

/** The three price cells shared by base and peak tiers. */
function PriceCells(props: {
  tier: PriceValues
  disabled: boolean
  t: CostSettingsSectionProps['t']
  onChange: (field: PriceField, value: number) => void
}) {
  const { tier, disabled, t, onChange } = props
  return (
    <>
      {PRICE_FIELDS.map(({ field, labelKey }) => (
        <label className={css.priceCell} key={field}>
          <span className={css.priceLabel}>{t(labelKey)}</span>
          <NumberField value={tier[field]} disabled={disabled} onChange={(v) => onChange(field, v)} />
        </label>
      ))}
    </>
  )
}

/** The weekday multi-select of one peak window (any subset of Monday–Sunday). */
function DayPicker(props: {
  days: number[]
  disabled: boolean
  t: CostSettingsSectionProps['t']
  onChange: (days: number[]) => void
}) {
  const { days, disabled, t, onChange } = props
  const selected = new Set(normalizeDays(days))
  return (
    <div className={css.dayRow}>
      <span className={css.priceLabel}>{t('models.peakDays')}</span>
      <div className={css.dayButtons}>
        {WEEKDAY_LABELS.map(({ day, key }) => (
          <button
            key={day}
            type="button"
            className={selected.has(day) ? css.dayButtonActive : css.dayButton}
            aria-pressed={selected.has(day)}
            disabled={disabled}
            onClick={() => onChange(toggleDay(days, day))}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={css.dayPreset}
        disabled={disabled}
        onClick={() => onChange([...DEFAULT_PEAK_DAYS])}
      >
        {t('models.peakDaysWorkweek')}
      </button>
      <button
        type="button"
        className={css.dayPreset}
        disabled={disabled}
        onClick={() => onChange([...EVERY_DAY])}
      >
        {t('models.peakDaysEveryDay')}
      </button>
      {selected.size === 0 && <span className={css.dayWarning}>{t('models.peakDaysNone')}</span>}
    </div>
  )
}

/** One editable peak window row. */
function PeakWindowRow(props: {
  window: PeakWindowDraft
  disabled: boolean
  t: CostSettingsSectionProps['t']
  onChange: (uid: number, mutate: (w: PeakWindowDraft) => void) => void
  onRemove: (uid: number) => void
}) {
  const { window, disabled, t, onChange, onRemove } = props
  return (
    <div className={css.peakWindowRow}>
      <div className={css.timeRow}>
        <label className={css.timeCell}>
          <span className={css.priceLabel}>{t('models.peakStart')}</span>
          <TimeField
            value={window.start}
            disabled={disabled}
            onChange={(v) => onChange(window.uid, (w) => { w.start = v })}
          />
        </label>
        <label className={css.timeCell}>
          <span className={css.priceLabel}>{t('models.peakEnd')}</span>
          <TimeField
            value={window.end}
            disabled={disabled}
            onChange={(v) => onChange(window.uid, (w) => { w.end = v })}
          />
        </label>
        <button type="button" className={css.removeButton} disabled={disabled} onClick={() => onRemove(window.uid)}>
          {t('models.peakRemove')}
        </button>
      </div>
      <DayPicker
        days={window.days}
        disabled={disabled}
        t={t}
        onChange={(days) => onChange(window.uid, (w) => { w.days = days })}
      />
      <div className={css.priceRow}>
        <span className={css.priceGroupLabel}>{t('models.peakPrices')}</span>
        <PriceCells
          tier={window}
          disabled={disabled}
          t={t}
          onChange={(field, value) => onChange(window.uid, (w) => { w[field] = value })}
        />
      </div>
    </div>
  )
}

/** One editable per-model tier row plus its peak branch. */
function ModelRow(props: {
  model: ModelDraft
  disabled: boolean
  t: CostSettingsSectionProps['t']
  onChangeName: (name: string) => void
  onChangePrice: (field: PriceField, value: number) => void
  onTogglePeak: (enabled: boolean) => void
  onChangeWindow: (uid: number, mutate: (w: PeakWindowDraft) => void) => void
  onAddWindow: () => void
  onRemoveWindow: (uid: number) => void
  onRemove: () => void
}) {
  const {
    model, disabled, t, onChangeName, onChangePrice, onTogglePeak,
    onChangeWindow, onAddWindow, onRemoveWindow, onRemove,
  } = props
  return (
    <div className={css.modelBlock}>
      <div className={css.modelRow}>
        <input
          className={css.nameInput}
          type="text"
          value={model.name}
          placeholder={t('models.namePlaceholder')}
          disabled={disabled}
          onChange={(e) => onChangeName(e.target.value)}
        />
        <span className={css.priceGroupLabel}>{t('models.basePrices')}</span>
        <PriceCells tier={model.tier} disabled={disabled} t={t} onChange={onChangePrice} />
        <button type="button" className={css.removeButton} disabled={disabled} onClick={onRemove}>
          {t('models.remove')}
        </button>
      </div>

      <label className={css.toggleRow}>
        <input
          type="checkbox"
          checked={model.peakEnabled}
          disabled={disabled}
          onChange={(e) => onTogglePeak(e.target.checked)}
        />
        <span>{t('models.peakToggle')}</span>
      </label>

      {model.peakEnabled && (
        <div className={css.peakBlock}>
          <div className={css.blockHint}>{t('models.peakHint')}</div>
          {model.peakWindows.map(window => (
            <PeakWindowRow
              key={window.uid}
              window={window}
              disabled={disabled}
              t={t}
              onChange={onChangeWindow}
              onRemove={onRemoveWindow}
            />
          ))}
          <button type="button" className={css.addButton} disabled={disabled} onClick={onAddWindow}>
            {t('models.peakAdd')}
          </button>
        </div>
      )}
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
        models: d.models.map(m => ({
          ...m,
          tier: { ...m.tier },
          peakWindows: m.peakWindows.map(w => ({ ...w })),
        })),
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
          <PriceCells
            tier={draft.default}
            disabled={disabled}
            t={t}
            onChange={(field, value) => setDraftField((d) => { d.default[field] = value })}
          />
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
              const row = d.models.find(m => m.uid === model.uid)
              if (row !== undefined) row.name = name
            })}
            onChangePrice={(field, value) => setDraftField((d) => {
              const row = d.models.find(m => m.uid === model.uid)
              if (row !== undefined) row.tier[field] = value
            })}
            onTogglePeak={(enabled) => setDraftField((d) => {
              const row = d.models.find(m => m.uid === model.uid)
              if (row !== undefined) row.peakEnabled = enabled
            })}
            onChangeWindow={(uid, mutate) => setDraftField((d) => {
              const row = d.models.find(m => m.uid === model.uid)
              const window = row?.peakWindows.find(w => w.uid === uid)
              if (window !== undefined) mutate(window)
            })}
            onAddWindow={() => setDraftField((d) => {
              const row = d.models.find(m => m.uid === model.uid)
              if (row === undefined) return
              row.peakEnabled = true
              const uid = nextUid++
              row.peakWindows.push({
                uid,
                id: `peak-${uid}`,
                start: '09:00',
                end: '21:00',
                days: [...DEFAULT_PEAK_DAYS],
                cacheHitPrice: row.tier.cacheHitPrice,
                cacheMissPrice: row.tier.cacheMissPrice,
                outputPrice: row.tier.outputPrice,
              })
            })}
            onRemoveWindow={(uid) => setDraftField((d) => {
              const row = d.models.find(m => m.uid === model.uid)
              if (row !== undefined) row.peakWindows = row.peakWindows.filter(w => w.uid !== uid)
            })}
            onRemove={() => setDraftField((d) => {
              d.models = d.models.filter(m => m.uid !== model.uid)
            })}
          />
        ))}
        <button
          type="button"
          className={css.addButton}
          disabled={disabled}
          onClick={() => setDraftField((d) => {
            d.models.push({
              uid: nextUid++,
              name: '',
              tier: basePrices(d.default),
              peakEnabled: false,
              peakWindows: [],
            })
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
