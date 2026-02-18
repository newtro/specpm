import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpecPackage, Result } from 'shared'
import { generateContext, type ProjectConfig } from './generator.js'

export async function generateClaudeContext(
  projectRoot: string,
  packages: SpecPackage[],
  config: ProjectConfig,
): Promise<Result<string, string>> {
  const context = generateContext({ packages, config, target: 'claude-code' })

  const outputDir = join(projectRoot, '.specpm')
  await mkdir(outputDir, { recursive: true })

  const outputPath = join(outputDir, 'CLAUDE.md')
  await writeFile(outputPath, context, 'utf-8')

  return { ok: true, value: outputPath }
}
