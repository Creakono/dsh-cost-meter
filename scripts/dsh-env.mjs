import { access, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

export const pluginRoot = fileURLToPath(new URL('..', import.meta.url))

function dshRootFromEnvironment() {
  return resolve(process.env.DSH_ROOT ?? join(pluginRoot, '..', 'dsh'))
}

/** The .cmd shim path on Windows (spawn cannot run extension-less shims). */
export function binPath(dshRoot, name) {
  const path = join(dshRoot, 'node_modules/.bin', name)
  return process.platform === 'win32' ? `${path}.cmd` : path
}

async function requirePath(path, description) {
  try {
    await access(path)
  } catch {
    throw new Error(`${description} was not found at ${path}`)
  }
}

async function ensureSymlink(path, target, ownedLinks) {
  try {
    const info = await lstat(path)
    if (!info.isSymbolicLink()) throw new Error(`${path} exists and is not a symbolic link`)
    const current = resolve(dirname(path), await readlink(path))
    if (current !== resolve(target)) throw new Error(`${path} points to ${current}, expected ${target}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(dirname(path), { recursive: true })
    await symlink(relative(dirname(path), target), path, 'dir')
    ownedLinks.push(path)
  }
}

async function prepareLinks(dshRoot) {
  const ownedLinks = []
  const clientModules = join(dshRoot, 'packages/client/runtime/node_modules')
  let removeNodeModules = false
  try {
    await lstat(join(pluginRoot, 'node_modules'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    removeNodeModules = true
  }
  await ensureSymlink(join(pluginRoot, '.dsh'), dshRoot, ownedLinks)
  await ensureSymlink(join(pluginRoot, 'node_modules/react'), join(clientModules, 'react'), ownedLinks)
  await ensureSymlink(join(pluginRoot, 'node_modules/cordis'), join(clientModules, 'cordis'), ownedLinks)
  await ensureSymlink(join(pluginRoot, 'node_modules/@types'), join(clientModules, '@types'), ownedLinks)
  return { ownedLinks, removeNodeModules }
}

async function removeOwnedLinks(ownedLinks, removeNodeModules) {
  for (const path of ownedLinks.reverse()) await rm(path, { force: true })
  if (removeNodeModules) await rm(join(pluginRoot, 'node_modules'), { recursive: true, force: true })
}

export async function withDshEnvironment(task) {
  const dshRoot = dshRootFromEnvironment()
  await requirePath(join(dshRoot, 'packages/client/tsdown.client.ts'), 'DSH client bundle preset')
  await requirePath(binPath(dshRoot, 'tsdown'), 'DSH tsdown executable')
  await requirePath(binPath(dshRoot, 'tsc'), 'DSH TypeScript executable')
  const { ownedLinks, removeNodeModules } = await prepareLinks(dshRoot)
  try {
    return await task({ dshRoot, pluginRoot })
  } finally {
    await removeOwnedLinks(ownedLinks, removeNodeModules)
  }
}

export function run(command, args, cwd = pluginRoot) {
  return new Promise((resolvePromise, reject) => {
    // .cmd shims on Windows need cmd.exe (the CVE-2024-27980 hardening).
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/c', command, ...args], { cwd, stdio: 'inherit', env: process.env })
      : spawn(command, args, { cwd, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`${command} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}
