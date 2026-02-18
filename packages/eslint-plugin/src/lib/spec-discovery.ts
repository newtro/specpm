import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { SpecYaml, SpecPackage, ConstraintsFile } from 'shared'

// Module-level cache: specs keyed by project root
const specsCache = new Map<string, SpecPackage[]>()

/**
 * Walk up from a file path to find specpm.yaml, return its directory or null.
 */
export function findProjectRoot(filePath: string): string | null {
  let dir = dirname(filePath)
  const seen = new Set<string>()
  while (!seen.has(dir)) {
    seen.add(dir)
    if (existsSync(join(dir, 'specpm.yaml'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Load a spec package from a directory (sync for ESLint compatibility).
 */
function loadSpecPackageSync(directory: string): SpecPackage | null {
  const specYamlPath = join(directory, 'spec.yaml')
  if (!existsSync(specYamlPath)) return null

  try {
    const manifest = parseYaml(readFileSync(specYamlPath, 'utf-8')) as SpecYaml

    const entities: Record<string, unknown>[] = []
    for (const ep of manifest.entities ?? []) {
      entities.push(JSON.parse(readFileSync(join(directory, ep), 'utf-8')))
    }

    const states: Record<string, unknown>[] = []
    for (const sp of manifest.states ?? []) {
      states.push(JSON.parse(readFileSync(join(directory, sp), 'utf-8')))
    }

    let constraints: SpecPackage['constraints'] = []
    if (manifest.constraints) {
      const parsed = parseYaml(readFileSync(join(directory, manifest.constraints), 'utf-8')) as ConstraintsFile
      constraints = parsed.constraints ?? []
    }

    const docs: string[] = []
    for (const dp of manifest.docs ?? []) {
      docs.push(readFileSync(join(directory, dp), 'utf-8'))
    }

    return { manifest, directory, entities, states, constraints, docs }
  } catch {
    return null
  }
}

/**
 * Load all installed specs from .specpm/specs/ for a project root.
 * Results are cached per lint run.
 */
export function loadInstalledSpecs(projectRoot: string): SpecPackage[] {
  if (specsCache.has(projectRoot)) {
    return specsCache.get(projectRoot)!
  }

  const specsDir = join(projectRoot, '.specpm', 'specs')
  if (!existsSync(specsDir)) {
    specsCache.set(projectRoot, [])
    return []
  }

  const packages: SpecPackage[] = []
  const entries = readdirSync(specsDir)
  for (const entry of entries) {
    if (!entry.startsWith('@')) continue
    const scopeDir = join(specsDir, entry)
    if (!statSync(scopeDir).isDirectory()) continue
    const names = readdirSync(scopeDir)
    for (const name of names) {
      const pkgDir = join(scopeDir, name)
      if (!statSync(pkgDir).isDirectory()) continue
      const pkg = loadSpecPackageSync(pkgDir)
      if (pkg) packages.push(pkg)
    }
  }

  specsCache.set(projectRoot, packages)
  return packages
}

/**
 * Get specs for a given source file path.
 * Returns empty array if no specpm project found (no-op).
 */
export function getSpecsForFile(filePath: string): SpecPackage[] {
  const root = findProjectRoot(filePath)
  if (!root) return []
  return loadInstalledSpecs(root)
}

/**
 * Clear the spec cache (useful for testing).
 */
export function clearSpecCache(): void {
  specsCache.clear()
}

/**
 * Detect framework from package.json in project root.
 */
export function detectFramework(projectRoot: string): 'nextjs' | 'express' | 'fastify' | 'unknown' {
  const pkgPath = join(projectRoot, 'package.json')
  if (!existsSync(pkgPath)) return 'unknown'

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps['next']) return 'nextjs'
    if (allDeps['fastify']) return 'fastify'
    if (allDeps['express']) return 'express'
  } catch {
    // ignore
  }
  return 'unknown'
}
