import { readFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { verifyL0 } from '../lib/verifier/l0.js'
import type { SpecYaml, Result } from 'shared'

export interface PublishOptions {
  dryRun?: boolean
  registry?: string
  tag?: string
}

interface AuthConfig {
  registry: string
  token: string
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

async function loadAuthConfig(): Promise<Result<AuthConfig, string>> {
  const authPath = join(homedir(), '.specpm', 'auth.json')
  if (!(await fileExists(authPath))) {
    return { ok: false, error: 'Not authenticated. Run `specpm login` first.' }
  }
  try {
    const content = await readFile(authPath, 'utf-8')
    return { ok: true, value: JSON.parse(content) as AuthConfig }
  } catch {
    return { ok: false, error: 'Failed to read auth config.' }
  }
}

export async function publishCommand(
  path: string,
  options: PublishOptions = {}
): Promise<Result<string, string>> {
  const dir = resolve(path)

  // Verify spec.yaml exists
  const specYamlPath = join(dir, 'spec.yaml')
  if (!(await fileExists(specYamlPath))) {
    return { ok: false, error: 'spec.yaml not found in ' + dir }
  }

  // Parse manifest
  const raw = await readFile(specYamlPath, 'utf-8')
  const manifest = parseYaml(raw) as SpecYaml

  // Run L0 verification
  console.error('Running L0 verification...')
  const verification = await verifyL0(dir)
  if (!verification.passed) {
    const errors = verification.issues.filter(i => i.severity === 'error')
    const messages = errors.map(e => `  ${e.code}: ${e.message}`).join('\n')
    return { ok: false, error: `Verification failed:\n${messages}` }
  }
  console.error('✅ Verification passed')

  if (options.dryRun) {
    console.error(`\nDry run - would publish ${manifest.name}@${manifest.version}`)
    console.error(`  Files would be tarballed from: ${dir}`)
    return { ok: true, value: `${manifest.name}@${manifest.version} (dry-run)` }
  }

  // Load auth
  const authResult = await loadAuthConfig()
  if (!authResult.ok) return authResult
  const auth = authResult.value
  const registryUrl = options.registry ?? auth.registry

  // Create tarball
  const tempDir = await mkdtemp(join(tmpdir(), 'specpm-publish-'))
  const tarballPath = join(tempDir, 'package.tgz')
  try {
    const excludes = ['--exclude=.git', '--exclude=node_modules', '--exclude=.DS_Store', '--exclude=dist']
    execSync(`tar czf ${tarballPath} ${excludes.join(' ')} -C ${dir} .`, { stdio: 'pipe' })
    const tarball = await readFile(tarballPath)

    // Check size
    if (tarball.length > 1_048_576) {
      return { ok: false, error: `Tarball too large: ${tarball.length} bytes (max 1MB)` }
    }

    // Parse name for URL
    const match = manifest.name.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/)
    if (!match) {
      return { ok: false, error: `Invalid package name: ${manifest.name}` }
    }
    const [, scope, name] = match

    // Upload using multipart
    const boundary = '----specpm-' + Date.now()
    const manifestStr = JSON.stringify(manifest)

    const parts: Buffer[] = []
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifestStr}\r\n`
    ))
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="tarball"; filename="package.tgz"\r\nContent-Type: application/gzip\r\n\r\n`
    ))
    parts.push(tarball)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
    const body = Buffer.concat(parts)

    const url = `${registryUrl}/api/v1/packages/${scope}/${name}/${manifest.version}`
    console.error(`Publishing ${manifest.name}@${manifest.version} to ${registryUrl}...`)

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${auth.token}`,
      },
      body,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as any
      return { ok: false, error: `Publish failed (${res.status}): ${errBody.error ?? res.statusText}` }
    }

    const result = await res.json() as any
    console.error(`✅ Published ${result.name}@${result.version}`)
    return { ok: true, value: `${result.name}@${result.version}` }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
