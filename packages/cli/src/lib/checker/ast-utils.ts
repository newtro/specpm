import { Project, SourceFile, SyntaxKind, type InterfaceDeclaration, type TypeAliasDeclaration } from 'ts-morph'

/**
 * Create a ts-morph project for analyzing source files.
 */
export function createProject(tsConfigPath?: string): Project {
  if (tsConfigPath) {
    return new Project({ tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: true })
  }
  return new Project({ useInMemoryFileSystem: false, compilerOptions: { strict: true } })
}

/**
 * Find all exported declarations from a source file.
 */
export function findExports(sourceFile: SourceFile): { name: string; kind: string }[] {
  const exports: { name: string; kind: string }[] = []

  for (const decl of sourceFile.getExportedDeclarations()) {
    const [name, nodes] = [decl[0], decl[1]]
    for (const node of nodes) {
      exports.push({ name, kind: node.getKindName() })
    }
  }

  return exports
}

/**
 * Find all function calls matching a pattern (e.g., "bcrypt.hash").
 */
export function findFunctionCalls(sourceFile: SourceFile, pattern?: string): { name: string; line: number }[] {
  const calls: { name: string; line: number }[] = []

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const callExpr = node.asKind(SyntaxKind.CallExpression)!
      const exprText = callExpr.getExpression().getText()
      if (!pattern || exprText.includes(pattern)) {
        calls.push({ name: exprText, line: node.getStartLineNumber() })
      }
    }
  })

  return calls
}

/**
 * Find all interface declarations, optionally by name.
 */
export function findInterfaceDeclarations(sourceFile: SourceFile, name?: string): InterfaceDeclaration[] {
  const interfaces = sourceFile.getInterfaces()
  if (name) {
    return interfaces.filter(i => i.getName() === name)
  }
  return interfaces
}

/**
 * Find all type alias declarations, optionally by name.
 */
export function findTypeAliases(sourceFile: SourceFile, name?: string): TypeAliasDeclaration[] {
  const aliases = sourceFile.getTypeAliases()
  if (name) {
    return aliases.filter(a => a.getName() === name)
  }
  return aliases
}

/**
 * Get interface properties as { name, type, optional } tuples.
 */
export function getInterfaceProperties(iface: InterfaceDeclaration): { name: string; type: string; optional: boolean }[] {
  return iface.getProperties().map(prop => ({
    name: prop.getName(),
    type: prop.getType().getText(),
    optional: prop.hasQuestionToken(),
  }))
}

/**
 * Check if a source file has a try-catch wrapping calls to a given function.
 */
export function findTryCatchWrappedCalls(sourceFile: SourceFile, functionPattern: string): { name: string; line: number; wrapped: boolean }[] {
  const results: { name: string; line: number; wrapped: boolean }[] = []

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const callExpr = node.asKind(SyntaxKind.CallExpression)!
      const exprText = callExpr.getExpression().getText()
      if (exprText.includes(functionPattern)) {
        // Check if ancestor is a try block
        let parent = node.getParent()
        let wrapped = false
        while (parent) {
          if (parent.getKind() === SyntaxKind.TryStatement) {
            wrapped = true
            break
          }
          // Also check .catch() chains
          if (parent.getKind() === SyntaxKind.CallExpression) {
            const parentCall = parent.asKind(SyntaxKind.CallExpression)!
            if (parentCall.getExpression().getText().endsWith('.catch')) {
              wrapped = true
              break
            }
          }
          parent = parent.getParent()
        }
        results.push({ name: exprText, line: node.getStartLineNumber(), wrapped })
      }
    }
  })

  return results
}
