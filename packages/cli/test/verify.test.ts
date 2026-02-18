import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyL0 } from '../src/lib/verifier/l0.js'

async function createSpecDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-verify-'))
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath)
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'))
    await mkdir(parentDir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return dir
}

const VALID_SPEC = `
name: "@auth/email-password"
version: "1.0.0"
description: "Email auth"
author: "test"
license: "MIT"
entities:
  - entities/user.schema.json
constraints: constraints/constraints.yaml
`

const VALID_ENTITY = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'User',
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
})

const VALID_CONSTRAINTS = `
constraints:
  - id: "auth-001"
    description: "Hash passwords"
    type: "pattern"
    severity: "error"
    check:
      pattern: "bcrypt"
`

describe('verifyL0', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('passes for a valid package', async () => {
    const dir = await createSpecDir({
      'spec.yaml': VALID_SPEC,
      'entities/user.schema.json': VALID_ENTITY,
      'constraints/constraints.yaml': VALID_CONSTRAINTS,
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('fails when spec.yaml is missing', async () => {
    const dir = await createSpecDir({})
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    expect(result.issues[0].code).toBe('L0-YAML-MISSING')
  })

  it('fails for invalid YAML', async () => {
    const dir = await createSpecDir({ 'spec.yaml': ':::invalid' })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
  })

  it('fails when required fields are missing', async () => {
    const dir = await createSpecDir({
      'spec.yaml': 'name: "@test/pkg"\nversion: "1.0.0"\n',
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L0-SCHEMA-INVALID')).toBe(true)
  })

  it('fails when referenced files are missing', async () => {
    const dir = await createSpecDir({
      'spec.yaml': VALID_SPEC,
      'constraints/constraints.yaml': VALID_CONSTRAINTS,
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L0-FILE-MISSING')).toBe(true)
  })

  it('fails for invalid entity JSON', async () => {
    const dir = await createSpecDir({
      'spec.yaml': VALID_SPEC,
      'entities/user.schema.json': 'not json',
      'constraints/constraints.yaml': VALID_CONSTRAINTS,
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L0-ENTITY-INVALID')).toBe(true)
  })

  it('fails for duplicate constraint IDs', async () => {
    const dir = await createSpecDir({
      'spec.yaml': VALID_SPEC,
      'entities/user.schema.json': VALID_ENTITY,
      'constraints/constraints.yaml': `
constraints:
  - id: "dup-001"
    description: "First"
    type: "pattern"
    severity: "error"
    check: {}
  - id: "dup-001"
    description: "Second"
    type: "pattern"
    severity: "error"
    check: {}
`,
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.code === 'L0-CONSTRAINT-DUPLICATE')).toBe(true)
  })

  it('fails for invalid package name format', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "bad-name"
version: "1.0.0"
description: "test"
author: "test"
license: "MIT"
`,
    })
    dirs.push(dir)
    const result = await verifyL0(dir)
    expect(result.passed).toBe(false)
    // Should fail on schema validation (name pattern)
    expect(result.issues.some(i => i.severity === 'error')).toBe(true)
  })
})
