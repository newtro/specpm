import { resolve } from 'node:path'
import type { Result } from 'shared'
import { verifyL0, type VerificationResult } from '../lib/verifier/l0.js'

export interface VerifyOptions {
  json?: boolean
}

export async function verifyCommand(path: string, options: VerifyOptions): Promise<Result<VerificationResult, string>> {
  const directory = resolve(path)
  const result = await verifyL0(directory)

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.error(`\nVerification L0: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`)
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ'
      const file = issue.file ? ` (${issue.file})` : ''
      console.error(`  ${icon} [${issue.code}] ${issue.message}${file}`)
    }
    if (result.issues.length === 0) {
      console.error('  All checks passed.')
    }
    console.error('')
  }

  return { ok: true, value: result }
}
