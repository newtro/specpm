import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises'
import { join, resolve, isAbsolute } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { loadSpecPackage } from '../lib/loader.js'
import type { Result } from 'shared'

export interface InstallOptions {
  saveDev?: boolean
  dryRun?: boolean
  force?: boolean
  registry?: string
}

interface ProjectManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

async function loadProjectManifest(cwd: string): Promise<Result<ProjectManifest, string>> {
  const manifestPath = join(cwd, 'specpm.yaml')
  if (!(await fileExists(manifestPath))) {
    return { ok: false, error: 'Not a SpecPM project. Run `specpm init` first.' }
  }
  try {
    const content = await readFile(manifestPath, 'utf-8')
    return { ok: true, value: parseYaml(content) as ProjectManifest }
  } catch {
    return { ok: false, error: 'Failed to parse specpm.yaml' }
  }
}

export async function installFromLocalPath(
  sourcePath: string,
  options: InstallOptions = {}
): Promise<Result<string, string>> {
  const cwd = process.cwd()

  // Check project is initialized
  const manifestResult = await loadProjectManifest(cwd)
  if (!manifestResult.ok) return manifestResult

  // Resolve source path
  const resolvedSource = isAbsolute(sourcePath) ? sourcePath : resolve(cwd, sourcePath)

  // Validate the package
  const loadResult = await loadSpecPackage(resolvedSource)
  if (!loadResult.ok) {
    const messages = loadResult.error.map(e => `  ${e.path}: ${e.message}`).join('\n')
    return { ok: false, error: `Invalid spec package:\n${messages}` }
  }

  const spec = loadResult.value
  const packageName = spec.manifest.name
  const match = packageName.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/)
  if (!match) {
    return { ok: false, error: `Invalid package name: ${packageName}` }
  }

  if (options.dryRun) {
    console.error(`Would install ${packageName}@${spec.manifest.version}`)
    return { ok: true, value: packageName }
  }

  // Copy to .specpm/specs/@scope/name/
  const targetDir = join(cwd, '.specpm', 'specs', `@${match[1]}`, match[2])
  await mkdir(targetDir, { recursive: true })
  await cp(resolvedSource, targetDir, { recursive: true })

  // Update specpm.yaml
  const manifest = manifestResult.value
  const depKey = options.saveDev ? 'devDependencies' : 'dependencies'
  if (!manifest[depKey]) {
    manifest[depKey] = {}
  }
  ;(manifest[depKey] as Record<string, string>)[packageName] = spec.manifest.version

  await writeFile(join(cwd, 'specpm.yaml'), stringify(manifest))

  // Generate lockfile
  await generateLockfile(cwd)

  console.error(`✅ Installed ${packageName}@${spec.manifest.version}`)
  return { ok: true, value: packageName }
}

export async function generateLockfile(cwd: string): Promise<void> {
  const specsDir = join(cwd, '.specpm', 'specs')
  if (!(await fileExists(specsDir))) return

  const { listInstalledSpecs } = await import('../lib/loader.js')
  const result = await listInstalledSpecs(cwd)
  if (!result.ok) return

  const packages: Record<string, unknown> = {}
  for (const spec of result.value) {
    const specYamlPath = join(spec.directory, 'spec.yaml')
    const content = await readFile(specYamlPath, 'utf-8')
    const hash = createHash('sha256').update(content).digest('hex')

    const key = `${spec.manifest.name}@${spec.manifest.version}`
    packages[key] = {
      resolved: `local:${spec.directory}`,
      integrity: `sha256-${hash}`,
      dependencies: spec.manifest.dependencies ?? {},
      installedAt: new Date().toISOString(),
    }
  }

  const lockfile = {
    lockfileVersion: 1,
    packages,
  }

  await writeFile(join(cwd, 'specpm-lock.yaml'), stringify(lockfile))
}

export async function installFromRegistry(
  packageName: string,
  options: InstallOptions = {}
): Promise<Result<string, string>> {
  const cwd = process.cwd()

  const manifestResult = await loadProjectManifest(cwd)
  if (!manifestResult.ok) return manifestResult

  // Determine registry URL
  let registryUrl = options.registry
  if (!registryUrl) {
    const authPath = join(homedir(), '.specpm', 'auth.json')
    if (await fileExists(authPath)) {
      const authContent = await readFile(authPath, 'utf-8')
      registryUrl = JSON.parse(authContent).registry
    }
  }
  if (!registryUrl) {
    return { ok: false, error: 'No registry configured. Run `specpm login` or pass --registry.' }
  }

  // Parse package name
  const match = packageName.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/)
  if (!match) {
    return { ok: false, error: `Invalid package name: ${packageName}. Expected @scope/name` }
  }
  const [, scope, name] = match

  // Fetch metadata to get latest version
  const metaRes = await fetch(`${registryUrl}/api/v1/packages/${scope}/${name}`)
  if (!metaRes.ok) {
    if (metaRes.status === 404) {
      return { ok: false, error: `Package ${packageName} not found in registry` }
    }
    return { ok: false, error: `Registry error: ${metaRes.status}` }
  }

  const meta = await metaRes.json() as any
  const versions = Object.keys(meta.versions)
  if (versions.length === 0) {
    return { ok: false, error: `No versions found for ${packageName}` }
  }

  // Pick latest version (simple: last published)
  const latestVersion = versions[0]
  const versionMeta = meta.versions[latestVersion]

  if (options.dryRun) {
    console.error(`Would install ${packageName}@${latestVersion} from registry`)
    return { ok: true, value: packageName }
  }

  // Download tarball
  const tarballRes = await fetch(`${registryUrl}${versionMeta.tarballUrl}`)
  if (!tarballRes.ok) {
    return { ok: false, error: `Failed to download tarball: ${tarballRes.status}` }
  }

  const tarballBuffer = Buffer.from(await tarballRes.arrayBuffer())

  // Verify integrity
  const computedHash = 'sha256-' + createHash('sha256').update(tarballBuffer).digest('hex')
  if (computedHash !== versionMeta.integrity) {
    return { ok: false, error: `Integrity check failed. Expected ${versionMeta.integrity}, got ${computedHash}` }
  }

  // Extract to .specpm/specs/@scope/name/
  const targetDir = join(cwd, '.specpm', 'specs', `@${scope}`, name)
  await mkdir(targetDir, { recursive: true })

  // Extract tarball
  const tempDir = await mkdtemp(join(tmpdir(), 'specpm-install-'))
  try {
    const tarballPath = join(tempDir, 'package.tgz')
    await writeFile(tarballPath, tarballBuffer)
    execSync(`tar xzf ${tarballPath} -C ${targetDir}`, { stdio: 'pipe' })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }

  // Update specpm.yaml
  const projectManifest = manifestResult.value
  const depKey = options.saveDev ? 'devDependencies' : 'dependencies'
  if (!projectManifest[depKey]) {
    projectManifest[depKey] = {}
  }
  ;(projectManifest[depKey] as Record<string, string>)[packageName] = latestVersion

  await writeFile(join(cwd, 'specpm.yaml'), stringify(projectManifest))

  // Generate lockfile
  await generateLockfile(cwd)

  console.error(`✅ Installed ${packageName}@${latestVersion} from registry`)
  return { ok: true, value: packageName }
}
