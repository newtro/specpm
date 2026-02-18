import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Result } from 'shared'
import { loadTeamConfig, parseRequirement, type TeamConfig } from '../lib/team-config.js'
import { listInstalledSpecs } from '../lib/loader.js'
import { satisfiesRange } from '../lib/resolver.js'
import { installFromRegistry, type InstallOptions } from './install.js'

export interface TeamCheckResult {
  passed: boolean
  missing: string[]
  outdated: { name: string; installed: string; required: string }[]
  recommended: string[]
  enforcementIssues: string[]
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

export async function teamCheckCommand(options: { json?: boolean } = {}): Promise<Result<TeamCheckResult, string>> {
  const projectRoot = process.cwd()
  const configResult = await loadTeamConfig(projectRoot)
  if (!configResult.ok) {
    return { ok: false, error: configResult.error }
  }

  if (!configResult.value) {
    const result: TeamCheckResult = {
      passed: true,
      missing: [],
      outdated: [],
      recommended: [],
      enforcementIssues: [],
    }
    if (!options.json) {
      console.error('ℹ No specpm-team.yaml found. Team check skipped.')
    }
    return { ok: true, value: result }
  }

  const teamConfig = configResult.value
  const specsResult = await listInstalledSpecs(projectRoot)
  const installedSpecs = specsResult.ok ? specsResult.value : []

  const installedMap = new Map<string, string>()
  for (const spec of installedSpecs) {
    installedMap.set(spec.manifest.name, spec.manifest.version)
  }

  const missing: string[] = []
  const outdated: { name: string; installed: string; required: string }[] = []

  for (const req of teamConfig.required ?? []) {
    const parsed = parseRequirement(req)
    const installedVersion = installedMap.get(parsed.name)

    if (!installedVersion) {
      missing.push(parsed.name)
    } else if (parsed.versionRange && !satisfiesRange(installedVersion, parsed.versionRange)) {
      outdated.push({ name: parsed.name, installed: installedVersion, required: parsed.versionRange })
    }
  }

  // Check recommended (just report, don't fail)
  const recommended: string[] = []
  for (const rec of teamConfig.recommended ?? []) {
    const parsed = parseRequirement(rec)
    if (!installedMap.has(parsed.name)) {
      recommended.push(parsed.name)
    }
  }

  // Check enforced settings
  const enforcementIssues: string[] = []
  if (teamConfig.context?.enforced && teamConfig.context.targets) {
    const configPath = join(projectRoot, 'specpm.yaml')
    if (await fileExists(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8')
        const projectConfig = parseYaml(content) as Record<string, unknown>
        const projectTargets = projectConfig.targets as string[] | undefined
        if (projectTargets) {
          const enforcedTargets = new Set(teamConfig.context.targets)
          for (const target of projectTargets) {
            if (!enforcedTargets.has(target)) {
              enforcementIssues.push(`Target "${target}" is not in the enforced team targets: ${teamConfig.context.targets.join(', ')}`)
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const passed = missing.length === 0 && outdated.length === 0 && enforcementIssues.length === 0

  const result: TeamCheckResult = { passed, missing, outdated, recommended, enforcementIssues }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.error(`\nTeam Compliance Check`)
    console.error(`${'─'.repeat(40)}`)
    if (missing.length > 0) {
      console.error(`\n❌ Missing required specs:`)
      for (const m of missing) console.error(`  - ${m}`)
    }
    if (outdated.length > 0) {
      console.error(`\n❌ Outdated specs:`)
      for (const o of outdated) console.error(`  - ${o.name}: ${o.installed} (required: ${o.required})`)
    }
    if (enforcementIssues.length > 0) {
      console.error(`\n❌ Enforcement issues:`)
      for (const e of enforcementIssues) console.error(`  - ${e}`)
    }
    if (recommended.length > 0) {
      console.error(`\n💡 Recommended (not installed):`)
      for (const r of recommended) console.error(`  - ${r}`)
    }
    if (passed) {
      console.error(`\n✅ Project complies with team configuration.`)
    } else {
      console.error(`\n❌ Project does NOT comply with team configuration.`)
    }
    console.error('')
  }

  return { ok: true, value: result }
}

export async function teamSyncCommand(options: { registry?: string } = {}): Promise<Result<string[], string>> {
  const projectRoot = process.cwd()
  const configResult = await loadTeamConfig(projectRoot)
  if (!configResult.ok) {
    return { ok: false, error: configResult.error }
  }

  if (!configResult.value) {
    console.error('ℹ No specpm-team.yaml found. Nothing to sync.')
    return { ok: true, value: [] }
  }

  const teamConfig = configResult.value
  const specsResult = await listInstalledSpecs(projectRoot)
  const installedSpecs = specsResult.ok ? specsResult.value : []

  const installedMap = new Map<string, string>()
  for (const spec of installedSpecs) {
    installedMap.set(spec.manifest.name, spec.manifest.version)
  }

  const synced: string[] = []

  for (const req of teamConfig.required ?? []) {
    const parsed = parseRequirement(req)
    const installedVersion = installedMap.get(parsed.name)

    const needsInstall = !installedVersion ||
      (parsed.versionRange && !satisfiesRange(installedVersion, parsed.versionRange))

    if (needsInstall) {
      console.error(`📦 Installing ${parsed.name}...`)
      const installResult = await installFromRegistry(parsed.name, {
        force: true,
        registry: options.registry,
      })
      if (installResult.ok) {
        synced.push(parsed.name)
      } else {
        console.error(`  ⚠ Failed to install ${parsed.name}: ${installResult.error}`)
      }
    }
  }

  // Report recommended
  for (const rec of teamConfig.recommended ?? []) {
    const parsed = parseRequirement(rec)
    if (!installedMap.has(parsed.name)) {
      console.error(`💡 Recommended: ${parsed.name} (not installed)`)
    }
  }

  if (synced.length === 0) {
    console.error('✅ All required specs are already installed and up to date.')
  } else {
    console.error(`\n✅ Synced ${synced.length} spec(s).`)
  }

  return { ok: true, value: synced }
}
