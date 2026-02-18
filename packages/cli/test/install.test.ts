import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { createHash } from 'node:crypto'
import { initCommand } from '../src/commands/init.js'
import { installFromLocalPath } from '../src/commands/install.js'

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

const VALID_SPEC = `
name: "@test/example"
version: "1.0.0"
description: "Test spec"
author: "test"
license: "MIT"
`

async function createSourcePackage(specYaml: string = VALID_SPEC): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-src-'))
  await writeFile(join(dir, 'spec.yaml'), specYaml)
  return dir
}

async function createInitializedProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-proj-'))
  process.chdir(dir)
  await initCommand({ yes: true })
  return dir
}

describe('specpm install (local path)', () => {
  const dirs: string[] = []
  const originalCwd = process.cwd()

  afterEach(async () => {
    process.chdir(originalCwd)
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('installs a valid local package', async () => {
    const src = await createSourcePackage()
    const proj = await createInitializedProject()
    dirs.push(src, proj)

    const result = await installFromLocalPath(src)
    expect(result.ok).toBe(true)

    // Check files copied
    expect(await fileExists(join(proj, '.specpm', 'specs', '@test', 'example', 'spec.yaml'))).toBe(true)

    // Check specpm.yaml updated
    const manifest = parseYaml(await readFile(join(proj, 'specpm.yaml'), 'utf-8'))
    expect(manifest.dependencies['@test/example']).toBe('1.0.0')
  })

  it('rejects invalid package', async () => {
    const src = await createSourcePackage(`
name: "bad-name"
version: "1.0.0"
description: "Bad"
author: "test"
license: "MIT"
`)
    const proj = await createInitializedProject()
    dirs.push(src, proj)

    const result = await installFromLocalPath(src)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Invalid spec package')
  })

  it('rejects install in non-initialized project', async () => {
    const src = await createSourcePackage()
    const proj = await mkdtemp(join(tmpdir(), 'specpm-noinit-'))
    dirs.push(src, proj)
    process.chdir(proj)

    const result = await installFromLocalPath(src)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('specpm init')
  })

  it('generates lockfile after install', async () => {
    const src = await createSourcePackage()
    const proj = await createInitializedProject()
    dirs.push(src, proj)

    await installFromLocalPath(src)

    const lockfilePath = join(proj, 'specpm-lock.yaml')
    expect(await fileExists(lockfilePath)).toBe(true)

    const lockfile = parseYaml(await readFile(lockfilePath, 'utf-8'))
    expect(lockfile.lockfileVersion).toBe(1)
    expect(lockfile.packages['@test/example@1.0.0']).toBeDefined()
  })

  it('lockfile contains correct integrity hash', async () => {
    const src = await createSourcePackage()
    const proj = await createInitializedProject()
    dirs.push(src, proj)

    await installFromLocalPath(src)

    const lockfile = parseYaml(await readFile(join(proj, 'specpm-lock.yaml'), 'utf-8'))
    const entry = lockfile.packages['@test/example@1.0.0']

    // Compute expected hash from installed spec.yaml
    const installedContent = await readFile(join(proj, '.specpm', 'specs', '@test', 'example', 'spec.yaml'), 'utf-8')
    const expectedHash = createHash('sha256').update(installedContent).digest('hex')
    expect(entry.integrity).toBe(`sha256-${expectedHash}`)
  })

  it('lockfile contains install timestamp', async () => {
    const src = await createSourcePackage()
    const proj = await createInitializedProject()
    dirs.push(src, proj)

    const before = new Date().toISOString()
    await installFromLocalPath(src)

    const lockfile = parseYaml(await readFile(join(proj, 'specpm-lock.yaml'), 'utf-8'))
    const entry = lockfile.packages['@test/example@1.0.0']
    expect(entry.installedAt).toBeDefined()
    expect(new Date(entry.installedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000)
  })
})
