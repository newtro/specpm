import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import plugin, { clearSpecCache, findProjectRoot, loadInstalledSpecs, detectFramework } from '../src/index.js'
import { Linter } from 'eslint'
import tsParser from '@typescript-eslint/parser'

const TMP = join(tmpdir(), 'specpm-eslint-test-' + Date.now())

/** Create a Linter and verify code with plugin rules, handling ESLint 9 flat config properly. */
function lintCode(
  dir: string,
  code: string,
  rules: Record<string, string>,
  options?: { filename?: string; useTs?: boolean },
) {
  const filename = options?.filename ?? join(dir, 'src', 'file.js')
  const linter = new Linter({ cwd: dir })

  const config: any = {
    files: ['**/*.{js,ts,mjs,mts}'],
    plugins: { specpm: plugin as any },
    rules,
  }

  if (options?.useTs) {
    config.languageOptions = { parser: tsParser }
  }

  return linter.verify(code, [config], { filename })
}

function setupSpecProject(dir: string) {
  writeFileSync(join(dir, 'specpm.yaml'), 'name: test-project\nversion: 1.0.0\n')

  const specDir = join(dir, '.specpm', 'specs', '@auth', 'email-password')
  mkdirSync(specDir, { recursive: true })
  mkdirSync(join(specDir, 'entities'), { recursive: true })
  mkdirSync(join(specDir, 'constraints'), { recursive: true })
  mkdirSync(join(specDir, 'docs'), { recursive: true })

  writeFileSync(join(specDir, 'spec.yaml'), `name: "@auth/email-password"
version: "1.0.0"
description: "Test auth spec"
author: "test"
license: "MIT"
entities:
  - entities/user.schema.json
constraints: constraints/constraints.yaml
docs:
  - docs/overview.md
`)

  writeFileSync(join(specDir, 'entities', 'user.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'user',
    title: 'User',
    type: 'object',
    required: ['id', 'email', 'passwordHash'],
    properties: {
      id: { type: 'string' },
      email: { type: 'string' },
      passwordHash: { type: 'string' },
      role: { type: 'string' },
    },
  }))

  writeFileSync(join(specDir, 'constraints', 'constraints.yaml'), `constraints:
  - id: "auth-001"
    description: "Passwords must be hashed using bcrypt"
    type: "pattern"
    severity: "error"
    check:
      pattern: "function-call"
      required: "bcrypt.hash"
  - id: "auth-002"
    description: "User entity must have required fields"
    type: "entity"
    severity: "error"
    check:
      entity: "User"
      requiredFields: ["id", "email", "passwordHash"]
`)

  writeFileSync(join(specDir, 'docs', 'overview.md'), '# Auth\nOverview docs.\n')
}

function setupStateMachineProject(dir: string) {
  writeFileSync(join(dir, 'specpm.yaml'), 'name: state-project\nversion: 1.0.0\n')

  const specDir = join(dir, '.specpm', 'specs', '@flow', 'auth')
  mkdirSync(specDir, { recursive: true })
  mkdirSync(join(specDir, 'states'), { recursive: true })
  mkdirSync(join(specDir, 'docs'), { recursive: true })

  writeFileSync(join(specDir, 'spec.yaml'), `name: "@flow/auth"
version: "1.0.0"
description: "Auth flow spec"
author: "test"
license: "MIT"
states:
  - states/auth-flow.json
docs:
  - docs/overview.md
`)

  writeFileSync(join(specDir, 'states', 'auth-flow.json'), JSON.stringify({
    name: 'authFlow',
    states: {
      idle: { transitions: ['authenticating'] },
      authenticating: { transitions: ['authenticated', 'failed'] },
      authenticated: { transitions: ['refreshing', 'idle'] },
      refreshing: { transitions: ['authenticated', 'failed'] },
      failed: { transitions: ['idle'] },
    },
  }))

  writeFileSync(join(specDir, 'docs', 'overview.md'), '# Flow\n')
}

