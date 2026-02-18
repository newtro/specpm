import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpecPackage, Result } from 'shared'
import { generateContext, type ProjectConfig } from './generator.js'

const MARKER_START = '# --- BEGIN SPECPM GENERATED RULES (DO NOT EDIT) ---'
const MARKER_END = '# --- END SPECPM GENERATED RULES ---'

export async function generateCursorContext(
  projectRoot: string,
  packages: SpecPackage[],
  config: ProjectConfig,
): Promise<Result<string, string>> {
  const context = generateContext({ packages, config, target: 'cursor' })
  const outputPath = join(projectRoot, '.cursorrules')

  const generatedSection = `${MARKER_START}\n${context}\n${MARKER_END}`

  let existingContent = ''
  try {
    existingContent = await readFile(outputPath, 'utf-8')
  } catch {
    // File doesn't exist, that's fine
  }

  let newContent: string
  const startIndex = existingContent.indexOf(MARKER_START)
  const endIndex = existingContent.indexOf(MARKER_END)

  if (startIndex !== -1 && endIndex !== -1) {
    // Replace existing generated section
    newContent =
      existingContent.substring(0, startIndex) +
      generatedSection +
      existingContent.substring(endIndex + MARKER_END.length)
  } else if (existingContent.length > 0) {
    // Append to existing content
    newContent = existingContent.trimEnd() + '\n\n' + generatedSection + '\n'
  } else {
    newContent = generatedSection + '\n'
  }

  await writeFile(outputPath, newContent, 'utf-8')

  return { ok: true, value: outputPath }
}
