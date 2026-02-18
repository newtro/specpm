import type { Rule } from 'eslint'
import { getSpecsForFile } from '../lib/spec-discovery.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn on unhandled state machine states from spec definitions',
    },
    messages: {
      unhandledState: 'State "{{state}}" from "{{machine}}" state machine is not handled',
    },
    schema: [],
  },
  create(context: Rule.RuleContext) {
    const specs = getSpecsForFile(context.filename)
    if (specs.length === 0) return {}

    // Collect state machines from specs
    const stateMachines: { name: string; states: string[] }[] = []
    for (const spec of specs) {
      for (const stateFile of spec.states) {
        const s = stateFile as Record<string, unknown>
        const name = (s.name ?? s.title ?? s.$id ?? 'unknown') as string
        const statesObj = (s.states ?? {}) as Record<string, unknown>
        const stateNames = Object.keys(statesObj)
        if (stateNames.length > 0) {
          stateMachines.push({ name, states: stateNames })
        }
      }
    }

    if (stateMachines.length === 0) return {}

    return {
      SwitchStatement(node: any) {
        // Check if discriminant refers to a state-like variable
        const discText = getNodeText(node.discriminant)
        if (!discText || !isStateLike(discText)) return

        const handledCases = new Set<string>()
        for (const c of node.cases ?? []) {
          if (c.test?.type === 'Literal' && typeof c.test.value === 'string') {
            handledCases.add(c.test.value)
          }
        }

        // Check each state machine
        for (const machine of stateMachines) {
          // Only report if at least one case matches a known state (confirms relevance)
          const matchCount = machine.states.filter(s => handledCases.has(s)).length
          if (matchCount === 0) continue

          for (const state of machine.states) {
            if (!handledCases.has(state)) {
              context.report({
                node,
                messageId: 'unhandledState',
                data: { state, machine: machine.name },
              })
            }
          }
        }
      },
    }
  },
}

function getNodeText(node: any): string {
  if (!node) return ''
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') {
    return `${getNodeText(node.object)}.${getNodeText(node.property)}`
  }
  return ''
}

function isStateLike(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('state') || lower.includes('status') || lower.includes('phase') || lower.includes('step')
}

export default rule
