#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { installFromLocalPath } from './commands/install.js'

const program = new Command()

program
  .name('specpm')
  .description('Spec package manager for AI-driven development')
  .version('0.0.1')

program
  .command('init')
  .description('Initialize a new SpecPM project')
  .option('--name <name>', 'Project name')
  .option('--targets <targets>', 'AI targets (comma-separated: claude,cursor,copilot)')
  .option('--yes', 'Accept all defaults, no prompts')
  .option('--force', 'Overwrite existing specpm.yaml')
  .action(async (options) => {
    const result = await initCommand(options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('install [source]')
  .description('Install a spec package from a local path')
  .option('--save-dev', 'Add to devDependencies')
  .option('--dry-run', 'Show what would install')
  .option('--force', 'Re-install even if present')
  .action(async (source, options) => {
    if (!source) {
      console.error('Usage: specpm install <path>')
      process.exit(1)
    }
    const result = await installFromLocalPath(source, options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program.parse()
