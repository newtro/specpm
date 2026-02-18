import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpecPackage, Result } from 'shared'
import { generateContext, type ProjectConfig } from './generator.js'

export async function generateCopilotContext(
  projectRoot: string,
  packages: SpecPackage[],
  config: ProjectConfig,
): Promise<Result<string, string>> {
  const context = generateContext({ packages, config, target: 'copilot' })

  const outputDir = join(projectRoot, '.github')
  await mkdir(outputDir, { recursive: true })

  const outputPath = join(outputDir, 'copilot-instructions.md')
  await writeFile(outputPath, context, 'utf-8')

  return { ok: true, value: outputPath }
}
