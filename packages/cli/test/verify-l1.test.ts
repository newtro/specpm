import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verifyL1 } from '../src/lib/verifier/l1.js'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'specpm-l1-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function setupPackage(opts: {
  manifest?: Record<string, unknown>
  entities?: Record<string, unknown>[]
  entityPaths?: string[]
  states?: Record<string, unknown>[]
  statePaths?: string[]
  constraints?: Record<string, unknown>[]
}): Promise<void> {
  const entityPaths = opts.entityPaths ?? (opts.entities ?? []).map((_, i) => `entities/e${i}.json`)
  const statePaths = opts.statePaths ?? (opts.states ?? []).map((_, i) => `states/s${i}.json`)

  const manifest = opts.manifest ?? {
    name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
    entities: entityPaths,
    states: statePaths,
    constraints: opts.constraints ? 'constraints.yaml' : undefined,
  }

  await writeFile(join(tmpDir, 'spec.yaml'), stringify(manifest))

  if (opts.entities) {
    await mkdir(join(tmpDir, 'entities'), { recursive: true })
    for (let i = 0; i < opts.entities.length; i++) {
      await writeFile(join(tmpDir, entityPaths[i]), JSON.stringify(opts.entities[i]))
    }
  }

  if (opts.states) {
    await mkdir(join(tmpDir, 'states'), { recursive: true })
    for (let i = 0; i < opts.states.length; i++) {
      await writeFile(join(tmpDir, statePaths[i]), JSON.stringify(opts.states[i]))
    }
  }

  if (opts.constraints) {
    await writeFile(join(tmpDir, 'constraints.yaml'), stringify({ constraints: opts.constraints }))
  }
}

describe('L1 verification', () => {
  it('passes valid package', async () => {
    await setupPackage({
      entities: [{ $id: 'user', title: 'User', type: 'object', properties: {} }],
      entityPaths: ['entities/user.json'],
      constraints: [
        { id: 'c1', description: 'Check user', type: 'entity', severity: 'error', check: { entity: 'User' } },
      ],
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('catches constraint referencing unknown entity', async () => {
    await setupPackage({
      entities: [{ $id: 'user', title: 'User', type: 'object', properties: {} }],
      entityPaths: ['entities/user.json'],
      constraints: [
        { id: 'c1', description: 'Check', type: 'entity', severity: 'error', check: { entity: 'Order' } },
      ],
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L1-CONSTRAINT-ENTITY-REF')).toBe(true)
  })

  it('catches state machine with invalid transition', async () => {
    await setupPackage({
      states: [{
        id: 'auth', states: {
          idle: { on: { LOGIN: 'loading' } },
          loading: { on: { SUCCESS: 'nonexistent' } },
        },
      }],
      statePaths: ['states/auth.json'],
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L1-STATE-INVALID-TRANSITION')).toBe(true)
  })

  it('catches constraint referencing unknown state', async () => {
    await setupPackage({
      states: [{
        id: 'auth', states: { idle: {}, loading: {} },
      }],
      statePaths: ['states/auth.json'],
      constraints: [
        { id: 'c1', description: 'Check', type: 'pattern', severity: 'error', check: { state: 'nonexistent' } },
      ],
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L1-CONSTRAINT-STATE-REF')).toBe(true)
  })

  it('warns on invalid context.priority', async () => {
    await setupPackage({
      manifest: {
        name: '@test/pkg', version: '1.0.0', description: 'Test', author: 'test', license: 'MIT',
        context: { priority: ['constraints', 'invalid-section'] },
      },
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(true) // warnings don't fail
    expect(result.issues.some(i => i.code === 'L1-CONTEXT-PRIORITY')).toBe(true)
  })

  it('passes package with no constraints', async () => {
    await setupPackage({
      entities: [{ $id: 'user', title: 'User', type: 'object' }],
      entityPaths: ['entities/user.json'],
    })

    const result = await verifyL1(tmpDir)
    expect(result.passed).toBe(true)
  })
})
