import type { CiResult } from '../../commands/ci.js'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatJUnit(result: CiResult): string {
  const allResults = [
    ...result.verifyIssues.map(i => ({
      name: `verify: ${i.code}`,
      classname: 'specpm.verify',
      status: i.severity === 'error' ? 'fail' : 'warn',
      message: i.message,
      file: i.file,
    })),
    ...result.checkResults.map(r => ({
      name: `check: ${r.constraint}`,
      classname: `specpm.check.${r.package}`,
      status: r.status,
      message: r.message,
      file: r.file,
      line: r.line,
    })),
    ...result.teamIssues.map(i => ({
      name: `team: ${i}`,
      classname: 'specpm.team',
      status: 'fail' as const,
      message: i,
    })),
  ]

  const failures = allResults.filter(r => r.status === 'fail').length
  const tests = allResults.length || 1

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<testsuites tests="${tests}" failures="${failures}">\n`
  xml += `  <testsuite name="specpm" tests="${tests}" failures="${failures}">\n`

  if (allResults.length === 0) {
    xml += `    <testcase name="specpm-ci" classname="specpm">\n`
    xml += `    </testcase>\n`
  }

  for (const r of allResults) {
    xml += `    <testcase name="${escapeXml(r.name)}" classname="${escapeXml(r.classname)}">\n`
    if (r.status === 'fail') {
      xml += `      <failure message="${escapeXml(r.message)}">${escapeXml(r.message)}</failure>\n`
    } else if (r.status === 'warn') {
      xml += `      <system-out>${escapeXml(r.message)}</system-out>\n`
    }
    xml += `    </testcase>\n`
  }

  xml += `  </testsuite>\n`
  xml += `</testsuites>`

  return xml
}
