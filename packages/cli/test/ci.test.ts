import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stringify } from 'yaml'
import { ciCommand } from '../src/commands/ci.js'

describe('specpm ci', () => {
  let tempDir: string
  let origCwd: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-ci-'))
    origCwd = process.cwd()
    process.chdir(tempDir)

    // Create minimal specpm.yaml
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {},
    }))
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('passes for clean project with no specs', async () => {
    const result = await ciCommand({ reporter: 'text' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(true)
    }
  })

  it('fails when team config has missing required specs', async () => {
    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      required: ['@company/missing@^1.0.0'],
    }))

    const result = await ciCommand({ reporter: 'text' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passed).toBe(false)
      expect(result.value.teamIssues.length).toBeGreaterThan(0)
    }
  })

  it('returns error for missing specpm.yaml', async () => {
    await rm(join(tempDir, 'specpm.yaml'))
    const result = await ciCommand({})
    expect(result.ok).toBe(false)
  })
})

describe('specpm ci --reporter junit', () => {
  let tempDir: string
  let origCwd: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-ci-junit-'))
    origCwd = process.cwd()
    process.chdir(tempDir)
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {},
    }))
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('outputs valid JUnit XML', async () => {
    // Capture stdout
    const origLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    await ciCommand({ reporter: 'junit' })

    console.log = origLog
    expect(output).toContain('<?xml version="1.0"')
    expect(output).toContain('<testsuites')
    expect(output).toContain('</testsuites>')
  })
})

describe('specpm ci --reporter github', () => {
  let tempDir: string
  let origCwd: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specpm-ci-gh-'))
    origCwd = process.cwd()
    process.chdir(tempDir)
    await writeFile(join(tempDir, 'specpm.yaml'), stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {},
    }))
    await writeFile(join(tempDir, 'specpm-team.yaml'), stringify({
      required: ['@company/missing@^1.0.0'],
    }))
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('outputs GitHub Actions annotations', async () => {
    const origLog = console.log
    let output = ''
    console.log = (msg: string) => { output += msg }

    await ciCommand({ reporter: 'github' })

    console.log = origLog
    expect(output).toContain('::error')
    expect(output).toContain('Team compliance')
  })
})
