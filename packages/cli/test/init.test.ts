import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { initCommand } from '../src/commands/init.js'

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

describe('specpm init', () => {
  const dirs: string[] = []
  let originalCwd: string

  function setupDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'specpm-init-'))
  }

  afterEach(async () => {
    process.chdir(originalCwd)
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  // Save original cwd before each
  originalCwd = process.cwd()

  it('initializes in empty directory with --yes', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    const result = await initCommand({ yes: true })
    expect(result.ok).toBe(true)

    // Check specpm.yaml created
    const manifest = parseYaml(await readFile(join(dir, 'specpm.yaml'), 'utf-8'))
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.context.targets).toEqual(['claude'])
    expect(manifest.dependencies).toEqual({})

    // Check directories created
    expect(await fileExists(join(dir, '.specpm', 'specs'))).toBe(true)
    expect(await fileExists(join(dir, '.specpm', 'context'))).toBe(true)
    expect(await fileExists(join(dir, '.specpm', 'cache'))).toBe(true)

    // Check .gitignore
    const gitignore = await readFile(join(dir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.specpm/cache')
  })

  it('uses --name flag', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    const result = await initCommand({ yes: true, name: 'my-cool-project' })
    expect(result.ok).toBe(true)

    const manifest = parseYaml(await readFile(join(dir, 'specpm.yaml'), 'utf-8'))
    expect(manifest.name).toBe('my-cool-project')
  })

  it('uses --targets flag', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    const result = await initCommand({ yes: true, targets: 'claude,cursor' })
    expect(result.ok).toBe(true)

    const manifest = parseYaml(await readFile(join(dir, 'specpm.yaml'), 'utf-8'))
    expect(manifest.context.targets).toEqual(['claude', 'cursor'])
  })

  it('errors on double init without --force', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    await initCommand({ yes: true })
    const result = await initCommand({ yes: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('already exists')
  })

  it('allows double init with --force', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    await initCommand({ yes: true, name: 'first' })
    const result = await initCommand({ yes: true, name: 'second', force: true })
    expect(result.ok).toBe(true)

    const manifest = parseYaml(await readFile(join(dir, 'specpm.yaml'), 'utf-8'))
    expect(manifest.name).toBe('second')
  })

  it('appends to existing .gitignore', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    await writeFile(join(dir, '.gitignore'), 'node_modules\n')
    await initCommand({ yes: true })

    const gitignore = await readFile(join(dir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('node_modules')
    expect(gitignore).toContain('.specpm/cache')
  })

  it('does not duplicate .gitignore entry', async () => {
    const dir = await setupDir()
    dirs.push(dir)
    process.chdir(dir)

    await writeFile(join(dir, '.gitignore'), '.specpm/cache\n')
    await initCommand({ yes: true })

    const gitignore = await readFile(join(dir, '.gitignore'), 'utf-8')
    const count = gitignore.split('.specpm/cache').length - 1
    expect(count).toBe(1)
  })
})
