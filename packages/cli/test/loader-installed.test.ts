import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listInstalledSpecs, getInstalledSpec } from '../src/lib/loader.js'

const MINIMAL_SPEC = `
name: "@test/example"
version: "1.0.0"
description: "Test spec"
author: "test"
license: "MIT"
`

async function createProject(specs: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-loader-'))
  await mkdir(join(dir, '.specpm', 'specs'), { recursive: true })
  for (const [name, content] of Object.entries(specs)) {
    const parts = name.match(/^@([^/]+)\/(.+)$/)!
    const specDir = join(dir, '.specpm', 'specs', `@${parts[1]}`, parts[2])
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), content)
  }
  return dir
}

describe('listInstalledSpecs', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('returns empty array when no specs installed', async () => {
    const dir = await createProject()
    dirs.push(dir)
    const result = await listInstalledSpecs(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })

  it('returns empty when .specpm/specs does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specpm-loader-'))
    dirs.push(dir)
    const result = await listInstalledSpecs(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })

  it('lists installed specs', async () => {
    const dir = await createProject({
      '@test/example': MINIMAL_SPEC,
      '@test/other': MINIMAL_SPEC.replace('@test/example', '@test/other'),
    })
    dirs.push(dir)
    const result = await listInstalledSpecs(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(2)
      const names = result.value.map(s => s.manifest.name).sort()
      expect(names).toEqual(['@test/example', '@test/other'])
    }
  })
})

describe('getInstalledSpec', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('gets a spec by name', async () => {
    const dir = await createProject({ '@test/example': MINIMAL_SPEC })
    dirs.push(dir)
    const result = await getInstalledSpec(dir, '@test/example')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.manifest.name).toBe('@test/example')
  })

  it('errors for non-installed spec', async () => {
    const dir = await createProject()
    dirs.push(dir)
    const result = await getInstalledSpec(dir, '@test/missing')
    expect(result.ok).toBe(false)
  })

  it('errors for invalid name format', async () => {
    const dir = await createProject()
    dirs.push(dir)
    const result = await getInstalledSpec(dir, 'bad-name')
    expect(result.ok).toBe(false)
  })
})
