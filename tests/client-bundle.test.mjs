/**
 * The shipped browser bundle must materialize inside the harness module table
 * and register both of its Slots.
 *
 * This is the regression the harness update caused: the bundle used to require
 * `@deepseek-ai/dsh-client-runtime/client`, a module the table no longer
 * provides, so the factory threw before `apply` ever ran and the whole plugin
 * silently disappeared from the page. The test therefore fails if any required
 * specifier is outside the platform module table, and it drives the real
 * artifact (`client.js`) rather than the sources.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = fileURLToPath(new URL('..', import.meta.url))
const dshRoot = process.env.DSH_ROOT ?? 'D:/DSHarness/deepseek-harness'
// React resolves from the web client package, the same instance the shell seeds.
const requireFromClient = createRequire(join(dshRoot, 'packages/client/web/package.json'))

/** The runtime baseline the harness seeds into every page (platform.ts). */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Minimal stand-in for the store package the shell seeds. */
function createSnapshotStore(init) {
  let value = init
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { value = next; for (const fn of listeners) fn() },
    update: (mutator) => { const draft = { ...value }; mutator(draft); value = draft; for (const fn of listeners) fn() },
  }
}

/** Load the bundle and materialize its factory through a module table. */
function materialize() {
  const required = []
  const source = readFileSync(join(pluginRoot, 'client.js'), 'utf8')
  let registration
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
  try {
    // Executed exactly as the page executes it: a classic script registering a
    // factory on the loader facade.
    new Function(source)()
  } finally {
    globalThis.window = previousWindow
  }
  assert.ok(registration, 'client.js registered no factory')
  const table = {
    react: requireFromClient('react'),
    'react/jsx-runtime': requireFromClient('react/jsx-runtime'),
    'react-dom': requireFromClient('react-dom'),
    '@deepseek-ai/dsh-client-store': { createSnapshotStore },
    '@deepseek-ai/dsh-client-ui-primitives': {
      // The dock imports the same primitives the shipped stat pills use.
      IconDataOutline16: () => null,
      useAnchoredPosition: () => ({ left: 0, top: 0 }),
      useDismissOnOutsidePointer: () => {},
    },
  }
  const requireModule = (specifier) => {
    required.push(specifier)
    if (!Object.hasOwn(table, specifier)) {
      throw new Error(`require("${specifier}") missed the module table`)
    }
    return table[specifier]
  }
  return { registration, exports: registration.factory(requireModule), required }
}

test('the bundle registers under the package name and requires only platform modules', () => {
  const { registration, required } = materialize()
  assert.equal(registration.id, 'dsh-cost-meter')
  assert.ok(required.length > 0, 'the bundle imported nothing at all')
  for (const specifier of required) {
    assert.ok(PLATFORM_MODULES.includes(specifier), `${specifier} is not a platform module`)
  }
})

test('the bundle inlines its stylesheets with plugin-owned tags', () => {
  const source = readFileSync(join(pluginRoot, 'client.js'), 'utf8')
  assert.match(source, /data-plugin-css/)
  assert.match(source, /data-plugin/)
  assert.match(source, /dsh-cost-meter\/CostDock\.module\.css/)
})

test('apply registers the composer dock and the settings section', () => {
  const { exports } = materialize()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual([...exports.inject], ['slots', 'locale'])

  const slots = []
  const dictionaries = []
  const effects = []
  const ctx = {
    effect: (fn, name) => { effects.push(name); const disposer = fn(); return () => disposer?.() },
    get: () => undefined,
    locale: {
      register: (namespace, dicts) => { dictionaries.push({ namespace, dicts }); return () => {} },
      bind: (namespace) => (key) => `${namespace}:${key}`,
    },
    slots: {
      inject: (name, register) => { register() },
      register: (options, component) => { slots.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)

  assert.deepEqual(dictionaries.map(entry => entry.namespace), ['dsh-cost-meter'])
  assert.ok(Object.hasOwn(dictionaries[0].dicts.zh, 'days.mon'))
  assert.ok(Object.hasOwn(dictionaries[0].dicts.en, 'days.sun'))
  assert.deepEqual(slots.map(entry => entry.options.name), ['conversation.composer.dock', 'settings.section'])
  for (const entry of slots) {
    assert.equal(typeof entry.component, 'function', `${entry.options.name} registered no component`)
    assert.equal(entry.options.locale, 'dsh-cost-meter')
  }
  assert.equal(slots[0].options.id, 'cost')
  assert.equal(slots[0].options.order, 1, 'the cost line follows the shipped stats entry (order 0)')
  assert.equal(slots[1].options.id, 'dsh-cost-meter')
  assert.deepEqual(effects, ['dsh-cost-meter: dictionaries'])
})
