import { readFile, access, readdir, stat, lstat } from 'node:fs/promises'
import { join, normalize, relative, isAbsolute } from 'node:path'
import Ajv from 'ajv'
import { parse as parseYaml } from 'yaml'
import { specYamlSchema } from 'shared'
import type { SpecYaml, SpecPackage, ConstraintsFile, Result, ValidationError } from 'shared'

const ajv = new Ajv({ allErrors: true })
const validateManifest = ajv.compile(specYamlSchema)

function isPathTraversal(filePath: string): boolean {
  const normalized = normalize(filePath)
  return normalized.startsWith('..') || isAbsolute(filePath)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function loadSpecPackage(directory: string): Promise<Result<SpecPackage, ValidationError[]>> {
  const errors: ValidationError[] = []
  const specYamlPath = join(directory, 'spec.yaml')

  // Check spec.yaml exists
  if (!(await fileExists(specYamlPath))) {
    return { ok: false, error: [{ path: 'spec.yaml', message: 'spec.yaml not found' }] }
  }

  // Parse spec.yaml
  let manifest: SpecYaml
  try {
    const content = await readFile(specYamlPath, 'utf-8')
    manifest = parseYaml(content) as SpecYaml
  } catch (error) {
    return { ok: false, error: [{ path: 'spec.yaml', message: `Failed to parse spec.yaml: ${error}` }] }
  }

  // Validate against schema
  if (!validateManifest(manifest)) {
    const schemaErrors = (validateManifest.errors ?? []).map(e => ({
      path: `spec.yaml${e.instancePath}`,
      message: e.message ?? 'Unknown validation error',
    }))
    return { ok: false, error: schemaErrors }
  }

  // Validate file paths don't traverse
  const allPaths = [
    ...(manifest.entities ?? []),
    ...(manifest.states ?? []),
    ...(manifest.docs ?? []),
    ...(manifest.constraints ? [manifest.constraints] : []),
  ]

  for (const filePath of allPaths) {
    if (isPathTraversal(filePath)) {
      errors.push({ path: filePath, message: `Path traversal not allowed: ${filePath}` })
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors }
  }

  // Verify referenced files exist
  for (const filePath of allPaths) {
    const fullPath = join(directory, filePath)
    if (!(await fileExists(fullPath))) {
      errors.push({ path: filePath, message: `Referenced file not found: ${filePath}` })
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors }
  }

  // Load entities
  const entities: Record<string, unknown>[] = []
  for (const entityPath of manifest.entities ?? []) {
    const content = await readFile(join(directory, entityPath), 'utf-8')
    entities.push(JSON.parse(content))
  }

  // Load states
  const states: Record<string, unknown>[] = []
  for (const statePath of manifest.states ?? []) {
    const content = await readFile(join(directory, statePath), 'utf-8')
    states.push(JSON.parse(content))
  }

  // Load constraints
  let constraints: SpecPackage['constraints'] = []
  if (manifest.constraints) {
    const content = await readFile(join(directory, manifest.constraints), 'utf-8')
    const parsed = parseYaml(content) as ConstraintsFile
    constraints = parsed.constraints ?? []

    // Validate constraint ID uniqueness
    const ids = new Set<string>()
    for (const constraint of constraints) {
      if (ids.has(constraint.id)) {
        errors.push({ path: manifest.constraints, message: `Duplicate constraint ID: ${constraint.id}` })
      }
      ids.add(constraint.id)
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors }
  }

  // Load docs
  const docs: string[] = []
  for (const docPath of manifest.docs ?? []) {
    const content = await readFile(join(directory, docPath), 'utf-8')
    docs.push(content)
  }

  return {
    ok: true,
    value: { manifest, directory, entities, states, constraints, docs },
  }
}

/**
 * List all installed spec packages from .specpm/specs/
 */
export async function listInstalledSpecs(projectRoot: string): Promise<Result<SpecPackage[], ValidationError[]>> {
  const specsDir = join(projectRoot, '.specpm', 'specs')
  if (!(await fileExists(specsDir))) {
    return { ok: true, value: [] }
  }

  const packages: SpecPackage[] = []
  const errors: ValidationError[] = []

  // Scan @scope directories
  const entries = await readdir(specsDir)
  for (const entry of entries) {
    if (!entry.startsWith('@')) continue
    const scopeDir = join(specsDir, entry)
    const scopeStat = await lstat(scopeDir)
    if (!scopeStat.isDirectory()) continue

    const names = await readdir(scopeDir)
    for (const name of names) {
      const packageDir = join(scopeDir, name)
      const pkgStat = await lstat(packageDir)
      if (!pkgStat.isDirectory()) continue

      const result = await loadSpecPackage(packageDir)
      if (result.ok) {
        packages.push(result.value)
      } else {
        errors.push(...result.error)
      }
    }
  }

  if (errors.length > 0 && packages.length === 0) {
    return { ok: false, error: errors }
  }

  return { ok: true, value: packages }
}

/**
 * Get a single installed spec by name (e.g. "@auth/oauth2")
 */
export async function getInstalledSpec(projectRoot: string, name: string): Promise<Result<SpecPackage, ValidationError[]>> {
  // name format: @scope/package
  const match = name.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/)
  if (!match) {
    return { ok: false, error: [{ path: name, message: `Invalid package name: ${name}` }] }
  }

  const packageDir = join(projectRoot, '.specpm', 'specs', `@${match[1]}`, match[2])
  if (!(await fileExists(packageDir))) {
    return { ok: false, error: [{ path: name, message: `Package not installed: ${name}` }] }
  }

  return loadSpecPackage(packageDir)
}
