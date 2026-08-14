import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { binPath, run, withDshEnvironment } from './dsh-env.mjs'

/**
 * Rolldown stamps each inlined CSS module with a region comment whose virtual
 * id embeds the absolute plugin path. Rewrite it package-relative so the
 * shipped `client.js` does not leak the machine it was built on.
 */
const CSS_REGION_MARKER = '//#region \\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.module.css.mjs'

function relativizeCssRegions(source, root) {
  return source.split('\n').map((line) => {
    const markerIndex = line.indexOf(CSS_REGION_MARKER)
    if (markerIndex === -1) return line
    const idStart = markerIndex + CSS_REGION_MARKER.length
    const suffixIndex = line.indexOf(CSS_VIRTUAL_SUFFIX, idStart)
    if (suffixIndex === -1) return line
    const idEnd = suffixIndex + CSS_VIRTUAL_SUFFIX.length
    const absoluteId = line.slice(idStart, idEnd)
    const portableId = relative(root, absoluteId).split(sep).join('/')
    return `${line.slice(0, idStart)}./${portableId}${line.slice(idEnd)}`
  }).join('\n')
}

/**
 * The host bundle inlines schemastery/cosmokit from `DSH_ROOT`; its region
 * comments then name a sibling harness checkout (`../../<harness>/...`).
 * Rebase that prefix to a stable `dsh/` so the shipped bundle reads the same
 * on every machine and after every install location.
 */
function relativizeDshRegions(source, pluginRoot, dshRoot) {
  const dshPrefix = relative(pluginRoot, dshRoot).split(sep).join('/')
  return source
    .split(`${dshPrefix}/`).join('dsh/')
    .split(dshRoot.replaceAll('\\', '/')).join('dsh')
}

await withDshEnvironment(async ({ dshRoot, pluginRoot }) => {
  const dist = join(pluginRoot, 'dist')
  await rm(dist, { recursive: true, force: true })
  await run(binPath(dshRoot, 'tsc'), ['-b', 'tsconfig.json'])
  await run(binPath(dshRoot, 'tsdown'), ['--config', 'tsdown.config.ts'])
  const hostSource = await readFile(join(dist, 'index.js'), 'utf8')
  await writeFile(join(pluginRoot, 'index.mjs'), relativizeDshRegions(hostSource, pluginRoot, dshRoot))
  const clientSource = await readFile(join(dist, 'client.js'), 'utf8')
  await writeFile(join(pluginRoot, 'client.js'), relativizeCssRegions(clientSource, pluginRoot))
  await copyFile(join(dist, 'client.js.map'), join(pluginRoot, 'client.js.map'))
  await rm(dist, { recursive: true, force: true })
})
