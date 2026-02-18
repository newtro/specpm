import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTeamConfig, parseRequirement } from '../src/lib/team-config.js'

describe('team config loader', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-team-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns null when no specpm-team.yaml exists', async () => {
    const result = await loadTeamConfig(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('loads a valid team config', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), `
required:
  - "@company/api-standards@^2.0.0"
  - "@company/error-handling@^1.0.0"
recommended:
  - "@company/logging@^1.0.0"
context:
  targets: ["claude", "cursor"]
  enforced: true
check:
  strict: true
  required-level: 2
`)
    const result = await loadTeamConfig(tempDir)
    expect(result.ok).toBe(true)
    if (result.ok && result.value) {
      expect(result.value.required).toHaveLength(2)
      expect(result.value.recommended).toHaveLength(1)
      expect(result.value.context?.enforced).toBe(true)
      expect(result.value.check?.strict).toBe(true)
    }
  })

  it('rejects invalid required field', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), `required: "not-an-array"`)
    const result = await loadTeamConfig(tempDir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('must be an array')
  })

  it('rejects non-string entries in required', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), `required:\n  - 123`)
    const result = await loadTeamConfig(tempDir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Must be a string')
  })

  it('rejects empty/null YAML', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), '')
    const result = await loadTeamConfig(tempDir)
    expect(result.ok).toBe(false)
  })
})

describe('parseRequirement', () => {
  it('parses name with version range', () => {
    const result = parseRequirement('@company/api-standards@^2.0.0')
    expect(result.name).toBe('@company/api-standards')
    expect(result.versionRange).toBe('^2.0.0')
  })

  it('parses name without version', () => {
    const result = parseRequirement('@company/api-standards')
    expect(result.name).toBe('@company/api-standards')
    expect(result.versionRange).toBeNull()
  })
})
