/**
 * dsh-cost-meter browser half:
 *
 * - `CostDock` — one entry in `conversation.composer.dock` (order 1, right
 *   after the shipped stats line at order 0) that appends the session's
 *   estimated cost, computed from the `tokenUsage` projection and the price
 *   tier for the session's current model (per-model, with a `default`
 *   fallback);
 * - `CostSettingsSection` — one Settings page (`settings.section`) editing the
 *   currency, the fallback tier, and the per-model price tiers.
 *
 * The price table is read/written over this plugin's own same-origin routes
 * (`/dsh-cost-meter/*`), because the api-proxy settings allowlist does not
 * expose third-party settings namespaces to the browser.
 */
import { useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CostDock } from './CostDock.tsx'
import { CostSettingsSection } from './CostSettingsSection.tsx'
import { en, zh, type CostKey } from './locales.ts'
import type { CostConfig } from './pricing.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by this plugin (dock readout + settings section). */
    'dsh-cost-meter': CostKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-cost-meter'

/** Services required before the dock entry and settings section can register. */
export const inject = ['slots', 'locale']

/** Structural view of the optional `modelDirectories` service (ui-model-selection). */
interface ModelDirectoryStoreLike {
  getSnapshot(): { current: { model?: string } | null } | null
  subscribe(fn: () => void): () => void
}
interface ModelDirectoriesLike {
  directoryFor(sessionId: string): { store: ModelDirectoryStoreLike } | undefined
}

/** No-op subscription for the model-less fallback path. */
const noopSubscribe = () => () => {}

/**
 * Register the dictionaries, the composer-dock cost readout, and the
 * Settings price-table section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-cost-meter: dictionaries')
  const t = ctx.locale.bind(NS)

  // Shared client cache of the host's resolved price table. It starts null and
  // fills once the GET settles; save/reset write the returned value back.
  const store = createSnapshotStore<CostConfig | null>(null)
  const getSnapshot = () => store.getSnapshot()
  const useConfig = () => useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)

  const load = (): void => {
    void fetch('/dsh-cost-meter/config')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json()
      })
      .then((body: unknown) => {
        const value = (body as { value?: CostConfig }).value
        if (value !== undefined) store.set(value)
      })
      .catch(() => { /* host without the endpoint; the dock hides itself */ })
  }
  load()

  const save = async (config: CostConfig): Promise<CostConfig> => {
    const response = await fetch('/dsh-cost-meter/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    })
    const body = (await response.json()) as { ok?: boolean; value?: CostConfig; error?: string }
    if (!response.ok || body.ok !== true || body.value === undefined) {
      throw new Error(body.error ?? `HTTP ${response.status}`)
    }
    store.set(body.value)
    return body.value
  }

  const reset = async (): Promise<CostConfig> => {
    const response = await fetch('/dsh-cost-meter/reset', { method: 'POST' })
    const body = (await response.json()) as { ok?: boolean; value?: CostConfig; error?: string }
    if (!response.ok || body.ok !== true || body.value === undefined) {
      throw new Error(body.error ?? `HTTP ${response.status}`)
    }
    store.set(body.value)
    return body.value
  }

  // Appended right after the shipped stats line (order 0) in the same band
  // under the composer card. The inject factory resolves the session's current
  // model through the optional model-directory service once per session.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'cost',
    order: 1,
    locale: NS,
    inject: (sessionId: string) => {
      const directories = ctx.get('modelDirectories') as ModelDirectoriesLike | undefined
      let directoryStore: ModelDirectoryStoreLike | undefined
      if (directories !== undefined) {
        try {
          directoryStore = directories.directoryFor(sessionId)?.store
        } catch { /* unknown session: fall back to the default tier */ }
      }
      return {
        useConfig,
        useModel: () => useSyncExternalStore(
          directoryStore !== undefined ? directoryStore.subscribe : noopSubscribe,
          () => directoryStore?.getSnapshot()?.current?.model ?? null,
          () => null,
        ),
      }
    },
  }, CostDock))

  // The Settings page editing the price table (order 22, grouped with the
  // other plugin settings sections).
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-cost-meter',
    order: 22,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ useConfig, save, reset, reload: load }),
  }, CostSettingsSection))
}
