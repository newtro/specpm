import type { CiResult } from '../../commands/ci.js'

export function formatGitHub(result: CiResult): string {
  const lines: string[] = []

  for (const issue of result.verifyIssues) {
    const level = issue.severity === 'error' ? 'error' : 'warning'
    const file = issue.file ? `file=${issue.file}` : ''
    lines.push(`::${level} ${file}::${issue.message}`)
  }

  for (const r of result.checkResults) {
    if (r.status === 'fail') {
      const file = r.file ? `file=${r.file}` : ''
      const line = r.line ? `,line=${r.line}` : ''
      lines.push(`::error ${file}${line}::Constraint ${r.constraint} failed: ${r.message}`)
    } else if (r.status === 'warn') {
      const file = r.file ? `file=${r.file}` : ''
      const line = r.line ? `,line=${r.line}` : ''
      lines.push(`::warning ${file}${line}::Constraint ${r.constraint}: ${r.message}`)
    }
  }

  for (const issue of result.teamIssues) {
    lines.push(`::error ::Team compliance: ${issue}`)
  }

  return lines.join('\n')
}
