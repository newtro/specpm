import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { satisfiesRange, resolveDependencies } from '../src/lib/resolver.js'

function makeSpec(name: string, version: string, deps: Record<string, string> = {}): string {
  const depsYaml = Object.keys(deps).length > 0
    ? `dependencies:\n${Object.entries(deps).map(([k, v]) => `  "${k}": "${v}"`).join('\n')}`
    : ''
  return `
name: "${name}"
version: "${version}"
description: "Test spec"
author: "test"
license: "MIT"
${depsYaml}
`
}

async function createProjectWithSpecs(specs: Array<{ name: string; version: string; deps?: Record<string, string> }>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-resolve-'))
  await mkdir(join(dir, '.specpm', 'specs'), { recursive: true })
  for (const { name, version, deps } of specs) {
    const match = name.match(/^@([^/]+)\/(.+)$/)!
    const specDir = join(dir, '.specpm', 'specs', `@${match[1]}`, match[2])
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), makeSpec(name, version, deps ?? {}))
  }
  return dir
}

describe('satisfiesRange', () => {
  it('exact match', () => {
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false)
  })

  it('caret range', () => {
    expect(satisfiesRange('1.2.3', '^1.0.0')).toBe(true)
    expect(satisfiesRange('1.9.9', '^1.0.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '^1.0.0')).toBe(false)
    expect(satisfiesRange('0.9.0', '^1.0.0')).toBe(false)
  })

  it('tilde range', () => {
    expect(satisfiesRange('1.2.3', '~1.2.0')).toBe(true)
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true)
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false)
  })

  it('>= range', () => {
    expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.0', '>=1.0.0')).toBe(true)
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false)
  })

  it('wildcard', () => {
    expect(satisfiesRange('99.99.99', '*')).toBe(true)
  })
})

describe('resolveDependencies', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('resolves flat dependency tree', async () => {
    const dir = await createProjectWithSpecs([
      { name: '@test/a', version: '1.0.0', deps: { '@test/b': '^1.0.0' } },
      { name: '@test/b', version: '1.2.0' },
    ])
    dirs.push(dir)

    const result = await resolveDependencies({ '@test/a': '^1.0.0' }, dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(2)
      const names = result.value.map(d => d.name).sort()
      expect(names).toEqual(['@test/a', '@test/b'])
    }
  })

  it('detects version conflicts', async () => {
    const dir = await createProjectWithSpecs([
      { name: '@test/a', version: '1.0.0', deps: { '@test/c': '^2.0.0' } },
      { name: '@test/b', version: '1.0.0', deps: { '@test/c': '^1.0.0' } },
      { name: '@test/c', version: '2.0.0' },
    ])
    dirs.push(dir)

    // @test/a wants c@^2.0.0 (resolved to 2.0.0), @test/b wants c@^1.0.0 (2.0.0 doesn't satisfy ^1.0.0)
    const result = await resolveDependencies({ '@test/a': '^1.0.0', '@test/b': '^1.0.0' }, dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.type).toBe('version-conflict')
  })

  it('detects circular dependencies', async () => {
    const dir = await createProjectWithSpecs([
      { name: '@test/a', version: '1.0.0', deps: { '@test/b': '^1.0.0' } },
      { name: '@test/b', version: '1.0.0', deps: { '@test/a': '^1.0.0' } },
    ])
    dirs.push(dir)

    const result = await resolveDependencies({ '@test/a': '^1.0.0' }, dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.type).toBe('circular-dependency')
  })

  it('handles missing dependency', async () => {
    const dir = await createProjectWithSpecs([
      { name: '@test/a', version: '1.0.0', deps: { '@test/missing': '^1.0.0' } },
    ])
    dirs.push(dir)

    const result = await resolveDependencies({ '@test/a': '^1.0.0' }, dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.type).toBe('not-found')
  })

  it('resolves empty dependencies', async () => {
    const dir = await createProjectWithSpecs([])
    dirs.push(dir)

    const result = await resolveDependencies({}, dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })
})
