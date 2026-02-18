import type { Rule } from 'eslint'
import { getSpecsForFile } from '../lib/spec-discovery.js'
import { compareToSchema } from '../lib/schema-compare.js'
import type { PropertyInfo } from '../lib/schema-compare.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Validate TypeScript interfaces match spec entity schemas',
    },
    messages: {
      missingField: 'Interface "{{name}}" is missing required field "{{field}}" defined in {{spec}} entity schema',
      typeMismatch: 'Interface "{{name}}" field "{{field}}" has type "{{got}}" but spec expects "{{expected}}"',
    },
    schema: [],
  },
  create(context: Rule.RuleContext) {
    const specs = getSpecsForFile(context.filename)
    if (specs.length === 0) return {}

    // Collect entity schemas by name
    const entitySchemas = new Map<string, { schema: Record<string, unknown>; specName: string }>()
    for (const spec of specs) {
      for (const entity of spec.entities) {
        const e = entity as Record<string, unknown>
        const name = (e.title ?? e.$id) as string
        if (name) {
          entitySchemas.set(name, { schema: e, specName: spec.manifest.name })
        }
      }
    }

    if (entitySchemas.size === 0) return {}

    function checkDeclaration(
      node: any,
      name: string,
      properties: PropertyInfo[],
    ) {
      const entry = entitySchemas.get(name)
      if (!entry) return

      const issues = compareToSchema(properties, entry.schema)
      for (const issue of issues) {
        if (issue.issue === 'missing') {
          context.report({
            node,
            messageId: 'missingField',
            data: { name, field: issue.field, spec: entry.specName },
          })
        } else if (issue.issue === 'type-mismatch') {
          context.report({
            node,
            messageId: 'typeMismatch',
            data: { name, field: issue.field, expected: issue.expected!, got: issue.got! },
          })
        }
      }
    }

    return {
      TSInterfaceDeclaration(node: any) {
        const name = node.id?.name
        if (!name) return
        const properties: PropertyInfo[] = (node.body?.body ?? [])
          .filter((m: any) => m.type === 'TSPropertySignature' && m.key?.name)
          .map((m: any) => ({
            name: m.key.name,
            typeText: extractTypeText(m.typeAnnotation),
          }))
        checkDeclaration(node, name, properties)
      },
      TSTypeAliasDeclaration(node: any) {
        const name = node.id?.name
        if (!name) return
        if (node.typeAnnotation?.type !== 'TSTypeLiteral') return
        const properties: PropertyInfo[] = (node.typeAnnotation.members ?? [])
          .filter((m: any) => m.type === 'TSPropertySignature' && m.key?.name)
          .map((m: any) => ({
            name: m.key.name,
            typeText: extractTypeText(m.typeAnnotation),
          }))
        checkDeclaration(node, name, properties)
      },
    }
  },
}

function extractTypeText(typeAnnotation: any): string {
  if (!typeAnnotation?.typeAnnotation) return 'any'
  const t = typeAnnotation.typeAnnotation
  switch (t.type) {
    case 'TSStringKeyword': return 'string'
    case 'TSNumberKeyword': return 'number'
    case 'TSBooleanKeyword': return 'boolean'
    case 'TSAnyKeyword': return 'any'
    case 'TSArrayType': return 'Array'
    case 'TSObjectKeyword': return 'object'
    default: return 'any'
  }
}

export default rule
