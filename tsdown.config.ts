/**
 * Build faces for the plugin: the self-contained Host bundle (`index.mjs`) and
 * the browser bundle (`client.js`).
 *
 * The browser face deliberately does NOT borrow the harness's own
 * `clientBundle()` preset. That preset locates its package through the harness
 * workspace (`packages/* /package.json`), which an out-of-tree plugin installed
 * by path is not part of, and it fails the build with
 * `tsdown: no packages/* /package.json declares the name <plugin>`. This config
 * reproduces the runtime contract the browser module loader actually requires:
 *
 * 1. a closure-factory artifact — `window.__ModuleLoader__.load({id, factory})`
 *    with the package name as the registration key;
 * 2. externals limited to the platform module table (`PLATFORM_MODULES`), which
 *    is read from the harness so the two lists cannot drift, plus a build gate
 *    that rejects any other `@deepseek-ai/*` value import (a cross-plugin value
 *    import would either inline a duplicate runtime instance or require a
 *    module-table row this package did not request);
 * 3. `.module.css` compiled by lightningcss with hashed class names and injected
 *    as a plugin-owned `<style data-plugin-css>` tag at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { PLATFORM_MODULES } from './.dsh/packages/client/web/src/platform.ts'

const PLUGIN_ID = 'dsh-cost-meter'

/** Harness checkout this build links against (set by scripts/dsh-env.mjs). */
const dshRoot = process.env.DSH_ROOT ?? resolve(process.cwd(), '.dsh')

/**
 * lightningcss comes from the harness installation, not from this package: the
 * plugin ships no browser build dependencies of its own.
 */
const requireFromDsh = createRequire(join(dshRoot, 'package.json'))
const { transform } = requireFromDsh('lightningcss')

/** Module-table specifiers every dynamic client bundle may require. */
const EXTERNALS = new Set(PLATFORM_MODULES)

/** Virtual-id wrapper keeping module CSS away from the CSS pipeline (see below). */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.module.css.mjs'

/** Emit one plugin-owned style injector plus the CSS Modules class map. */
function styleInjectionModule(id, fileId, css, classMap) {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ]
  return source.join('\n')
}

/** Bundle purity gate: only platform module-table rows may stay external. */
function purityGate() {
  return {
    name: 'dsh-cost-meter/client-bundle-purity',
    resolveId(source) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (EXTERNALS.has(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not in the platform module table — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services instead '
        + '(type-only imports are erased and never reach this gate)',
      )
    },
  }
}

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own CSS pipeline.
 * The suffix matters: tsdown's guard matches ids ending in `.css`, and the
 * virtual id must not.
 */
function cssModulesInline() {
  return {
    name: 'dsh-cost-meter/css-modules-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      if (importer === undefined) return CSS_VIRTUAL_PREFIX + resolve(source) + CSS_VIRTUAL_SUFFIX
      if (importer.startsWith('\0') || !isAbsolute(importer)) {
        return CSS_VIRTUAL_PREFIX + resolve(source) + CSS_VIRTUAL_SUFFIX
      }
      return CSS_VIRTUAL_PREFIX + resolve(dirname(importer), source) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      // The virtual id otherwise hides the physical stylesheet from the watch graph.
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap = {}
      for (const [local, exported] of Object.entries(cssExports ?? {})) classMap[local] = exported.name
      return styleInjectionModule(PLUGIN_ID, fileId, code.toString(), classMap)
    },
  }
}

export default () => [
  {
    name: PLUGIN_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The runtime must not depend on a schemastery hoisted by some other plugin.
    deps: {
      alwaysBundle: ['@deepseek-ai/schemastery'],
    },
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'dist',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    // Plugin code is fetched outside Vite's module graph, so its own bundle must
    // carry the TS/TSX mapping consumed by browser profiling tools.
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier) => EXTERNALS.has(specifier),
      // Anything not answered by the module table must inline: a require() the
      // table cannot resolve is a guaranteed runtime throw.
      alwaysBundle: (specifier) => !EXTERNALS.has(specifier),
    },
    // Dual-mode libraries (zustand/immer and friends) resolve their browser
    // flavor through these conditions.
    inputOptions: {
      resolve: {
        conditionNames: ['production', 'browser', 'import', 'module', 'default'],
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    plugins: [purityGate(), cssModulesInline()],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapExcludeSources: false,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
