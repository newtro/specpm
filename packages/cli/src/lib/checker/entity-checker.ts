import type { SourceFile } from 'ts-morph'
import { findInterfaceDeclarations, getInterfaceProperties } from './ast-utils.js'
import type { ConstraintDefinition } from 'shared'

export interface CheckResult {
  package: string
  constraint: string
  description: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  file?: string
  line?: number
  message: string
  suggestion?: string
}

/**
 * Check that TypeScript interfaces match JSON Schema entity definitions.
 */
export function checkEntity(
  constraint: ConstraintDefinition,
  packageName: string,
  sourceFiles: SourceFile[],
  entities: Record<string, unknown>[],
): CheckResult[] {
  const results: CheckResult[] = []
  const check = constraint.check as Record<string, unknown>
  const entityName = check.entity as string
  if (!entityName) return results

  // Find the entity schema
  const schema = entities.find(e =>
    (e as Record<string, unknown>).title === entityName ||
    (e as Record<string, unknown>).$id === entityName
  ) as Record<string, unknown> | undefined

  if (!schema) {
    results.push({
      package: packageName, constraint: constraint.id, description: constraint.description,
      status: 'skip', message: `Entity schema "${entityName}" not found in spec`,
    })
    return results
  }

  const requiredFields = check.requiredFields as string[] | undefined
  const schemaProperties = (schema.properties ?? {}) as Record<string, unknown>
  const schemaRequired = (schema.required ?? []) as string[]

  // Find matching interface in source files
  let found = false
  for (const sf of sourceFiles) {
    const interfaces = findInterfaceDeclarations(sf, entityName)
    for (const iface of interfaces) {
      found = true
      const props = getInterfaceProperties(iface)
      const propNames = new Set(props.map(p => p.name))

      // Check required fields from constraint
      if (requiredFields) {
        for (const field of requiredFields) {
          if (!propNames.has(field)) {
            results.push({
              package: packageName, constraint: constraint.id, description: constraint.description,
              status: 'fail', file: sf.getFilePath(), line: iface.getStartLineNumber(),
              message: `Interface "${entityName}" missing required field "${field}"`,
              suggestion: `Add "${field}" property to ${entityName} interface`,
            })
          }
        }
      }

      // Check schema required fields
      for (const field of schemaRequired) {
        if (!propNames.has(field)) {
          results.push({
            package: packageName, constraint: constraint.id, description: constraint.description,
            status: 'fail', file: sf.getFilePath(), line: iface.getStartLineNumber(),
            message: `Interface "${entityName}" missing schema-required field "${field}"`,
          })
        }
      }

      if (results.filter(r => r.status === 'fail').length === 0) {
        results.push({
          package: packageName, constraint: constraint.id, description: constraint.description,
          status: 'pass', file: sf.getFilePath(), line: iface.getStartLineNumber(),
          message: `Interface "${entityName}" satisfies entity constraint`,
        })
      }
    }
  }

  if (!found) {
    results.push({
      package: packageName, constraint: constraint.id, description: constraint.description,
      status: 'fail',
      message: `Entity "${entityName}" not implemented — no interface found`,
      suggestion: `Create an interface named "${entityName}" matching the entity schema`,
    })
  }

  return results
}
