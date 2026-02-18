import type { SpecPackage, Result } from 'shared'
import { listInstalledSpecs } from './loader.js'

export interface ResolvedDependency {
  name: string
  version: string
  spec: SpecPackage
}

export interface ResolutionError {
  type: 'not-found' | 'version-conflict' | 'circular-dependency'
  message: string
}

/**
 * Parse a SemVer version string into [major, minor, patch]
 */
function parseSemVer(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
}

/**
 * Check if a version satisfies a SemVer range
 * Supports: exact, ^, ~, >=, >, <=, <, *
 */
export function satisfiesRange(version: string, range: string): boolean {
  const ver = parseSemVer(version)
  if (!ver) return false

  if (range === '*' || range === 'latest') return true

  // Exact match
  if (/^\d+\.\d+\.\d+$/.test(range)) {
    const r = parseSemVer(range)!
    return ver[0] === r[0] && ver[1] === r[1] && ver[2] === r[2]
  }

  // Caret range: ^M.m.p — allows changes that do not modify the left-most non-zero digit
  const caretMatch = range.match(/^\^(\d+\.\d+\.\d+)$/)
  if (caretMatch) {
    const r = parseSemVer(caretMatch[1])!
    if (r[0] > 0) {
      return ver[0] === r[0] && compareVer(ver, r) >= 0
    } else if (r[1] > 0) {
      return ver[0] === 0 && ver[1] === r[1] && compareVer(ver, r) >= 0
    } else {
      return ver[0] === 0 && ver[1] === 0 && ver[2] === r[2]
    }
  }

  // Tilde range: ~M.m.p — allows patch-level changes
  const tildeMatch = range.match(/^~(\d+\.\d+\.\d+)$/)
  if (tildeMatch) {
    const r = parseSemVer(tildeMatch[1])!
    return ver[0] === r[0] && ver[1] === r[1] && ver[2] >= r[2]
  }

  // >= range
  const gteMatch = range.match(/^>=(\d+\.\d+\.\d+)$/)
  if (gteMatch) {
    return compareVer(ver, parseSemVer(gteMatch[1])!) >= 0
  }

  // > range
  const gtMatch = range.match(/^>(\d+\.\d+\.\d+)$/)
  if (gtMatch) {
    return compareVer(ver, parseSemVer(gtMatch[1])!) > 0
  }

  // <= range
  const lteMatch = range.match(/^<=(\d+\.\d+\.\d+)$/)
  if (lteMatch) {
    return compareVer(ver, parseSemVer(lteMatch[1])!) <= 0
  }

  // < range
  const ltMatch = range.match(/^<(\d+\.\d+\.\d+)$/)
  if (ltMatch) {
    return compareVer(ver, parseSemVer(ltMatch[1])!) < 0
  }

  return false
}

function compareVer(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * Resolve dependencies from locally installed specs (flat tree).
 * Returns a flat list of all resolved dependencies.
 */
export async function resolveDependencies(
  rootDependencies: Record<string, string>,
  projectRoot: string
): Promise<Result<ResolvedDependency[], ResolutionError>> {
  const installedResult = await listInstalledSpecs(projectRoot)
  if (!installedResult.ok) {
    return { ok: false, error: { type: 'not-found', message: 'Failed to list installed specs' } }
  }

  const installed = new Map<string, SpecPackage>()
  for (const spec of installedResult.value) {
    installed.set(spec.manifest.name, spec)
  }

  const resolved = new Map<string, ResolvedDependency>()
  const visiting = new Set<string>()

  function resolve(name: string, range: string, chain: string[]): ResolutionError | null {
    // Circular dependency check
    if (visiting.has(name)) {
      return {
        type: 'circular-dependency',
        message: `Circular dependency detected: ${[...chain, name].join(' → ')}`,
      }
    }

    // Already resolved - check version compatibility
    if (resolved.has(name)) {
      const existing = resolved.get(name)!
      if (!satisfiesRange(existing.version, range)) {
        return {
          type: 'version-conflict',
          message: `Version conflict for ${name}: resolved ${existing.version} does not satisfy ${range}`,
        }
      }
      return null
    }

    // Find in installed
    const spec = installed.get(name)
    if (!spec) {
      return {
        type: 'not-found',
        message: `Package not found: ${name}. Install it first with \`specpm install\`.`,
      }
    }

    if (!satisfiesRange(spec.manifest.version, range)) {
      return {
        type: 'version-conflict',
        message: `Installed ${name}@${spec.manifest.version} does not satisfy required range ${range}`,
      }
    }

    visiting.add(name)
    resolved.set(name, { name, version: spec.manifest.version, spec })

    // Resolve transitive dependencies
    const deps = spec.manifest.dependencies ?? {}
    for (const [depName, depRange] of Object.entries(deps)) {
      const error = resolve(depName, depRange, [...chain, name])
      if (error) {
        visiting.delete(name)
        return error
      }
    }

    visiting.delete(name)
    return null
  }

  for (const [name, range] of Object.entries(rootDependencies)) {
    const error = resolve(name, range, [])
    if (error) {
      return { ok: false, error }
    }
  }

  return { ok: true, value: Array.from(resolved.values()) }
}
