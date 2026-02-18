import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bumpVersion, versionCommand } from '../src/commands/version.js'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { parse as parseYaml } from 'yaml'

describe('bumpVersion', () => {
  it('bumps major', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
  })
  it('bumps minor', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
  })
  it('bumps patch', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
  })
  it('creates prerelease', () => {
    expect(bumpVersion('1.0.0', 'minor', 'beta')).toBe('1.1.0-beta.1')
  })
  it('bumps existing prerelease', () => {
    expect(bumpVersion('1.1.0-beta.1', 'minor', 'beta')).toBe('1.2.0-beta.2')
  })
})

describe('versionCommand', () => {
  let tmpDir: string
  let origCwd: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'specpm-version-'))
    origCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('bumps patch version in spec.yaml', async () => {
    await writeFile(join(tmpDir, 'spec.yaml'), stringify({
      name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await versionCommand('patch', {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.newVersion).toBe('1.0.1')
    }

    const updated = parseYaml(await readFile(join(tmpDir, 'spec.yaml'), 'utf-8')) as any
    expect(updated.version).toBe('1.0.1')
    errSpy.mockRestore()
  })

  it('bumps major version', async () => {
    await writeFile(join(tmpDir, 'spec.yaml'), stringify({
      name: '@test/pkg', version: '1.2.3', description: 'Test', author: 'test', license: 'MIT',
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await versionCommand('major', {})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.newVersion).toBe('2.0.0')
    errSpy.mockRestore()
  })

  it('creates CHANGELOG.md if missing', async () => {
    await writeFile(join(tmpDir, 'spec.yaml'), stringify({
      name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await versionCommand('minor', { message: 'Added feature' })
    const changelog = await readFile(join(tmpDir, 'CHANGELOG.md'), 'utf-8')
    expect(changelog).toContain('## [1.1.0]')
    expect(changelog).toContain('Added feature')
    errSpy.mockRestore()
  })

  it('prepends to existing CHANGELOG.md', async () => {
    await writeFile(join(tmpDir, 'spec.yaml'), stringify({
      name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    }))
    await writeFile(join(tmpDir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-01-01\n### Added\n- Initial release\n')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await versionCommand('patch', { message: 'Bug fix' })
    const changelog = await readFile(join(tmpDir, 'CHANGELOG.md'), 'utf-8')
    expect(changelog.indexOf('[1.0.1]')).toBeLessThan(changelog.indexOf('[1.0.0]'))
    errSpy.mockRestore()
  })

  it('supports --preid flag', async () => {
    await writeFile(join(tmpDir, 'spec.yaml'), stringify({
      name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await versionCommand('minor', { preid: 'beta' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.newVersion).toBe('1.1.0-beta.1')
    errSpy.mockRestore()
  })

  it('fails if no spec.yaml', async () => {
    const result = await versionCommand('patch', {})
    expect(result.ok).toBe(false)
  })
})
