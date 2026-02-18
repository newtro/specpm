import type { Rule } from 'eslint'
import { getSpecsForFile, findProjectRoot, detectFramework } from '../lib/spec-discovery.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Validate route handler response shapes against spec API contracts',
    },
    messages: {
      missingResponseField: 'Route handler "{{handler}}" response is missing field "{{field}}" required by spec',
      shapeWarning: 'Route handler "{{handler}}" response shape may not match spec contract',
    },
    schema: [
      {
        type: 'object',
        properties: {
          framework: {
            type: 'string',
            enum: ['nextjs', 'express', 'fastify', 'auto'],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: Rule.RuleContext) {
    const specs = getSpecsForFile(context.filename)
    if (specs.length === 0) return {}

    // Collect API contract info from constraints
    const apiConstraints: { fields: string[]; constraintId: string }[] = []
    for (const spec of specs) {
      for (const c of spec.constraints) {
        const check = c.check as Record<string, unknown>
        if (check.responseFields) {
          apiConstraints.push({
            fields: check.responseFields as string[],
            constraintId: c.id,
          })
        }
      }
      // Also check entity schemas for API response shapes
      for (const entity of spec.entities) {
        const e = entity as Record<string, unknown>
        if (e.title && (e.title as string).toLowerCase().includes('response')) {
          const required = (e.required ?? []) as string[]
          if (required.length > 0) {
            apiConstraints.push({ fields: required, constraintId: `entity:${e.title}` })
          }
        }
      }
    }

    if (apiConstraints.length === 0) return {}

    const options = context.options[0] as { framework?: string } | undefined
    let framework = options?.framework ?? 'auto'
    if (framework === 'auto') {
      const root = findProjectRoot(context.filename)
      if (root) framework = detectFramework(root)
    }

    function checkResponseObject(node: any, handlerName: string) {
      // Look for object expression in return/response
      if (node.type !== 'ObjectExpression') return
      const propNames = new Set(
        node.properties
          ?.filter((p: any) => p.key?.name || p.key?.value)
          .map((p: any) => p.key.name ?? p.key.value) ?? [],
      )

      for (const ac of apiConstraints) {
        for (const field of ac.fields) {
          if (!propNames.has(field)) {
            context.report({
              node,
              messageId: 'missingResponseField',
              data: { handler: handlerName, field },
            })
          }
        }
      }
    }

    return {
      // Next.js App Router: export function GET/POST/etc
      'ExportNamedDeclaration > FunctionDeclaration'(node: any) {
        if (framework !== 'nextjs' && framework !== 'auto' && framework !== 'unknown') return
        const name = node.id?.name
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(name)) return
        // Check return statements for response shapes
        visitReturns(node.body, (ret: any) => {
          if (ret.argument?.type === 'ObjectExpression') {
            checkResponseObject(ret.argument, name)
          }
          // NextResponse.json({ ... })
          if (
            ret.argument?.type === 'CallExpression' &&
            ret.argument.arguments?.[0]?.type === 'ObjectExpression'
          ) {
            checkResponseObject(ret.argument.arguments[0], name)
          }
        })
      },
      // Express/Fastify: router.get/post/etc or app.get/post/etc
      'CallExpression'(node: any) {
        if (framework !== 'express' && framework !== 'fastify' && framework !== 'auto' && framework !== 'unknown') return
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const method = callee.property?.name
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return
        const objName = callee.object?.name
        if (!objName || !['router', 'app', 'server'].includes(objName)) return

        // Find callback argument
        const callback = node.arguments?.find(
          (a: any) => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression',
        )
        if (!callback?.body) return

        visitReturns(callback.body, (ret: any) => {
          if (ret.argument?.type === 'ObjectExpression') {
            checkResponseObject(ret.argument, `${objName}.${method}`)
          }
        })

        // Also check res.json() / res.send() calls
        visitCalls(callback.body, (call: any) => {
          const c = call.callee
          if (c.type === 'MemberExpression' && c.object?.name === 'res') {
            if (['json', 'send'].includes(c.property?.name)) {
              if (call.arguments?.[0]?.type === 'ObjectExpression') {
                checkResponseObject(call.arguments[0], `${objName}.${method}`)
              }
            }
          }
        })
      },
    }
  },
}

function visitReturns(node: any, cb: (ret: any) => void) {
  if (!node) return
  if (node.type === 'ReturnStatement') {
    cb(node)
    return
  }
  if (node.body) {
    if (Array.isArray(node.body)) {
      for (const child of node.body) visitReturns(child, cb)
    } else {
      visitReturns(node.body, cb)
    }
  }
  if (node.consequent) visitReturns(node.consequent, cb)
  if (node.alternate) visitReturns(node.alternate, cb)
  if (node.block) visitReturns(node.block, cb)
}

function visitCalls(node: any, cb: (call: any) => void) {
  if (!node) return
  if (node.type === 'CallExpression') {
    cb(node)
  }
  if (node.type === 'ExpressionStatement' && node.expression) {
    visitCalls(node.expression, cb)
  }
  if (node.body) {
    if (Array.isArray(node.body)) {
      for (const child of node.body) visitCalls(child, cb)
    } else {
      visitCalls(node.body, cb)
    }
  }
  if (node.consequent) visitCalls(node.consequent, cb)
  if (node.alternate) visitCalls(node.alternate, cb)
  if (node.block) visitCalls(node.block, cb)
  if (node.arguments) {
    for (const arg of node.arguments) visitCalls(arg, cb)
  }
}

export default rule
