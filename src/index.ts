/**
 * dsh-cost-meter host half: the local per-model pricing table behind the
 * estimated-cost readout appended to the chat stats line.
 *
 * Prices are keyed by model id, with a `default` fallback tier; every value is
 * per 1,000,000 tokens in one billing currency (CNY = ¥ / USD = $). The row's
 * cordis config supplies the `base` layer of the settings namespace
 * (`dsh-cost-meter`); the user's settings document layers over it, so price
 * edits persist in `$DSH_HOME/settings.yaml` and hot-reload.
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

/**
 * Structural faces of the two host services this plugin consumes. Declared
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

/** Currency display symbols used by the browser half. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '\u00a5',
  USD: '$',
}

/** One price tier: every price is per 1,000,000 tokens, in the table currency. */
export interface PriceTier {
  /** Input cache-hit price per 1M tokens. */
  cacheHitPrice: number
  /** Input cache-miss price per 1M tokens (cache writes bill at this rate too). */
  cacheMissPrice: number
  /** Output price per 1M tokens. */
  outputPrice: number
}

/** Local price table: a fallback tier plus per-model overrides. */
export interface CostConfig {
  /** Billing currency (CNY = ¥, USD = $). */
  currency: Currency
  /** Fallback tier for models absent from `models`. */
  default: PriceTier
  /** Per-model tiers keyed by provider-owned model id. */
  models: Record<string, PriceTier>
}

/**
 * Shipped default pricing, in CNY per 1M tokens. The `default` tier mirrors
 * `deepseek-v4-pro` (input hit ¥0.025 / input miss ¥3 / output ¥6), and
 * `models` seeds the two current DeepSeek V4 models.
 */
export const DEFAULT_COST_CONFIG: CostConfig = {
  currency: 'CNY',
  default: { cacheHitPrice: 0.025, cacheMissPrice: 3, outputPrice: 6 },
  models: {
    'deepseek-v4-flash': { cacheHitPrice: 0.02, cacheMissPrice: 1, outputPrice: 2 },
    'deepseek-v4-pro': { cacheHitPrice: 0.025, cacheMissPrice: 3, outputPrice: 6 },
  },
}

/** Per-model price tier schema (each field defaults to 0 when absent). */
const PriceSchema = z.object({
  cacheHitPrice: z.number().min(0).default(0),
  cacheMissPrice: z.number().min(0).default(0),
  outputPrice: z.number().min(0).default(0),
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
 * Register the settings namespace (persistence in settings.yaml) and the
 * browser-facing config routes. `scope.replace` validates the incoming section
 * against {@link Config}, so a malformed write is refused before persistence.
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
      res.writeHead(404)
      res.end()
    },
  }), 'dsh-cost-meter: config routes')
}
