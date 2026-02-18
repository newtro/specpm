import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Result } from 'shared'
import { listInstalledSpecs } from '../lib/loader.js'
import { generateClaudeContext } from '../lib/context/claude.js'
import { generateCursorContext } from '../lib/context/cursor.js'
import { generateCopilotContext } from '../lib/context/copilot.js'
import type { ProjectConfig } from '../lib/context/generator.js'

export interface ContextOptions {
  target?: string
}

async function loadProjectConfig(projectRoot: string): Promise<Result<ProjectConfig, string>> {
  const configPath = join(projectRoot, 'specpm.yaml')
  try {
    const content = await readFile(configPath, 'utf-8')
    const config = parseYaml(content) as Record<string, unknown>
    return {
      ok: true,
      value: {
        name: (config['name'] as string) ?? 'unknown',
        version: config['version'] as string | undefined,
        description: config['description'] as string | undefined,
        targets: (config['context'] as Record<string, unknown> | undefined)?.['targets'] as string[] | undefined,
      },
    }
  } catch {
    return { ok: false, error: 'specpm.yaml not found. Run `specpm init` first.' }
  }
}

export async function contextCommand(options: ContextOptions): Promise<Result<string[], string>> {
  const projectRoot = process.cwd()

  const configResult = await loadProjectConfig(projectRoot)
  if (!configResult.ok) return configResult

  const config = configResult.value

  const specsResult = await listInstalledSpecs(projectRoot)
  if (!specsResult.ok) {
    return { ok: false, error: specsResult.error.map(e => e.message).join(', ') }
  }

  const packages = specsResult.value
  const target = options.target ?? 'claude'
  const outputs: string[] = []

  const targets = target === 'all'
    ? ['claude', 'cursor', 'copilot']
    : [target]

  for (const t of targets) {
    let result: Result<string, string>
    switch (t) {
      case 'claude':
        result = await generateClaudeContext(projectRoot, packages, config)
        break
      case 'cursor':
        result = await generateCursorContext(projectRoot, packages, config)
        break
      case 'copilot':
        result = await generateCopilotContext(projectRoot, packages, config)
        break
      default:
        return { ok: false, error: `Unknown target: ${t}. Valid targets: claude, cursor, copilot` }
    }

    if (!result.ok) return result
    outputs.push(result.value)
    console.error(`✅ Generated context for ${t}: ${result.value}`)
  }

  return { ok: true, value: outputs }
}
