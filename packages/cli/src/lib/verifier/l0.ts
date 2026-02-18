import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import Ajv from 'ajv'
import { specYamlSchema } from 'shared'
import type { SpecYaml, ConstraintsFile } from 'shared'

export interface VerificationIssue {
  level: number
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  file?: string
  path?: string
  suggestion?: string
}

export interface VerificationResult {
  level: 0
  passed: boolean
  issues: VerificationIssue[]
  timestamp: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function verifyL0(directory: string): Promise<VerificationResult> {
  const issues: VerificationIssue[] = []
  const specYamlPath = join(directory, 'spec.yaml')

  // Check spec.yaml exists
  if (!(await fileExists(specYamlPath))) {
    issues.push({
      level: 0, severity: 'error', code: 'L0-YAML-MISSING',
      message: 'spec.yaml not found', file: 'spec.yaml',
    })
    return { level: 0, passed: false, issues, timestamp: new Date().toISOString() }
  }

  // Parse YAML
  let raw: string
  let manifest: SpecYaml
  try {
    raw = await readFile(specYamlPath, 'utf-8')
    manifest = parseYaml(raw) as SpecYaml
  } catch (error) {
    issues.push({
      level: 0, severity: 'error', code: 'L0-YAML-PARSE',
      message: `Failed to parse spec.yaml: ${error}`, file: 'spec.yaml',
    })
    return { level: 0, passed: false, issues, timestamp: new Date().toISOString() }
  }

  if (manifest === null || typeof manifest !== 'object') {
    issues.push({
      level: 0, severity: 'error', code: 'L0-YAML-PARSE',
      message: 'spec.yaml is empty or not an object', file: 'spec.yaml',
    })
    return { level: 0, passed: false, issues, timestamp: new Date().toISOString() }
  }

  // Validate schema (required fields, name format, version format)
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(specYamlSchema)
  if (!validate(manifest)) {
    for (const error of validate.errors ?? []) {
      issues.push({
        level: 0, severity: 'error', code: 'L0-SCHEMA-INVALID',
        message: `${error.instancePath || '/'}: ${error.message}`,
        file: 'spec.yaml', path: error.instancePath || undefined,
      })
    }
  }

  // Package name format
  if (manifest.name && !/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(manifest.name)) {
    issues.push({
      level: 0, severity: 'error', code: 'L0-NAME-FORMAT',
      message: `Invalid package name format: ${manifest.name}. Expected @scope/name.`,
      file: 'spec.yaml', path: '/name',
    })
  }

  // Referenced files exist
  const allPaths = [
    ...(manifest.entities ?? []),
    ...(manifest.states ?? []),
    ...(manifest.docs ?? []),
    ...(manifest.constraints ? [manifest.constraints] : []),
  ]

  for (const filePath of allPaths) {
    if (!(await fileExists(join(directory, filePath)))) {
      issues.push({
        level: 0, severity: 'error', code: 'L0-FILE-MISSING',
        message: `Referenced file not found: ${filePath}`,
        file: filePath,
      })
    }
  }

  // Entity schemas valid JSON Schema
  for (const entityPath of manifest.entities ?? []) {
    const fullPath = join(directory, entityPath)
    if (!(await fileExists(fullPath))) continue
    try {
      const content = await readFile(fullPath, 'utf-8')
      const schema = JSON.parse(content)
      if (typeof schema !== 'object' || schema === null) {
        issues.push({
          level: 0, severity: 'error', code: 'L0-ENTITY-INVALID',
          message: `Entity schema is not a JSON object: ${entityPath}`,
          file: entityPath,
        })
      }
    } catch (error) {
      issues.push({
        level: 0, severity: 'error', code: 'L0-ENTITY-INVALID',
        message: `Invalid JSON in entity schema: ${entityPath}`,
        file: entityPath,
      })
    }
  }

  // State machines valid JSON
  for (const statePath of manifest.states ?? []) {
    const fullPath = join(directory, statePath)
    if (!(await fileExists(fullPath))) continue
    try {
      const content = await readFile(fullPath, 'utf-8')
      JSON.parse(content)
    } catch {
      issues.push({
        level: 0, severity: 'error', code: 'L0-STATE-INVALID',
        message: `Invalid JSON in state machine: ${statePath}`,
        file: statePath,
      })
    }
  }

  // Constraints YAML + unique IDs
  if (manifest.constraints) {
    const constraintsPath = join(directory, manifest.constraints)
    if (await fileExists(constraintsPath)) {
      try {
        const content = await readFile(constraintsPath, 'utf-8')
        const parsed = parseYaml(content) as ConstraintsFile
        const ids = new Set<string>()
        for (const constraint of parsed.constraints ?? []) {
          if (!constraint.id || !constraint.description || !constraint.type || !constraint.severity) {
            issues.push({
              level: 0, severity: 'error', code: 'L0-CONSTRAINT-FIELDS',
              message: `Constraint missing required fields (id, description, type, severity)`,
              file: manifest.constraints,
            })
          }
          if (constraint.id && ids.has(constraint.id)) {
            issues.push({
              level: 0, severity: 'error', code: 'L0-CONSTRAINT-DUPLICATE',
              message: `Duplicate constraint ID: ${constraint.id}`,
              file: manifest.constraints,
            })
          }
          if (constraint.id) ids.add(constraint.id)
        }
      } catch {
        issues.push({
          level: 0, severity: 'error', code: 'L0-CONSTRAINT-PARSE',
          message: `Failed to parse constraints file`,
          file: manifest.constraints,
        })
      }
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error')
  return { level: 0, passed: !hasErrors, issues, timestamp: new Date().toISOString() }
}
