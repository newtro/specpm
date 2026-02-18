import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkCommand } from '../src/commands/check.js'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

let tmpDir: string
let origCwd: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'specpm-check-'))
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(origCwd)
  await rm(tmpDir, { recursive: true, force: true })
})

async function setupProject(opts: {
  sourceCode: string
  constraints: Record<string, unknown>[]
  entities?: Record<string, unknown>[]
}): Promise<void> {
  // Create .specpm/specs/@test/pkg structure
  const specDir = join(tmpDir, '.specpm', 'specs', '@test', 'pkg')
  await mkdir(specDir, { recursive: true })
  await mkdir(join(specDir, 'entities'), { recursive: true })

  const entityPaths = (opts.entities ?? []).map((_, i) => `entities/e${i}.json`)

  await writeFile(join(specDir, 'spec.yaml'), stringify({
    name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    entities: entityPaths,
    constraints: 'constraints.yaml',
  }))

  await writeFile(join(specDir, 'constraints.yaml'), stringify({ constraints: opts.constraints }))

  for (let i = 0; i < (opts.entities ?? []).length; i++) {
    await writeFile(join(specDir, entityPaths[i]), JSON.stringify(opts.entities![i]))
  }

  // Create source file
  await mkdir(join(tmpDir, 'src'), { recursive: true })
  await writeFile(join(tmpDir, 'src', 'index.ts'), opts.sourceCode)
}

describe('specpm check', () => {
  it('passes when code satisfies entity constraints', async () => {
    await setupProject({
      sourceCode: `
        interface User {
          id: string
          email: string
          failedLoginAttempts: number
          lockedUntil: string
        }
      `,
      entities: [{
        $id: 'user', title: 'User', type: 'object',
        required: ['id', 'email'],
        properties: { id: { type: 'string' }, email: { type: 'string' } },
      }],
      constraints: [{
        id: 'c1', description: 'User must have required fields', type: 'entity', severity: 'error',
        check: { entity: 'User', requiredFields: ['failedLoginAttempts', 'lockedUntil'] },
      }],
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkCommand({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.summary.fail).toBe(0)
      expect(result.value.summary.pass).toBeGreaterThan(0)
    }
    errSpy.mockRestore()
  })

  it('fails when interface is missing required fields', async () => {
    await setupProject({
      sourceCode: `
        interface User {
          id: string
          email: string
        }
      `,
      entities: [{
        $id: 'user', title: 'User', type: 'object',
        required: ['id', 'email'],
        properties: { id: { type: 'string' }, email: { type: 'string' } },
      }],
      constraints: [{
        id: 'c1', description: 'User must have lockout fields', type: 'entity', severity: 'error',
        check: { entity: 'User', requiredFields: ['failedLoginAttempts', 'lockedUntil'] },
      }],
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkCommand({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.summary.fail).toBeGreaterThan(0)
    }
    errSpy.mockRestore()
  })

  it('passes when required function call is present', async () => {
    await setupProject({
      sourceCode: `
        import bcrypt from 'bcrypt'
        async function register(password: string) {
          const hash = await bcrypt.hash(password, 12)
          return hash
        }
      `,
      constraints: [{
        id: 'c1', description: 'Must use bcrypt', type: 'pattern', severity: 'error',
        check: { pattern: 'function-call', required: 'bcrypt.hash' },
      }],
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkCommand({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.summary.pass).toBeGreaterThan(0)
      expect(result.value.summary.fail).toBe(0)
    }
    errSpy.mockRestore()
  })

  it('fails when required function call is missing', async () => {
    await setupProject({
      sourceCode: `
        function register(password: string) {
          return password
        }
      `,
      constraints: [{
        id: 'c1', description: 'Must use bcrypt', type: 'pattern', severity: 'error',
        check: { pattern: 'function-call', required: 'bcrypt.hash' },
      }],
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkCommand({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.summary.fail).toBeGreaterThan(0)
    }
    errSpy.mockRestore()
  })

  it('outputs JSON with --json flag', async () => {
    await setupProject({
      sourceCode: `interface User { id: string }`,
      entities: [{ $id: 'user', title: 'User', type: 'object', required: ['id'], properties: { id: { type: 'string' } } }],
      constraints: [{
        id: 'c1', description: 'Check user', type: 'entity', severity: 'error',
        check: { entity: 'User' },
      }],
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await checkCommand({ json: true })
    expect(result.ok).toBe(true)
    expect(logSpy).toHaveBeenCalled()
    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output.summary).toBeDefined()
    expect(output.results).toBeDefined()
    logSpy.mockRestore()
  })

  it('handles no installed specs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkCommand({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results.length).toBe(0)
    }
    errSpy.mockRestore()
  })
})
