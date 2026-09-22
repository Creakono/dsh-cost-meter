/**
 * Test runner: link this package against the harness checkout (the same links
 * the build uses) and run `node --test` with the harness's tsx loader, so the
 * TypeScript sources are exercised directly.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginRoot, run, withDshEnvironment } from './dsh-env.mjs'

await withDshEnvironment(async ({ dshRoot }) => {
  const tsxLoader = join(dshRoot, 'node_modules/tsx/dist/esm/index.mjs')
  const testsDir = join(pluginRoot, 'tests')
  const files = readdirSync(testsDir)
    .filter(name => /\.test\.(?:ts|mjs)$/.test(name))
    .sort()
    .map(name => join(testsDir, name))
  await run(process.execPath, ['--import', pathToFileURL(tsxLoader).href, '--test', ...files])
})