describe('eslint-plugin-specpm', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true })
    clearSpecCache()
  })

  afterEach(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true, force: true })
    }
  })

  // TASK 5.1: Plugin scaffold
  describe('plugin structure', () => {
    it('exports rules object', () => {
      expect(plugin.rules).toBeDefined()
      expect(plugin.rules['entity-match']).toBeDefined()
      expect(plugin.rules['constraint-pattern']).toBeDefined()
      expect(plugin.rules['endpoint-shape']).toBeDefined()
      expect(plugin.rules['state-coverage']).toBeDefined()
    })

    it('exports configs object', () => {
      expect(plugin.configs).toBeDefined()
      expect(plugin.configs.recommended).toBeDefined()
      expect(plugin.configs.strict).toBeDefined()
    })

    it('plugin meta is set', () => {
      expect(plugin.meta.name).toBe('eslint-plugin-specpm')
    })
  })

  // TASK 5.2: Spec discovery
  describe('spec discovery', () => {
    it('finds project root with specpm.yaml', () => {
      const dir = join(TMP, 'discovery')
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'specpm.yaml'), 'name: test\n')
      expect(findProjectRoot(join(dir, 'src', 'index.ts'))).toBe(dir)
    })

    it('returns null when no specpm.yaml', () => {
      const dir = join(TMP, 'no-spec')
      mkdirSync(dir, { recursive: true })
      expect(findProjectRoot(join(dir, 'index.ts'))).toBeNull()
    })

    it('loads installed specs', () => {
      const dir = join(TMP, 'load-specs')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)
      const specs = loadInstalledSpecs(dir)
      expect(specs.length).toBe(1)
      expect(specs[0].manifest.name).toBe('@auth/email-password')
    })

    it('returns empty array when no .specpm directory', () => {
      const dir = join(TMP, 'empty')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'specpm.yaml'), 'name: test\n')
      const specs = loadInstalledSpecs(dir)
      expect(specs).toEqual([])
    })
  })

  // TASK 5.3: entity-match rule
  describe('specpm/entity-match', () => {
    it('passes when interface has all required fields', () => {
      const dir = join(TMP, 'entity-pass')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `interface User {
  id: string;
  email: string;
  passwordHash: string;
}`
      const messages = lintCode(dir, code, { 'specpm/entity-match': 'error' }, {
        filename: join(dir, 'src', 'models.ts'),
        useTs: true,
      })

      expect(messages.filter(m => m.ruleId === 'specpm/entity-match')).toHaveLength(0)
    })

    it('reports missing required field', () => {
      const dir = join(TMP, 'entity-fail')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `interface User {
  id: string;
  email: string;
}`
      const messages = lintCode(dir, code, { 'specpm/entity-match': 'error' }, {
        filename: join(dir, 'src', 'models.ts'),
        useTs: true,
      })

      const errors = messages.filter(m => m.ruleId === 'specpm/entity-match')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('passwordHash')
    })

    it('reports type mismatch', () => {
      const dir = join(TMP, 'entity-type')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `interface User {
  id: number;
  email: string;
  passwordHash: string;
}`
      const messages = lintCode(dir, code, { 'specpm/entity-match': 'error' }, {
        filename: join(dir, 'src', 'models.ts'),
        useTs: true,
      })

      const errors = messages.filter(m => m.ruleId === 'specpm/entity-match')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('type')
    })
  })

  // TASK 5.4: constraint-pattern rule
  describe('specpm/constraint-pattern', () => {
    it('passes when required function call is present', () => {
      const dir = join(TMP, 'pattern-pass')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `const hash = bcrypt.hash(password, 12);`
      const messages = lintCode(dir, code, { 'specpm/constraint-pattern': 'error' })

      const errors = messages.filter(m => m.ruleId === 'specpm/constraint-pattern')
      expect(errors).toHaveLength(0)
    })

    it('reports missing required function call', () => {
      const dir = join(TMP, 'pattern-fail')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `const password = 'plain';`
      const messages = lintCode(dir, code, { 'specpm/constraint-pattern': 'error' })

      const errors = messages.filter(m => m.ruleId === 'specpm/constraint-pattern')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('bcrypt.hash')
    })
  })

  // TASK 5.5: endpoint-shape rule
  describe('specpm/endpoint-shape', () => {
    it('no errors when no API constraints defined', () => {
      const dir = join(TMP, 'endpoint-noconstraint')
      mkdirSync(dir, { recursive: true })
      setupSpecProject(dir)

      const code = `export function GET() { return { data: 'ok' }; }`
      const messages = lintCode(dir, code, { 'specpm/endpoint-shape': 'error' })

      expect(messages.filter(m => m.ruleId === 'specpm/endpoint-shape')).toHaveLength(0)
    })
  })

  // TASK 5.6: state-coverage rule
  describe('specpm/state-coverage', () => {
    it('passes when all states are handled', () => {
      const dir = join(TMP, 'state-pass')
      mkdirSync(dir, { recursive: true })
      setupStateMachineProject(dir)

      const code = `switch (state) {
  case 'idle': break;
  case 'authenticating': break;
  case 'authenticated': break;
  case 'refreshing': break;
  case 'failed': break;
}`
      const messages = lintCode(dir, code, { 'specpm/state-coverage': 'warn' })

      expect(messages.filter(m => m.ruleId === 'specpm/state-coverage')).toHaveLength(0)
    })

    it('warns on missing state', () => {
      const dir = join(TMP, 'state-fail')
      mkdirSync(dir, { recursive: true })
      setupStateMachineProject(dir)

      const code = `switch (state) {
  case 'idle': break;
  case 'authenticating': break;
  case 'authenticated': break;
}`
      const messages = lintCode(dir, code, { 'specpm/state-coverage': 'warn' })

      const warnings = messages.filter(m => m.ruleId === 'specpm/state-coverage')
      expect(warnings.length).toBe(2) // missing 'refreshing' and 'failed'
      const msgTexts = warnings.map(w => w.message)
      expect(msgTexts.some(m => m.includes('refreshing'))).toBe(true)
      expect(msgTexts.some(m => m.includes('failed'))).toBe(true)
    })
  })

  // TASK 5.7: Framework auto-detection
  describe('framework detection', () => {
    it('detects Next.js', () => {
      const dir = join(TMP, 'detect-next')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }))
      expect(detectFramework(dir)).toBe('nextjs')
    })

    it('detects Express', () => {
      const dir = join(TMP, 'detect-express')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { express: '4.0.0' } }))
      expect(detectFramework(dir)).toBe('express')
    })

    it('detects Fastify', () => {
      const dir = join(TMP, 'detect-fastify')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { fastify: '4.0.0' } }))
      expect(detectFramework(dir)).toBe('fastify')
    })

    it('returns unknown when no framework', () => {
      const dir = join(TMP, 'detect-none')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
      expect(detectFramework(dir)).toBe('unknown')
    })
  })

  // TASK 5.8: Config presets
  describe('config presets', () => {
    it('recommended config has correct rule levels', () => {
      const rec = plugin.configs.recommended
      expect(rec.rules['specpm/entity-match']).toBe('error')
      expect(rec.rules['specpm/constraint-pattern']).toBe('error')
      expect(rec.rules['specpm/endpoint-shape']).toBe('warn')
      expect(rec.rules['specpm/state-coverage']).toBe('warn')
    })

    it('strict config has all rules as error', () => {
      const strict = plugin.configs.strict
      expect(strict.rules['specpm/entity-match']).toBe('error')
      expect(strict.rules['specpm/constraint-pattern']).toBe('error')
      expect(strict.rules['specpm/endpoint-shape']).toBe('error')
      expect(strict.rules['specpm/state-coverage']).toBe('error')
    })

    it('configs include plugin reference', () => {
      expect(plugin.configs.recommended.plugins.specpm).toBe(plugin)
      expect(plugin.configs.strict.plugins.specpm).toBe(plugin)
    })
  })

  // No-op behavior
  describe('no-op in non-specpm projects', () => {
    it('all rules pass silently when no specpm.yaml', () => {
      const dir = join(TMP, 'no-specpm')
      mkdirSync(dir, { recursive: true })

      const code = `const x = 1;`
      const messages = lintCode(dir, code, {
        'specpm/entity-match': 'error',
        'specpm/constraint-pattern': 'error',
        'specpm/endpoint-shape': 'error',
        'specpm/state-coverage': 'warn',
      })

      expect(messages.filter(m => m.ruleId !== null)).toHaveLength(0)
    })
  })
})
