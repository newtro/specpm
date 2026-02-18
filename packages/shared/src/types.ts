export interface SpecYaml {
  name: string
  version: string
  description: string
  author: string
  license: string
  tags?: string[]
  specpm?: string
  entities?: string[]
  states?: string[]
  constraints?: string
  docs?: string[]
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  context?: {
    priority?: string[]
    tokenBudget?: number
  }
}

export interface ConstraintDefinition {
  id: string
  description: string
  type: 'pattern' | 'entity' | 'structural'
  severity: 'error' | 'warning'
  check: Record<string, unknown>
}

export interface ConstraintsFile {
  constraints: ConstraintDefinition[]
}

export interface SpecPackage {
  manifest: SpecYaml
  directory: string
  entities: Record<string, unknown>[]
  states: Record<string, unknown>[]
  constraints: ConstraintDefinition[]
  docs: string[]
}

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export type ValidationError = {
  path: string
  message: string
}
