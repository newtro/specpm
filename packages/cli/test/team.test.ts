import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stringify } from 'yaml'
import { teamCheckCommand } from '../src/commands/team.js'

describe('specpm team check', () => {
  let tempDir: string
  let origCwd: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-team-check-'))
    origCwd = process.cwd()
    process.chdir(tempDir)

    // Create specpm.yaml
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        '@auth/oauth2': '2.0.0',
      },
    }))
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('passes when no team config exists', async () => {
    const result = await teamCheckCommand({ json: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(true)
    }
  })

  it('detects missing required specs', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      required: ['@company/api-standards@^2.0.0'],
    }))

    const result = await teamCheckCommand({ json: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(false)
      expect(result.value.missing).toContain('@company/api-standards')
    }
  })

  it('passes when required specs are installed', async () => {
    // Install a fake spec
    const specDir = join(tempDir, '.specpm', 'specs', '@auth', 'oauth2')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), stringify({
      name: '@auth/oauth2',
      version: '2.0.0',
      description: 'OAuth2 spec',
      author: 'test',
      license: 'MIT',
    }))

    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      required: ['@auth/oauth2@^2.0.0'],
    }))

    const result = await teamCheckCommand({ json: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(true)
      expect(result.value.missing).toHaveLength(0)
    }
  })

  it('detects outdated specs', async () => {
    const specDir = join(tempDir, '.specpm', 'specs', '@auth', 'oauth2')
    await mkdir(specDir, { recursive: true })
    await writeFile(join(specDir, 'spec.yaml'), stringify({
      name: '@auth/oauth2',
      version: '1.0.0',
      description: 'OAuth2 spec',
      author: 'test',
      license: 'MIT',
    }))

    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      required: ['@auth/oauth2@^2.0.0'],
    }))

    const result = await teamCheckCommand({ json: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(false)
      expect(result.value.outdated).toHaveLength(1)
      expect(result.value.outdated[0].name).toBe('@auth/oauth2')
    }
  })

  it('reports recommended specs', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      recommended: ['@company/logging@^1.0.0'],
    }))

    const result = await teamCheckCommand({ json: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(true)
      expect(result.value.recommended).toContain('@company/logging')
    }
  })
})
