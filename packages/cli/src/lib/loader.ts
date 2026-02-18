import { readFile, access, readdir, stat } from 'node:fs/promises'
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
