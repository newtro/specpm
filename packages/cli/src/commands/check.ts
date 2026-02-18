import { resolve, join } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { Project } from 'ts-morph'
import type { Result, SpecPackage } from 'shared'
import { listInstalledSpecs } from '../lib/loader.js'
import { checkEntity, type CheckResult } from '../lib/checker/entity-checker.js'
import { checkPattern } from '../lib/checker/pattern-checker.js'

export interface CheckOptions {
  spec?: string
  json?: boolean
  strict?: boolean
}

export interface CheckReport {
  timestamp: string
  summary: { pass: number; fail: number; warn: number; skip: number }
  results: CheckResult[]
  specs: string[]
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

export async function checkCommand(options: CheckOptions): Promise<Result<CheckReport, string>> {
  const projectRoot = process.cwd()

  // Load installed specs
  const specsResult = await listInstalledSpecs(projectRoot)
  if (!specsResult.ok) {
    return { ok: false, error: `Failed to load specs: ${specsResult.error.map(e => e.message).join(', ')}` }
  }

  let specs = specsResult.value
  if (options.spec) {
    specs = specs.filter(s => s.manifest.name === options.spec)
    if (specs.length === 0) {
      return { ok: false, error: `Spec "${options.spec}" not found in installed packages` }
    }
  }

  if (specs.length === 0) {
    const report: CheckReport = {
      timestamp: new Date().toISOString(),
      summary: { pass: 0, fail: 0, warn: 0, skip: 0 },
      results: [],
      specs: [],
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.error('No spec packages installed. Run `specpm install` first.')
    }
    return { ok: true, value: report }
  }

  // Load check config from specpm.yaml
  let includePatterns = ['src/**/*.ts', 'src/**/*.js']
  let excludePatterns = ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/node_modules/**']

  const configPath = join(projectRoot, 'specpm.yaml')
  if (await fileExists(configPath)) {
    try {
      const configRaw = await readFile(configPath, 'utf-8')
      const config = parseYaml(configRaw) as Record<string, unknown>
      const checkConfig = config.check as Record<string, unknown> | undefined
      if (checkConfig?.include) includePatterns = checkConfig.include as string[]
      if (checkConfig?.exclude) excludePatterns = checkConfig.exclude as string[]
    } catch {
      // ignore config parse errors
    }
  }

  // Discover source files
  const sourceFilePaths: string[] = []
  for (const pattern of includePatterns) {
    try {
      for await (const entry of glob(join(projectRoot, pattern))) {
        const path = typeof entry === 'string' ? entry : entry.toString()
        const shouldExclude = excludePatterns.some(ex => {
          const simple = ex.replace(/\*\*/g, '').replace(/\*/g, '')
          return path.includes(simple.replace(/\//g, '/'))
        })
        if (!shouldExclude) {
          sourceFilePaths.push(path)
        }
      }
    } catch {
      // glob pattern didn't match anything
    }
  }

  // Parse source files with ts-morph
  const project = new Project({ useInMemoryFileSystem: false, compilerOptions: { strict: true } })
  const sourceFiles = []
  for (const filePath of sourceFilePaths) {
    try {
      sourceFiles.push(project.addSourceFileAtPath(filePath))
    } catch {
      // Skip files that can't be parsed
    }
  }

  // Run checks
  const allResults: CheckResult[] = []
  const specNames: string[] = []

  for (const spec of specs) {
    specNames.push(spec.manifest.name)

    for (const constraint of spec.constraints) {
      if (constraint.type === 'entity') {
        allResults.push(...checkEntity(constraint, spec.manifest.name, sourceFiles, spec.entities))
      } else if (constraint.type === 'pattern') {
        allResults.push(...checkPattern(constraint, spec.manifest.name, sourceFiles))
      } else {
        allResults.push({
          package: spec.manifest.name,
          constraint: constraint.id,
          description: constraint.description,
          status: 'skip',
          message: `Constraint type "${constraint.type}" not yet supported`,
        })
      }
    }
  }

  const summary = {
    pass: allResults.filter(r => r.status === 'pass').length,
    fail: allResults.filter(r => r.status === 'fail').length,
    warn: allResults.filter(r => r.status === 'warn').length,
    skip: allResults.filter(r => r.status === 'skip').length,
  }

  const report: CheckReport = {
    timestamp: new Date().toISOString(),
    summary,
    results: allResults,
    specs: specNames,
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.error(`\nSpec Check Report`)
    console.error(`${'─'.repeat(40)}`)
    for (const spec of specNames) {
      console.error(`\n📦 ${spec}`)
      const specResults = allResults.filter(r => r.package === spec)
      for (const r of specResults) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : r.status === 'warn' ? '⚠️' : '⏭️'
        const location = r.file ? ` (${r.file}${r.line ? ':' + r.line : ''})` : ''
        console.error(`  ${icon} [${r.constraint}] ${r.message}${location}`)
      }
    }
    console.error(`\n${'─'.repeat(40)}`)
    console.error(`Pass: ${summary.pass} | Fail: ${summary.fail} | Warn: ${summary.warn} | Skip: ${summary.skip}\n`)
  }

  const hasFail = summary.fail > 0 || (options.strict && summary.warn > 0)
  return { ok: true, value: report }
}
