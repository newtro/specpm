#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()

program
  .name('specpm')
  .description('Spec package manager for AI-driven development')
  .version('0.0.1')

program.parse()
