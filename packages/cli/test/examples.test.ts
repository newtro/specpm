import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { loadSpecPackage } from '../src/lib/loader.js'

const examplesDir = join(import.meta.dirname, '../../../examples')

describe('example spec packages', () => {
  it('loads auth-email-password example', async () => {
    const result = await loadSpecPackage(join(examplesDir, 'auth-email-password'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.manifest.name).toBe('@auth/email-password')
      expect(result.value.entities).toHaveLength(2)
      expect(result.value.constraints).toHaveLength(4)
      expect(result.value.docs).toHaveLength(2)
    }
  })

  it('loads data-pagination example', async () => {
    const result = await loadSpecPackage(join(examplesDir, 'data-pagination'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.manifest.name).toBe('@data/pagination')
      expect(result.value.entities).toHaveLength(1)
      expect(result.value.constraints).toHaveLength(2)
      expect(result.value.docs).toHaveLength(1)
    }
  })
})
