import type { SourceFile } from 'ts-morph'
import { findFunctionCalls } from './ast-utils.js'
import type { ConstraintDefinition } from 'shared'
import type { CheckResult } from './entity-checker.js'

/**
 * Check for required function calls/patterns from constraints.
 */
export function checkPattern(
  constraint: ConstraintDefinition,
  packageName: string,
  sourceFiles: SourceFile[],
): CheckResult[] {
  const results: CheckResult[] = []
  const check = constraint.check as Record<string, unknown>
  const pattern = check.pattern as string
  const required = check.required as string | undefined

  if (pattern === 'function-call' && required) {
    let found = false
    for (const sf of sourceFiles) {
      const calls = findFunctionCalls(sf, required)
      if (calls.length > 0) {
        found = true
        results.push({
          package: packageName, constraint: constraint.id, description: constraint.description,
          status: 'pass', file: sf.getFilePath(), line: calls[0].line,
          message: `Found required function call "${required}"`,
        })
        break
      }
    }
    if (!found) {
      results.push({
        package: packageName, constraint: constraint.id, description: constraint.description,
        status: 'fail',
        message: `Required function call "${required}" not found in any source file`,
        suggestion: `Ensure your code calls "${required}"`,
      })
    }
  } else {
    // Generic pattern - just report as skip for now
    results.push({
      package: packageName, constraint: constraint.id, description: constraint.description,
      status: 'skip',
      message: `Pattern type "${pattern}" not yet supported for automated checking`,
    })
  }

  return results
}
