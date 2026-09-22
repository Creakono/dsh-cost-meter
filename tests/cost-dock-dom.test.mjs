/**
 * The cost reading must behave like the shipped session-stats / token-usage
 * pills: a click-opened panel, not a hover tooltip.
 *
 * The shipped bundle is materialized in a jsdom page and driven through the
 * plugin's real `apply` (its own store, inject hooks, dictionaries and
 * components); only the harness-owned ui-primitives are stubbed to their
 * documented contract, because their built ESM entry imports CSS that plain
 * Node cannot load.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = fileURLToPath(new URL('..', import.meta.url))
const dshRoot = process.env.DSH_ROOT ?? 'D:/DSHarness/deepseek-harness'
const requireFromClient = createRequire(join(dshRoot, 'packages/client/web/package.json'))
const requireFromDsh = createRequire(join(dshRoot, 'package.json'))

const React = requireFromClient('react')
const { createRoot } = requireFromClient('react-dom/client')
const { JSDOM } = requireFromDsh('jsdom')

/** Off-peak flash prices, with a peak window that covers the whole day today. */
function configWithPeakDay(day) {
  return {
    currency: 'CNY',
    default: { cacheHitPrice: 0.15, cacheMissPrice: 4.5, outputPrice: 13.5, peakWindows: [] },
    models: {
      'deepseek-flash': {
        cacheHitPrice: 0.02,
        cacheMissPrice: 1,
        outputPrice: 4,
        peakWindows: [
          { id: 'peak-day', start: '00:00', end: '23:59', days: [day], cacheHitPrice: 0.04, cacheMissPrice: 2, outputPrice: 8 },
        ],
      },
    },
  }
}

/** ISO weekday of today in the test process's local time. */
function todayIso() {
  const day = new Date().getDay()
  return day === 0 ? 7 : day
}

/** The session's cumulative `tokenUsage` projection (the same numbers the stats line reads). */
const USAGE = { uncachedInputTokens: 20666, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 289 }

/** The ledger snapshot the plugin's own route would serve. */
const SNAPSHOT = {  entries: [{ turn: 1, step: 1 }],
  tokens: { cacheHitTokens: 12288, cacheMissTokens: 217, outputTokens: 2 },
  costs: {
    cacheHitCost: 0.00024576,
    cacheMissCost: 0.000217,
    outputCost: 0.000008,
    totalCost: 0.00047075999999999998,
  },
}

/** Faithful stand-ins for the harness-owned primitives the dock imports. */
function primitivesStub(documentRef) {
  return {
    IconDataOutline16: () => null,
    // Placement is geometry-only; the panel content is what this test drives.
    useAnchoredPosition: () => ({ left: 0, top: 0 }),
    // The documented contract: an outside pointerdown closes the surface.
    useDismissOnOutsidePointer: (root, open, setOpen, portal) => {
      React.useEffect(() => {
        if (!open) return
        const closeOutside = (event) => {
          if (event.target instanceof Node
            && root.current?.contains(event.target) !== true
            && portal?.current?.contains(event.target) !== true) {
            setOpen(false)
          }
        }
        documentRef.addEventListener('pointerdown', closeOutside)
        return () => { documentRef.removeEventListener('pointerdown', closeOutside) }
      }, [root, open, setOpen, portal])
    },
  }
}

/**
 * Build one jsdom page and materialize the shipped bundle inside it.
 * @param routes - the two host routes the plugin reads, keyed by pathname; the
 * pricing table is fetched during `apply`, so it must be served up front.
 */
function mount(routes) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  const globals = ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']
  // Node 24 exposes some of these as getter-only accessors, so install with a
  // property definition and keep the original descriptors for restore().
  const saved = new Map()
  for (const name of globals) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    try {
      Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true })
    } catch {
      // A non-configurable global keeps its own value; React tolerates it.
    }
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const source = readFileSync(join(pluginRoot, 'client.js'), 'utf8')
  let registration
  window.__ModuleLoader__ = { load: (value) => { registration = value } }
  new Function(source)()

  const table = {
    react: React,
    'react/jsx-runtime': requireFromClient('react/jsx-runtime'),
    'react-dom': requireFromClient('react-dom'),
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (init) => {
        let value = init
        const listeners = new Set()
        return {
          getSnapshot: () => value,
          subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
          set: (next) => { value = next; for (const fn of listeners) fn() },
          update: (mutator) => { const draft = { ...value }; mutator(draft); value = draft; for (const fn of listeners) fn() },
        }
      },
    },
    '@deepseek-ai/dsh-client-ui-primitives': primitivesStub(window.document),
  }
  const exports = registration.factory((specifier) => {
    if (!Object.hasOwn(table, specifier)) throw new Error(`require("${specifier}") missed the module table`)
    return table[specifier]
  })

  const served = new Map(Object.entries(routes ?? {}))
  globalThis.fetch = async (url) => {
    const path = String(url)
    const body = served.get(path)
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }

  const registrations = []
  const dictionaries = []
  const modelStore = {
    getSnapshot: () => ({ current: { model: 'deepseek-flash' } }),
    subscribe: () => () => {},
  }
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    get: (name) => (name === 'modelDirectories'
      ? { directoryFor: () => ({ store: modelStore }) }
      : undefined),
    locale: {
      register: (namespace, dicts) => { dictionaries.push({ namespace, dicts }); return () => {} },
      bind: () => (key) => key,
    },
    slots: {
      inject: (_name, register) => { register() },
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)

  const dict = dictionaries[0].dicts.zh
  const dock = registrations.find(entry => entry.options.name === 'conversation.composer.dock')
  const container = window.document.createElement('div')
  window.document.body.appendChild(container)
  const root = createRoot(container)
  const props = {
    ...dock.options.inject('session-dom'),
    // The slot runtime supplies the projection seat; the plugin only reads it.
    useProjection: (key) => (key === 'tokenUsage' ? USAGE : undefined),
    t: (key) => dict[key] ?? key,
  }
  return {
    dom,
    window,
    document: window.document,
    container,
    root,
    props,
    dock,
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor === undefined) delete globalThis[name]
        else Object.defineProperty(globalThis, name, descriptor)
      }
      delete globalThis.fetch
      delete globalThis.IS_REACT_ACT_ENVIRONMENT
    },
  }
}

