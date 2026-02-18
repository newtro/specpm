#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { installFromLocalPath, installFromRegistry } from './commands/install.js'
import { contextCommand } from './commands/context.js'
import { verifyCommand } from './commands/verify.js'
import { publishCommand } from './commands/publish.js'
import { loginCommand, logoutCommand } from './commands/login.js'
import { searchCommand } from './commands/search.js'
import { versionCommand } from './commands/version.js'
import { checkCommand } from './commands/check.js'

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
  .description('Install a spec package from local path or registry')
  .option('--save-dev', 'Add to devDependencies')
  .option('--dry-run', 'Show what would install')
  .option('--force', 'Re-install even if present')
  .option('--registry <url>', 'Registry URL')
  .action(async (source, options) => {
    if (!source) {
      console.error('Usage: specpm install <path-or-package>')
      process.exit(1)
    }
    // If source starts with @ and has no path separator beyond the scope, it's a registry install
    const isRegistryInstall = source.startsWith('@') && !source.includes('/') ||
      (source.startsWith('@') && source.match(/^@[a-z0-9-]+\/[a-z0-9-]+$/) && !(await import('node:fs/promises').then(fs => fs.access(source).then(() => true).catch(() => false))))
    
    let result
    if (isRegistryInstall) {
      result = await installFromRegistry(source, options)
    } else {
      result = await installFromLocalPath(source, options)
    }
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('context')
  .description('Generate AI context files from installed specs')
  .option('--target <target>', 'Target agent: claude, cursor, copilot, all', 'claude')
  .action(async (options) => {
    const result = await contextCommand(options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('verify [path]')
  .description('Verify a spec package')
  .option('--json', 'Output as JSON')
  .action(async (path, options) => {
    const result = await verifyCommand(path ?? '.', options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    } else if (!result.value.passed) {
      process.exit(1)
    }
  })

program
  .command('publish [path]')
  .description('Publish a spec package to the registry')
  .option('--dry-run', 'Show what would publish without uploading')
  .option('--registry <url>', 'Registry URL')
  .option('--tag <tag>', 'Dist-tag (default: latest)')
  .action(async (path, options) => {
    const result = await publishCommand(path ?? '.', options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('login')
  .description('Authenticate with a spec registry')
  .requiredOption('--registry <url>', 'Registry URL')
  .option('--token <token>', 'API token')
  .option('--username <username>', 'Username')
  .option('--password <password>', 'Password')
  .action(async (options) => {
    const result = await loginCommand(options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('logout')
  .description('Remove stored authentication')
  .action(async () => {
    const result = await logoutCommand()
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('check')
  .description('Check source code against installed spec constraints')
  .option('--spec <package>', 'Check against specific spec only')
  .option('--json', 'Output as JSON')
  .option('--strict', 'Treat warnings as errors')
  .action(async (options) => {
    const result = await checkCommand(options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    } else if (result.value.summary.fail > 0 || (options.strict && result.value.summary.warn > 0)) {
      process.exit(1)
    }
  })

program
  .command('version <bump>')
  .description('Bump package version (major, minor, or patch)')
  .option('--message <msg>', 'Changelog message')
  .option('--preid <preid>', 'Prerelease identifier (e.g., beta)')
  .action(async (bump, options) => {
    if (!['major', 'minor', 'patch'].includes(bump)) {
      console.error('Error: bump must be major, minor, or patch')
      process.exit(2)
    }
    const result = await versionCommand(bump, options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('search <query>')
  .description('Search for spec packages in the registry')
  .option('--tag <tag>', 'Filter by tag')
  .option('--sort <sort>', 'Sort by: relevance, downloads, recent')
  .option('--limit <limit>', 'Max results')
  .option('--json', 'Output as JSON')
  .option('--registry <url>', 'Registry URL')
  .action(async (query, options) => {
    const result = await searchCommand(query, options)
    if (!result.ok) {
      console.error(`Error: ${result.error}`)
      process.exit(1)
    }
  })

program.parse()
