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

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