/** Wait for the plugin's fetch-backed state to settle inside act(). */
async function settle() {
  await React.act(async () => { await Promise.resolve() })
  await React.act(async () => { await Promise.resolve() })
}

test('the cost reading is a click-opened panel, like the shipped stats pills', async () => {
  const page = mount({
    '/dsh-cost-meter/config': { ok: true, value: configWithPeakDay(todayIso()) },
    '/dsh-cost-meter/sessions/session-dom/ledger': { ok: true, value: SNAPSHOT },
  })
  try {
    await React.act(async () => { page.root.render(React.createElement(page.dock.component, page.props)) })
    await settle()

    const button = page.container.querySelector('button[aria-haspopup="dialog"]')
    assert.ok(button, 'the cost reading renders as a dialog-opening button')
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.match(button.textContent, /预估花费/)
    assert.match(button.textContent, /~¥0\.0005/, 'the pill shows the running total')
    assert.match(button.textContent, /峰值/, 'an active peak window is flagged on the pill')
    assert.equal(page.document.querySelector('[role="dialog"]'), null, 'nothing is open before the click')

    // First click opens the panel: same content the tooltip used to carry.
    await React.act(async () => { button.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })) })
    const panel = page.document.querySelector('[role="dialog"]')
    assert.ok(panel, 'clicking the pill opens the detail panel')
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    assert.equal(panel.parentElement, page.document.body, 'the panel is portaled to the body')
    const text = panel.textContent
    for (const copy of ['预估花费明细', '模型', 'deepseek-flash', '已计费条目', '峰值时段', '生效星期', '输入缓存命中', '输入缓存未命中', '输出']) {
      assert.ok(text.includes(copy), `the panel shows "${copy}"`)
    }
    assert.match(text, /12\.3K/, 'cache-hit tokens')
    assert.match(text, /217/, 'cache-miss tokens')
    assert.equal(page.document.querySelectorAll('[role="dialog"]').length, 1)

    // A second click closes it again.
    await React.act(async () => { button.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(page.document.querySelector('[role="dialog"]'), null, 'a second click closes the panel')
    assert.equal(button.getAttribute('aria-expanded'), 'false')

    // Escape closes it.
    await React.act(async () => { button.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })) })
    assert.ok(page.document.querySelector('[role="dialog"]'))
    await React.act(async () => {
      page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    assert.equal(page.document.querySelector('[role="dialog"]'), null, 'Escape closes the panel')

    // An outside pointerdown closes it; one inside the panel does not.
    await React.act(async () => { button.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })) })
    const openPanel = page.document.querySelector('[role="dialog"]')
    await React.act(async () => {
      openPanel.dispatchEvent(new page.window.MouseEvent('pointerdown', { bubbles: true }))
    })
    assert.ok(page.document.querySelector('[role="dialog"]'), 'a pointerdown inside the panel keeps it open')
    await React.act(async () => {
      page.document.body.dispatchEvent(new page.window.MouseEvent('pointerdown', { bubbles: true }))
    })
    assert.equal(page.document.querySelector('[role="dialog"]'), null, 'a pointerdown outside closes the panel')
  } finally {
    await React.act(async () => { page.root.unmount() })
    page.restore()
    page.dom.window.close()
  }
})

test('the panel only reports a peak window that is really active today', async () => {
  const otherDay = todayIso() === 7 ? 1 : todayIso() + 1
  const page = mount({
    '/dsh-cost-meter/config': { ok: true, value: configWithPeakDay(otherDay) },
    '/dsh-cost-meter/sessions/session-dom/ledger': { ok: true, value: SNAPSHOT },
  })
  try {
    await React.act(async () => { page.root.render(React.createElement(page.dock.component, page.props)) })
    await settle()

    const button = page.container.querySelector('button[aria-haspopup="dialog"]')
    assert.ok(button)
    assert.doesNotMatch(button.textContent, /峰值/, 'no peak chip while the weekday is not selected')
    await React.act(async () => { button.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })) })
    const panel = page.document.querySelector('[role="dialog"]')
    assert.ok(panel)
    assert.ok(!panel.textContent.includes('峰值时段'), 'the panel drops the peak rows while off peak')
    assert.ok(panel.textContent.includes('输入缓存命中'))
  } finally {
    await React.act(async () => { page.root.unmount() })
    page.restore()
    page.dom.window.close()
  }
})
