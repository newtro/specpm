import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSpecPackage } from '../src/lib/loader.js'

async function createSpecDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specpm-test-'))
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath)
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'))
    await mkdir(parentDir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return dir
}

describe('loadSpecPackage', () => {
  const dirs: string[] = []

  afterEach(async () => {
    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  it('loads a valid minimal spec package', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "@test/minimal"
version: "1.0.0"
description: "A minimal test spec"
author: "test"
license: "MIT"
`,
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.manifest.name).toBe('@test/minimal')
      expect(result.value.entities).toEqual([])
      expect(result.value.constraints).toEqual([])
    }
  })

  it('loads a full spec package with entities, constraints, and docs', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "@test/full"
version: "2.0.0"
description: "Full test spec"
author: "test"
license: "MIT"
entities:
  - entities/user.schema.json
constraints: constraints/constraints.yaml
docs:
  - docs/overview.md
`,
      'entities/user.schema.json': JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'user',
        title: 'User',
        type: 'object',
        properties: { id: { type: 'string' } },
      }),
      'constraints/constraints.yaml': `
constraints:
  - id: "test-001"
    description: "Test constraint"
    type: "pattern"
    severity: "error"
    check:
      pattern: "test"
`,
      'docs/overview.md': '# Overview\n\nTest docs.',
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.entities).toHaveLength(1)
      expect(result.value.constraints).toHaveLength(1)
      expect(result.value.docs).toHaveLength(1)
    }
  })

  it('rejects missing spec.yaml', async () => {
    const dir = await createSpecDir({})
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error[0].message).toContain('not found')
    }
  })

  it('rejects invalid package name', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "bad-name"
version: "1.0.0"
description: "Bad name"
author: "test"
license: "MIT"
`,
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(false)
  })

  it('rejects path traversal in file references', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "@test/traversal"
version: "1.0.0"
description: "Path traversal test"
author: "test"
license: "MIT"
entities:
  - "../../../etc/passwd"
`,
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error[0].message).toContain('traversal')
    }
  })

  it('rejects when referenced files do not exist', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "@test/missing-files"
version: "1.0.0"
description: "Missing files"
author: "test"
license: "MIT"
entities:
  - entities/nonexistent.schema.json
`,
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error[0].message).toContain('not found')
    }
  })

  it('rejects duplicate constraint IDs', async () => {
    const dir = await createSpecDir({
      'spec.yaml': `
name: "@test/dup-constraints"
version: "1.0.0"
description: "Duplicate constraints"
author: "test"
license: "MIT"
constraints: constraints/constraints.yaml
`,
      'constraints/constraints.yaml': `
constraints:
  - id: "dup-001"
    description: "First"
    type: "pattern"
    severity: "error"
    check:
      pattern: "test"
  - id: "dup-001"
    description: "Duplicate"
    type: "pattern"
    severity: "error"
    check:
      pattern: "test"
`,
    })
    dirs.push(dir)

    const result = await loadSpecPackage(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error[0].message).toContain('Duplicate constraint ID')
    }
  })
})
