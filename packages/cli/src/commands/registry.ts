import type { Result } from 'shared'
import { addRegistry, removeRegistry, listRegistries, type RegistryMap } from '../lib/registry-config.js'

export async function registryAddCommand(scope: string, url: string): Promise<Result<void, string>> {
  const result = await addRegistry(process.cwd(), scope, url)
  if (result.ok) {
    console.error(`✅ Added registry: ${scope} → ${url}`)
  }
  return result
}

export async function registryRemoveCommand(scope: string): Promise<Result<void, string>> {
  const result = await removeRegistry(process.cwd(), scope)
  if (result.ok) {
    console.error(`✅ Removed registry for scope: ${scope}`)
  }
  return result
}

export async function registryListCommand(options: { json?: boolean } = {}): Promise<Result<RegistryMap, string>> {
  const result = await listRegistries(process.cwd())
  if (!result.ok) return result

  const registries = result.value
  if (options.json) {
    console.log(JSON.stringify(registries, null, 2))
  } else {
    const entries = Object.entries(registries)
    if (entries.length === 0) {
      console.error('No registries configured.')
    } else {
      console.error('\nConfigured registries:')
      for (const [scope, url] of entries) {
        console.error(`  ${scope} → ${url}`)
      }
      console.error('')
    }
  }

  return result
}
