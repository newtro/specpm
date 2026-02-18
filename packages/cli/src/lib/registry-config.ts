import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse as parseYaml, stringify } from 'yaml'
import type { Result } from 'shared'

export interface RegistryMap {
  [scope: string]: string  // scope -> registry URL, 'default' for fallback
}

/**
 * Load scoped registry config from specpm.yaml
 */
export async function loadRegistryConfig(projectRoot: string): Promise<Result<RegistryMap, string>> {
  const configPath = join(projectRoot, 'specpm.yaml')
  try {
    await access(configPath)
  } catch {
    return { ok: true, value: {} }
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const config = parseYaml(content) as Record<string, unknown>
    const registries = (config.registries ?? {}) as RegistryMap
    return { ok: true, value: registries }
  } catch (error) {
    return { ok: false, error: `Failed to parse specpm.yaml: ${error}` }
  }
}

/**
 * Resolve which registry URL to use for a given package name
 */
export function resolveRegistryForPackage(packageName: string, registries: RegistryMap): string | undefined {
  // Package name format: @scope/name
  const match = packageName.match(/^@([a-z0-9-]+)\//)
  if (match) {
    const scope = `@${match[1]}`
    if (registries[scope]) return registries[scope]
  }
  return registries['default'] || undefined
}

/**
 * Get auth token for a registry URL, checking env vars first, then auth.json
 */
export async function getAuthToken(registryUrl: string, scope?: string): Promise<string | undefined> {
  // Check env vars: SPECPM_TOKEN_<SCOPE> (uppercase, hyphens to underscores)
  if (scope) {
    const envKey = `SPECPM_TOKEN_${scope.replace('@', '').replace(/-/g, '_').toUpperCase()}`
    if (process.env[envKey]) {
      return process.env[envKey]
    }
  }

  // Fallback to ~/.specpm/auth.json
  const authPath = join(homedir(), '.specpm', 'auth.json')
  try {
    await access(authPath)
    const content = await readFile(authPath, 'utf-8')
    const auth = JSON.parse(content) as Record<string, unknown>
    // Check for registry-specific token
    const tokens = auth.tokens as Record<string, string> | undefined
    if (tokens?.[registryUrl]) return tokens[registryUrl]
    // Fallback to global token
    if (auth.token && auth.registry === registryUrl) return auth.token as string
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Add a registry entry to specpm.yaml
 */
export async function addRegistry(projectRoot: string, scope: string, url: string): Promise<Result<void, string>> {
  if (!url.startsWith('https://')) {
    return { ok: false, error: 'Registry URL must use HTTPS' }
  }

  const configPath = join(projectRoot, 'specpm.yaml')
  let config: Record<string, unknown> = {}
  try {
    await access(configPath)
    const content = await readFile(configPath, 'utf-8')
    config = parseYaml(content) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'specpm.yaml not found. Run `specpm init` first.' }
  }

  if (!config.registries) config.registries = {}
  const registries = config.registries as RegistryMap
  registries[scope] = url

  await writeFile(configPath, stringify(config))
  return { ok: true, value: undefined }
}

/**
 * Remove a registry entry from specpm.yaml
 */
export async function removeRegistry(projectRoot: string, scope: string): Promise<Result<void, string>> {
  const configPath = join(projectRoot, 'specpm.yaml')
  let config: Record<string, unknown> = {}
  try {
    await access(configPath)
    const content = await readFile(configPath, 'utf-8')
    config = parseYaml(content) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'specpm.yaml not found.' }
  }

  const registries = (config.registries ?? {}) as RegistryMap
  if (!registries[scope]) {
    return { ok: false, error: `No registry configured for scope "${scope}"` }
  }

  delete registries[scope]
  config.registries = registries

  await writeFile(configPath, stringify(config))
  return { ok: true, value: undefined }
}

/**
 * List all configured registries
 */
export async function listRegistries(projectRoot: string): Promise<Result<RegistryMap, string>> {
  return loadRegistryConfig(projectRoot)
}
