/**
 * dsh-cost-meter host half: the local per-model pricing table (with optional
 * peak-time branches), the per-session cost ledger stored in a DSH
 * storage-domain sidecar, and the same-origin routes the browser half reads.
 *
 * Prices are keyed by model id, with a `default` fallback tier; every value is
 * per 1,000,000 tokens in one billing currency (CNY = ¥ / USD = $). The row's
 * cordis config supplies the `base` layer of the settings namespace
 * (`dsh-cost-meter`); the user's settings document layers over it, so price
 * edits persist in `$DSH_HOME/settings.yaml` and hot-reload.
 *
 * Cost accounting is NOT a live projection: every billed step committed after
 * this plugin version is installed is stored as an immutable entry (tokens,
 * model, peak window, price snapshot, cost) in the `dsh-cost-meter` storage
 * domain, keyed by session. The browser sums those entries; archiving a
 * session deletes its row.
 *
 * The web api-proxy only exposes a hardcoded settings allowlist (product and
 * model-provider namespaces) to the browser, so a third-party namespace is
 * `settings-not-exposed` over `/api/settings`. This host half therefore owns
 * its own same-origin routes (`/dsh-cost-meter/*`) for the browser half,
 * reading and writing through the host `ctx.settings` scope directly.
 *
 * The host half is bundled self-contained (schemastery is inlined).
 *
 * @module dsh-cost-meter
 */
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CostConfig, PriceTier } from './pricing.ts'
import {
  CostLedgerRuntime,
  type StorageDomainLike,
  type WorkspaceRegistryLike,
} from './ledger-runtime.ts'

export { CURRENCY_SYMBOLS } from './pricing.ts'
export type { CostConfig, PeakWindow, PriceTier } from './pricing.ts'

/**
 * Structural faces of the host services this plugin consumes. Declared
 * locally (rather than importing the harness packages) so the host half stays
 * self-contained: the loader resolves them as injected services, not imports.
 */
interface SettingsScopeLike {
  /** Resolved value (schema defaults + base + user layer). */
  get(): CostConfig | undefined
  /** Replace the user layer wholesale (schema-validated before persistence). */
  replace(section: object): Promise<void>
}
interface SettingsProviderLike {
  register(namespace: string, schema: unknown, options?: { base?: unknown }): SettingsScopeLike
}
interface WebServerLike {
  register(route: {
    kind: string
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void
  }): () => void
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    settings: SettingsProviderLike
    webServer: WebServerLike
    storageDomain: StorageDomainLike
    workspaceRegistry?: WorkspaceRegistryLike
  }
}

/** Stable Cordis plugin name. */
export const name = 'dsh-cost-meter'

/** Settings namespace owned by this plugin (host + browser halves agree on it). */
export const SETTINGS_NAMESPACE = 'dsh-cost-meter'

/** Accepted billing currencies (CNY = ¥, USD = $). */
export const CURRENCIES = ['CNY', 'USD'] as const

/** A billing currency accepted by the price table. */
export type Currency = typeof CURRENCIES[number]

/** Local `HH:mm` window time. */
const TIME_SCHEMA = z.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * Shipped default pricing, in CNY per 1M tokens. The `default` tier mirrors
 * `deepseek-v4-pro` (input hit ¥0.025 / input miss ¥3 / output ¥6), and
 * `models` seeds the two current DeepSeek V4 models. No peak branch ships
 * enabled.
 */
export const DEFAULT_COST_CONFIG: CostConfig = {
  currency: 'CNY',
  default: { cacheHitPrice: 0.025, cacheMissPrice: 3, outputPrice: 6, peakWindows: [] },
  models: {
    'deepseek-v4-flash': { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 2, peakWindows: [] },
    'deepseek-v4-pro': { cacheHitPrice: 0.025, cacheMissPrice: 3, outputPrice: 6, peakWindows: [] },
  },
}

/** One optional peak-time branch, editable per model. */
const PeakWindowSchema = z.object({
  id: z.string().pattern(/^[A-Za-z0-9._:-]+$/).required(),
  start: TIME_SCHEMA.required(),
  end: TIME_SCHEMA.required(),
  cacheHitPrice: z.number().min(0).default(0),
  cacheMissPrice: z.number().min(0).default(0),
  outputPrice: z.number().min(0).default(0),
})

/** Per-model price tier schema (each price field defaults to 0 when absent). */
const PriceSchema = z.object({
  cacheHitPrice: z.number().min(0).default(0),
  cacheMissPrice: z.number().min(0).default(0),
  outputPrice: z.number().min(0).default(0),
  peakWindows: z.array(PeakWindowSchema).default([]),
})

/**
 * The price-table schema: the cordis Config (validated for the loader row)
 * and the settings namespace schema (the wire envelope). The whole object
 * resolves {@link DEFAULT_COST_CONFIG} for an absent row config.
 */
export const Config = z.object({
  currency: z.union([...CURRENCIES]).default(DEFAULT_COST_CONFIG.currency)
    .description('Billing currency: CNY (\u00a5) or USD ($).'),
  default: PriceSchema.default(DEFAULT_COST_CONFIG.default),
  models: z.dict(PriceSchema).default(DEFAULT_COST_CONFIG.models),
}).default(DEFAULT_COST_CONFIG)

/** Services required before the routes can mount and the namespace register. */
export const inject = ['webServer', 'settings']

/** Hard cap on the config write body. */
const MAX_BODY_BYTES = 64 * 1024

