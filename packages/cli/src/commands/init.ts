import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline'
import { stringify } from 'yaml'
import type { Result } from 'shared'

export interface InitOptions {
  name?: string
  targets?: string
  yes?: boolean
  force?: boolean
}

interface InitAnswers {
  name: string
  description: string
  targets: string[]
}

const DEFAULT_TARGETS = ['claude']
const VALID_TARGETS = ['claude', 'cursor', 'copilot']

function sanitizeProjectName(dirName: string): string {
  return dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'my-project'
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` (${defaultValue})` : ''
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

function parseTargets(targetsString: string): string[] {
  return targetsString
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => VALID_TARGETS.includes(t))
}

export async function initCommand(options: InitOptions): Promise<Result<string, string>> {
  const cwd = process.cwd()
  const manifestPath = join(cwd, 'specpm.yaml')

  // Check if already initialized
  if (await fileExists(manifestPath)) {
    if (!options.force) {
      return { ok: false, error: 'specpm.yaml already exists. Use --force to overwrite.' }
    }
  }

  const defaultName = sanitizeProjectName(basename(cwd))
  let answers: InitAnswers

  if (options.yes || !process.stdin.isTTY) {
    answers = {
      name: options.name ?? defaultName,
      description: '',
      targets: options.targets ? parseTargets(options.targets) : DEFAULT_TARGETS,
    }
  } else {
    const name = await prompt('Project name', options.name ?? defaultName)
    const description = await prompt('Description', '')
    const targetsInput = await prompt('AI targets (claude,cursor,copilot)', options.targets ?? 'claude')
    answers = {
      name,
      description,
      targets: parseTargets(targetsInput),
    }
  }

  if (answers.targets.length === 0) {
    answers.targets = DEFAULT_TARGETS
  }

  // Create specpm.yaml
  const manifest: Record<string, unknown> = {
    name: answers.name,
    version: '0.1.0',
    ...(answers.description ? { description: answers.description } : {}),
    specs: { directory: '.specpm/specs' },
    context: {
      targets: answers.targets,
      output: '.specpm',
    },
    registry: 'https://registry.specpm.dev',
    dependencies: {},
  }

  await writeFile(manifestPath, stringify(manifest))

  // Create directory structure
  await mkdir(join(cwd, '.specpm', 'specs'), { recursive: true })
  await mkdir(join(cwd, '.specpm', 'context'), { recursive: true })
  await mkdir(join(cwd, '.specpm', 'cache'), { recursive: true })

  // Update .gitignore
  const gitignorePath = join(cwd, '.gitignore')
  const entry = '.specpm/cache'
  if (await fileExists(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8')
    if (!content.includes(entry)) {
      const separator = content.endsWith('\n') ? '' : '\n'
      await writeFile(gitignorePath, content + separator + entry + '\n')
    }
  } else {
    await writeFile(gitignorePath, entry + '\n')
  }

  console.error(`✅ Initialized SpecPM project: ${answers.name}`)
  console.error(`\nNext steps:`)
  console.error(`  specpm install <package>  Install a spec package`)
  console.error(`  specpm context            Generate AI context files`)

  return { ok: true, value: answers.name }
}
