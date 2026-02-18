import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Result } from 'shared'

export interface TeamConfig {
  required?: string[]
  recommended?: string[]
  overrides?: Record<string, unknown>
  context?: {
    targets?: string[]
    enforced?: boolean
  }
  check?: {
    strict?: boolean
    'required-level'?: number
  }
  registries?: {
    allowed?: string[]
  }
}

const TEAM_CONFIG_FILE = 'specpm-team.yaml'

export async function loadTeamConfig(projectRoot: string): Promise<Result<TeamConfig | null, string>> {
  const configPath = join(projectRoot, TEAM_CONFIG_FILE)
  try {
    await access(configPath)
  } catch {
    return { ok: true, value: null }
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const parsed = parseYaml(content) as TeamConfig

    if (parsed === null || typeof parsed !== 'object') {
      return { ok: false, error: 'specpm-team.yaml is empty or not a valid YAML object' }
    }

    // Validate required field is array of strings
    if (parsed.required !== undefined) {
      if (!Array.isArray(parsed.required)) {
        return { ok: false, error: '"required" must be an array of package specifiers' }
      }
      for (const entry of parsed.required) {
        if (typeof entry !== 'string') {
          return { ok: false, error: `Invalid required entry: ${JSON.stringify(entry)}. Must be a string like "@scope/name@^1.0.0"` }
        }
      }
    }

    if (parsed.recommended !== undefined && !Array.isArray(parsed.recommended)) {
      return { ok: false, error: '"recommended" must be an array of package specifiers' }
    }

    if (parsed.context !== undefined && typeof parsed.context !== 'object') {
      return { ok: false, error: '"context" must be an object' }
    }

    if (parsed.check !== undefined && typeof parsed.check !== 'object') {
      return { ok: false, error: '"check" must be an object' }
    }

    return { ok: true, value: parsed }
  } catch (error) {
    return { ok: false, error: `Failed to parse specpm-team.yaml: ${error}` }
  }
}

export interface ParsedRequirement {
  name: string
  versionRange: string | null
}

export function parseRequirement(spec: string): ParsedRequirement {
  // Format: @scope/name@^1.0.0 or @scope/name
  const atIndex = spec.lastIndexOf('@')
  if (atIndex > 0) {
    return {
      name: spec.substring(0, atIndex),
      versionRange: spec.substring(atIndex + 1),
    }
  }
  return { name: spec, versionRange: null }
}
