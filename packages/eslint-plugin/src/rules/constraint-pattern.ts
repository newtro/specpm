import type { Rule } from 'eslint'
import { getSpecsForFile } from '../lib/spec-discovery.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Check that required function call patterns from spec constraints are present',
    },
    messages: {
      missingPattern: 'Missing required "{{required}}" call (constraint {{constraintId}}): {{description}}',
    },
    schema: [],
  },
  create(context: Rule.RuleContext) {
    const specs = getSpecsForFile(context.filename)
    if (specs.length === 0) return {}

    // Collect pattern constraints that require function calls
    const patternConstraints: { constraintId: string; required: string; description: string }[] = []
    for (const spec of specs) {
      for (const c of spec.constraints) {
        if (c.type !== 'pattern') continue
        const check = c.check as Record<string, unknown>
        if (check.pattern === 'function-call' && check.required) {
          patternConstraints.push({
            constraintId: c.id,
            required: check.required as string,
            description: c.description,
          })
        }
      }
    }

    if (patternConstraints.length === 0) return {}

    const foundCalls = new Set<string>()

    return {
      CallExpression(node: any) {
        let callText = ''
        const callee = node.callee
        if (callee.type === 'MemberExpression' && callee.object?.name && callee.property?.name) {
          callText = `${callee.object.name}.${callee.property.name}`
        } else if (callee.type === 'Identifier') {
          callText = callee.name
        }
        if (callText) {
          for (const pc of patternConstraints) {
            if (callText.includes(pc.required)) {
              foundCalls.add(pc.required)
            }
          }
        }
      },
      'Program:exit'(node: any) {
        for (const pc of patternConstraints) {
          if (!foundCalls.has(pc.required)) {
            context.report({
              node,
              messageId: 'missingPattern',
              data: {
                required: pc.required,
                constraintId: pc.constraintId,
                description: pc.description,
              },
            })
          }
        }
      },
    }
  },
}

export default rule