/** Buffer and parse one JSON request body, capped to avoid unbounded reads. */
async function readJsonBody(req: IncomingMessage, cap: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.byteLength
    if (size > cap) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw === '') return undefined
  return JSON.parse(raw)
}

/** Send a JSON body with the standard content type. */
function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** Return true when a value is a plain object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One-time migration from the earlier flat price table (`currency` plus three
 * top-level prices) to the per-model shape. Folds the legacy prices into the
 * `default` tier and drops the flat keys, preserving the user's values.
 * @param scope - the registered settings scope.
 */
function migrateLegacySection(scope: SettingsScopeLike): void {
  const value = scope.get() as (CostConfig & Partial<PriceTier>) | undefined
  if (value === undefined) return
  const { cacheHitPrice, cacheMissPrice, outputPrice } = value
  if (cacheHitPrice === undefined && cacheMissPrice === undefined && outputPrice === undefined) return
  void scope.replace({
    currency: value.currency,
    default: {
      cacheHitPrice: cacheHitPrice ?? value.default.cacheHitPrice,
      cacheMissPrice: cacheMissPrice ?? value.default.cacheMissPrice,
      outputPrice: outputPrice ?? value.default.outputPrice,
    },
  })
}

/**
 * Register the settings namespace (persistence in settings.yaml), mount the
 * optional storage-domain ledger child, and serve the browser-facing config
 * and ledger routes.
 * @param ctx - host context.
 * @param config - validated cordis row config.
 */
export function apply(ctx: Context, config: CostConfig): void {
  // Only scalar-ish fields ride the base layer. The settings seam deep-merges
  // the base under the user layer, so base-seeded `models` entries could be
  // overridden but never deleted — a user emptying the model list would see
  // every base entry resurrect on the next read. Model seeds therefore live in
  // the schema default (applied only while `models` is absent), and the user
  // layer's `models: {}` really deletes them.
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, Config, {
    base: { currency: config.currency, default: config.default },
  })
  migrateLegacySection(scope)

  // Optional child: the sidecar ledger mounts only where storage-domain is
  // present. The ledger route below reports it unavailable otherwise.
  let ledgerRuntime: CostLedgerRuntime | undefined
  ctx.inject(['storageDomain'], (ledgerCtx) => {
    ledgerCtx.effect(() => {
      const runtime = new CostLedgerRuntime(ledgerCtx, () => scope.get())
      ledgerRuntime = runtime
      runtime.open()
      return () => {
        if (ledgerRuntime === runtime) ledgerRuntime = undefined
        return runtime.dispose()
      }
    }, 'dsh-cost-meter: cost ledger')
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cost-meter',
    handler: (req, res) => {
      const url = req.url ?? ''
      if (req.method === 'GET' && (url === '/dsh-cost-meter/config' || url === '/dsh-cost-meter/config/')) {
        sendJson(res, 200, { ok: true, value: scope.get() })
        return
      }
      if (req.method === 'POST' && (url === '/dsh-cost-meter/config' || url === '/dsh-cost-meter/config/')) {
        void (async () => {
          try {
            const body = await readJsonBody(req, MAX_BODY_BYTES)
            if (!isPlainObject(body)) throw new Error('a JSON object body is required')
            const current = scope.get()
            const requestedCurrency = body.currency
            const nextCurrency: typeof CURRENCIES[number] =
              requestedCurrency === 'CNY' || requestedCurrency === 'USD'
                ? requestedCurrency
                : DEFAULT_COST_CONFIG.currency
            if (current !== undefined
              && nextCurrency !== current.currency
              && ledgerRuntime !== undefined
              && await ledgerRuntime.hasForeignEntries(nextCurrency)) {
              throw new Error(`cannot change currency: existing cost entries were billed in ${current.currency}`)
            }
            await scope.replace(body)
            sendJson(res, 200, { ok: true, value: scope.get() })
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })()
        return
      }
      if (req.method === 'POST' && (url === '/dsh-cost-meter/reset' || url === '/dsh-cost-meter/reset/')) {
        void (async () => {
          try {
            await scope.replace({})
            sendJson(res, 200, { ok: true, value: scope.get() })
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })()
        return
      }

      // GET /dsh-cost-meter/sessions/:sessionId/ledger
      const ledgerMatch = /^\/dsh-cost-meter\/sessions\/([^/]+)\/ledger\/?$/.exec(url)
      if (req.method === 'GET' && ledgerMatch !== null) {
        void (async () => {
          try {
            let sessionId: string
            try {
              sessionId = decodeURIComponent(ledgerMatch[1]!)
            } catch {
              throw new Error('invalid session id encoding')
            }
            if (sessionId === '' || sessionId.includes('/') || sessionId.includes('\\')) {
              throw new Error('invalid session id')
            }
            if (ledgerRuntime === undefined) {
              sendJson(res, 503, { ok: false, error: 'cost ledger is unavailable in this assembly' })
              return
            }
            const result = await ledgerRuntime.read(sessionId)
            if (result.kind === 'unavailable') {
              sendJson(res, 503, { ok: false, error: 'cost ledger is unavailable' })
            } else if (result.kind === 'archived') {
              sendJson(res, 200, { ok: true, sessionId, archived: true, value: null })
            } else {
              sendJson(res, 200, { ok: true, sessionId, value: result.snapshot })
            }
          } catch (error) {
            sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })()
        return
      }

      res.writeHead(404)
      res.end()
    },
  }), 'dsh-cost-meter: config routes')
}
