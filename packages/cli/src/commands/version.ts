import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Result, SpecYaml } from 'shared'

export interface VersionOptions {
  message?: string
  preid?: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

export function bumpVersion(current: string, bump: 'major' | 'minor' | 'patch', preid?: string): string {
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!match) throw new Error(`Invalid version: ${current}`)

  let major = parseInt(match[1], 10)
  let minor = parseInt(match[2], 10)
  let patch = parseInt(match[3], 10)
  const prerelease = match[4]

  if (preid) {
    // If already a prerelease with same preid, bump the number
    if (prerelease && prerelease.startsWith(preid + '.')) {
      const num = parseInt(prerelease.split('.').pop()!, 10)
      // Bump underlying version first
      if (bump === 'major') { major++; minor = 0; patch = 0 }
      else if (bump === 'minor') { minor++; patch = 0 }
      else { patch++ }
      return `${major}.${minor}.${patch}-${preid}.${num + 1}`
    }
    // New prerelease
    if (bump === 'major') { major++; minor = 0; patch = 0 }
    else if (bump === 'minor') { minor++; patch = 0 }
    else { patch++ }
    return `${major}.${minor}.${patch}-${preid}.1`
  }

  if (bump === 'major') { major++; minor = 0; patch = 0 }
  else if (bump === 'minor') { minor++; patch = 0 }
  else { patch++ }

  return `${major}.${minor}.${patch}`
}

export async function versionCommand(
  bump: 'major' | 'minor' | 'patch',
  options: VersionOptions
): Promise<Result<{ oldVersion: string; newVersion: string }, string>> {
  const specYamlPath = join(process.cwd(), 'spec.yaml')

  if (!(await fileExists(specYamlPath))) {
    return { ok: false, error: 'spec.yaml not found in current directory' }
  }

  const raw = await readFile(specYamlPath, 'utf-8')
  const manifest = parseYaml(raw) as SpecYaml
  const oldVersion = manifest.version

  if (!oldVersion) {
    return { ok: false, error: 'No version field in spec.yaml' }
  }

  const newVersion = bumpVersion(oldVersion, bump, options.preid)
  manifest.version = newVersion

  // Write updated spec.yaml
  await writeFile(specYamlPath, stringifyYaml(manifest))

  // Update CHANGELOG.md
  const changelogPath = join(process.cwd(), 'CHANGELOG.md')
  const date = new Date().toISOString().split('T')[0]
  const message = options.message ?? `Version ${newVersion}`
  const newEntry = `## [${newVersion}] - ${date}\n### Changed\n- ${message}\n`

  if (await fileExists(changelogPath)) {
    const changelog = await readFile(changelogPath, 'utf-8')
    const headerEnd = changelog.indexOf('\n## ')
    if (headerEnd !== -1) {
      const updated = changelog.slice(0, headerEnd) + '\n' + newEntry + '\n' + changelog.slice(headerEnd + 1)
      await writeFile(changelogPath, updated)
    } else {
      await writeFile(changelogPath, changelog.trimEnd() + '\n\n' + newEntry)
    }
  } else {
    await writeFile(changelogPath, `# Changelog\n\n${newEntry}`)
  }

  console.error(`${oldVersion} → ${newVersion}`)
  return { ok: true, value: { oldVersion, newVersion } }
}
