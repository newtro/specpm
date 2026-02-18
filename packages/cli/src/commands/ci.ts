import { join } from 'node:path'
import { access, readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import type { Result } from 'shared'
import type { CheckResult } from '../lib/checker/entity-checker.js'
import type { VerificationIssue } from '../lib/verifier/l0.js'
import { verifyL0 } from '../lib/verifier/l0.js'
import { checkCommand, type CheckReport } from './check.js'
import { teamCheckCommand, type TeamCheckResult } from './team.js'
import { formatJUnit } from '../lib/reporters/junit.js'
import { formatGitHub } from '../lib/reporters/github.js'

export interface CiOptions {
  check?: boolean
  team?: boolean
  verify?: boolean
  reporter?: 'text' | 'json' | 'junit' | 'github'
  strict?: boolean
}

export interface CiResult {
  passed: boolean
  verifyIssues: VerificationIssue[]
  checkResults: CheckResult[]
  teamIssues: string[]
  teamRecommended: string[]
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true } catch { return false }
}

export async function ciCommand(options: CiOptions): Promise<Result<CiResult, string>> {
  const projectRoot = process.cwd()

  // Auto-detect reporter from env
  let reporter = options.reporter ?? 'text'
  if (!options.reporter && process.env.GITHUB_ACTIONS === 'true') {
    reporter = 'github'
  }

  const result: CiResult = {
    passed: true,
    verifyIssues: [],
    checkResults: [],
    teamIssues: [],
    teamRecommended: [],
  }

  // Check specpm.yaml exists
  if (!(await fileExists(join(projectRoot, 'specpm.yaml')))) {
    return { ok: false, error: 'specpm.yaml not found. Not a SpecPM project.' }
  }

  // Determine which checks to run
  const runVerify = options.verify !== false
  const runCheck = options.check !== false
  const runTeam = options.team !== false

  // 1. Verify installed specs
  if (runVerify) {
    const specsDir = join(projectRoot, '.specpm', 'specs')
    if (await fileExists(specsDir)) {
      const { listInstalledSpecs } = await import('../lib/loader.js')
      const specsResult = await listInstalledSpecs(projectRoot)
      if (specsResult.ok) {
        for (const spec of specsResult.value) {
          const verifyResult = await verifyL0(spec.directory)
          result.verifyIssues.push(...verifyResult.issues)
          if (!verifyResult.passed) {
            result.passed = false
          }
        }
      }
    }
  }

  // 2. Run check
  if (runCheck) {
    const checkResult = await checkCommand({ strict: options.strict, json: false })
    if (checkResult.ok) {
      result.checkResults = checkResult.value.results
      if (checkResult.value.summary.fail > 0) {
        result.passed = false
      }
      if (options.strict && checkResult.value.summary.warn > 0) {
        result.passed = false
      }
    }
  }

  // 3. Team check (if team config exists)
  if (runTeam) {
    const teamResult = await teamCheckCommand({})
    if (teamResult.ok && teamResult.value) {
      if (!teamResult.value.passed) {
        result.passed = false
        result.teamIssues.push(
          ...teamResult.value.missing.map(m => `Missing required spec: ${m}`),
          ...teamResult.value.outdated.map(o => `Outdated spec: ${o.name} (${o.installed} vs ${o.required})`),
          ...teamResult.value.enforcementIssues,
        )
      }
      result.teamRecommended = teamResult.value.recommended
    }
  }

  // Output
  switch (reporter) {
    case 'json':
      console.log(JSON.stringify(result, null, 2))
      break
    case 'junit':
      console.log(formatJUnit(result))
      break
    case 'github':
      console.log(formatGitHub(result))
      break
    default: {
      // text output
      console.error(`\nSpecPM CI Report`)
      console.error(`${'─'.repeat(40)}`)
      if (result.verifyIssues.length > 0) {
        console.error(`\nVerification issues: ${result.verifyIssues.length}`)
        for (const i of result.verifyIssues) {
          console.error(`  ${i.severity === 'error' ? '✗' : '⚠'} [${i.code}] ${i.message}`)
        }
      }
      if (result.checkResults.length > 0) {
        const fails = result.checkResults.filter(r => r.status === 'fail').length
        const warns = result.checkResults.filter(r => r.status === 'warn').length
        console.error(`\nCheck: ${fails} errors, ${warns} warnings`)
      }
      if (result.teamIssues.length > 0) {
        console.error(`\nTeam issues:`)
        for (const i of result.teamIssues) console.error(`  ❌ ${i}`)
      }
      console.error(`\n${result.passed ? '✅ CI PASSED' : '❌ CI FAILED'}\n`)
      break
    }
  }

  return { ok: true, value: result }
}
