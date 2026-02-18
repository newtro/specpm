import { describe, it, expect } from 'vitest'
import type { SpecYaml, Result } from '../src/types.js'

describe('types', () => {
  it('SpecYaml type accepts valid spec', () => {
    const spec: SpecYaml = {
      name: '@auth/oauth2',
      version: '1.0.0',
      description: 'Test spec',
      author: 'test',
      license: 'MIT',
    }
    expect(spec.name).toBe('@auth/oauth2')
  })

  it('Result type works for success', () => {
    const result: Result<string> = { ok: true, value: 'hello' }
    expect(result.ok).toBe(true)
  })

  it('Result type works for failure', () => {
    const result: Result<string> = { ok: false, error: new Error('fail') }
    expect(result.ok).toBe(false)
  })
})
