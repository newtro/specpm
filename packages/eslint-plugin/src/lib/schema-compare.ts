/**
 * Utilities for comparing TypeScript AST nodes against JSON Schema definitions.
 */

export interface PropertyInfo {
  name: string
  typeText: string
}

export interface SchemaProperty {
  type?: string | string[]
  format?: string
  enum?: unknown[]
}

/**
 * Map JSON Schema types to TypeScript type strings.
 */
const schemaTypeToTs: Record<string, string[]> = {
  string: ['string'],
  number: ['number'],
  integer: ['number'],
  boolean: ['boolean'],
  array: ['Array', 'any[]', 'string[]', 'number[]', 'boolean[]'],
  object: ['object', 'Record'],
}

/**
 * Check if a TS type string is compatible with a JSON Schema type.
 */
export function isTypeCompatible(tsType: string, schemaType: string | string[] | undefined): boolean {
  if (!schemaType) return true // no type constraint
  const types = Array.isArray(schemaType) ? schemaType : [schemaType]

  for (const st of types) {
    const compatible = schemaTypeToTs[st]
    if (!compatible) continue
    if (compatible.some(c => tsType.includes(c))) return true
  }

  // 'any' is always compatible
  if (tsType === 'any') return true

  return false
}

/**
 * Compare interface properties against JSON Schema.
 * Returns list of issues found.
 */
export function compareToSchema(
  properties: PropertyInfo[],
  schema: Record<string, unknown>,
): { field: string; issue: 'missing' | 'type-mismatch'; expected?: string; got?: string }[] {
  const issues: { field: string; issue: 'missing' | 'type-mismatch'; expected?: string; got?: string }[] = []
  const schemaProps = (schema.properties ?? {}) as Record<string, SchemaProperty>
  const schemaRequired = (schema.required ?? []) as string[]
  const propMap = new Map(properties.map(p => [p.name, p]))

  for (const field of schemaRequired) {
    const prop = propMap.get(field)
    if (!prop) {
      issues.push({ field, issue: 'missing' })
      continue
    }
    // Type check
    const schemaProp = schemaProps[field]
    if (schemaProp?.type && !isTypeCompatible(prop.typeText, schemaProp.type)) {
      issues.push({
        field,
        issue: 'type-mismatch',
        expected: Array.isArray(schemaProp.type) ? schemaProp.type.join(' | ') : schemaProp.type,
        got: prop.typeText,
      })
    }
  }

  return issues
}
