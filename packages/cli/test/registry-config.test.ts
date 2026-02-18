import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stringify, parse as parseYaml } from 'yaml'
import { loadRegistryConfig, resolveRegistryForPackage, getAuthToken, addRegistry, removeRegistry, listRegistries } from '../src/lib/registry-config.js'

describe('registry config', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-reg-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns empty map when no registries configured', async () => {
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({ name: 'test', version: '1.0.0' }))
    const result = await loadRegistryConfig(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({})
  })

  it('loads scoped registries', async () => {
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({
      name: 'test',
      version: '1.0.0',
      registries: {
        '@acme': 'https://acme-corp.specpm.dev',
        default: 'https://registry.specpm.dev',
      },
    }))
    const result = await loadRegistryConfig(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value['@acme']).toBe('https://acme-corp.specpm.dev')
      expect(result.value['default']).toBe('https://registry.specpm.dev')
    }
  })
})

describe('resolveRegistryForPackage', () => {
  const registries = {
    '@acme': 'https://acme-corp.specpm.dev',
    default: 'https://registry.specpm.dev',
  }

  it('resolves scoped package to correct registry', () => {
    expect(resolveRegistryForPackage('@acme/my-spec', registries)).toBe('https://acme-corp.specpm.dev')
  })

  it('resolves unscoped to default registry', () => {
    expect(resolveRegistryForPackage('@other/spec', registries)).toBe('https://registry.specpm.dev')
  })

  it('returns undefined when no default and scope not found', () => {
    expect(resolveRegistryForPackage('@other/spec', { '@acme': 'https://acme.dev' })).toBeUndefined()
  })
})

describe('getAuthToken', () => {
  it('reads token from env var', async () => {
    process.env.SPECPM_TOKEN_ACME = 'env-token-123'
    const token = await getAuthToken('https://acme.dev', '@acme')
    expect(token).toBe('env-token-123')
    delete process.env.SPECPM_TOKEN_ACME
  })

  it('returns undefined when no token available', async () => {
    const token = await getAuthToken('https://unknown.dev', '@unknown')
    expect(token).toBeUndefined()
  })
})

describe('registry add/remove/list', () => {
  let tempDir: string
  let origCwd: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-reg-cmd-'))
    origCwd = process.cwd()
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({ name: 'test', version: '1.0.0' }))
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('adds a registry', async () => {
    const result = await addRegistry(tempDir, '@acme', 'https://acme.specpm.dev')
    expect(result.ok).toBe(true)

    const content = await readFile(join(tempDir, 'specpm.yaml'), 'utf-8')
    const config = parseYaml(content) as Record<string, unknown>
    const registries = config.registries as Record<string, string>
    expect(registries['@acme']).toBe('https://acme.specpm.dev')
  })

  it('rejects non-HTTPS URL', async () => {
    const result = await addRegistry(tempDir, '@acme', 'http://acme.specpm.dev')
    expect(result.ok).toBe(false)
  })

  it('removes a registry', async () => {
    await addRegistry(tempDir, '@acme', 'https://acme.specpm.dev')
    const result = await removeRegistry(tempDir, '@acme')
    expect(result.ok).toBe(true)

    const content = await readFile(join(tempDir, 'specpm.yaml'), 'utf-8')
    const config = parseYaml(content) as Record<string, unknown>
    const registries = config.registries as Record<string, string>
    expect(registries['@acme']).toBeUndefined()
  })

  it('errors when removing non-existent registry', async () => {
    const result = await removeRegistry(tempDir, '@nonexistent')
    expect(result.ok).toBe(false)
  })

  it('lists registries', async () => {
    await addRegistry(tempDir, '@acme', 'https://acme.specpm.dev')
    await addRegistry(tempDir, '@team', 'https://team.specpm.dev')
    const result = await listRegistries(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value)).toHaveLength(2)
    }
  })
})
