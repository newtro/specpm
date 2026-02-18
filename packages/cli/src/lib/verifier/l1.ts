import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { SpecYaml, ConstraintsFile } from 'shared'
import type { VerificationIssue, VerificationResult } from './l0.js'

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

export interface L1VerificationResult {
  level: 1
  passed: boolean
  issues: VerificationIssue[]
  timestamp: string
}

export async function verifyL1(directory: string): Promise<L1VerificationResult> {
  const issues: VerificationIssue[] = []
  const specYamlPath = join(directory, 'spec.yaml')

  const raw = await readFile(specYamlPath, 'utf-8')
  const manifest = parseYaml(raw) as SpecYaml

  // Load entity names from schema files
  const entityNames = new Set<string>()
  for (const entityPath of manifest.entities ?? []) {
    const fullPath = join(directory, entityPath)
    if (!(await fileExists(fullPath))) continue
    try {
      const content = await readFile(fullPath, 'utf-8')
      const schema = JSON.parse(content)
      if (schema.title) entityNames.add(schema.title)
      if (schema.$id) entityNames.add(schema.$id)
    } catch {
      // L0 handles parse errors
    }
  }

  // Load state machine states
  const stateMachineStates = new Map<string, Set<string>>()
  for (const statePath of manifest.states ?? []) {
    const fullPath = join(directory, statePath)
    if (!(await fileExists(fullPath))) continue
    try {
      const content = await readFile(fullPath, 'utf-8')
      const machine = JSON.parse(content)
      const states = new Set<string>()
      if (machine.states && typeof machine.states === 'object') {
        for (const stateName of Object.keys(machine.states)) {
          states.add(stateName)
        }
      }
      const machineName = machine.id ?? statePath
      stateMachineStates.set(machineName, states)

      // Check state machine transitions reference valid states
      for (const [stateName, stateDef] of Object.entries(machine.states ?? {})) {
        const def = stateDef as Record<string, unknown>
        if (def.on && typeof def.on === 'object') {
          for (const [event, transition] of Object.entries(def.on as Record<string, unknown>)) {
            const target = typeof transition === 'string' ? transition
              : (transition as Record<string, unknown>)?.target as string | undefined
            if (target && !states.has(target)) {
              issues.push({
                level: 1, severity: 'error', code: 'L1-STATE-INVALID-TRANSITION',
                message: `State "${stateName}" transitions to unknown state "${target}" on event "${event}"`,
                file: statePath,
              })
            }
          }
        }
      }
    } catch {
      // L0 handles parse errors
    }
  }

  // Check constraints cross-references
  if (manifest.constraints) {
    const constraintsPath = join(directory, manifest.constraints)
    if (await fileExists(constraintsPath)) {
      try {
        const content = await readFile(constraintsPath, 'utf-8')
        const parsed = parseYaml(content) as ConstraintsFile

        for (const constraint of parsed.constraints ?? []) {
          const check = constraint.check as Record<string, unknown>

          // Entity constraints must reference valid entities
          if (constraint.type === 'entity' && check.entity) {
            const entityName = check.entity as string
            if (!entityNames.has(entityName)) {
              issues.push({
                level: 1, severity: 'error', code: 'L1-CONSTRAINT-ENTITY-REF',
                message: `Constraint "${constraint.id}" references unknown entity "${entityName}"`,
                file: manifest.constraints,
              })
            }
          }

          // Pattern constraints referencing states must reference valid states
          if (constraint.type === 'pattern' && check.state) {
            const stateName = check.state as string
            let found = false
            for (const states of stateMachineStates.values()) {
              if (states.has(stateName)) { found = true; break }
            }
            if (!found) {
              issues.push({
                level: 1, severity: 'error', code: 'L1-CONSTRAINT-STATE-REF',
                message: `Constraint "${constraint.id}" references unknown state "${stateName}"`,
                file: manifest.constraints,
              })
            }
          }
        }
      } catch {
        // L0 handles parse errors
      }
    }
  }

  // Check context.priority references valid section types
  const validSections = new Set(['constraints', 'entities', 'states', 'docs'])
  if (manifest.context?.priority) {
    for (const section of manifest.context.priority) {
      if (!validSections.has(section)) {
        issues.push({
          level: 1, severity: 'warning', code: 'L1-CONTEXT-PRIORITY',
          message: `context.priority references unknown section type "${section}"`,
          file: 'spec.yaml',
        })
      }
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error')
  return { level: 1, passed: !hasErrors, issues, timestamp: new Date().toISOString() }
}
