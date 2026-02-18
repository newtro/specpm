import entityMatch from './rules/entity-match.js'
import constraintPattern from './rules/constraint-pattern.js'
import endpointShape from './rules/endpoint-shape.js'
import stateCoverage from './rules/state-coverage.js'

const rules = {
  'entity-match': entityMatch,
  'constraint-pattern': constraintPattern,
  'endpoint-shape': endpointShape,
  'state-coverage': stateCoverage,
}

const plugin = {
  meta: {
    name: 'eslint-plugin-specpm',
    version: '0.0.1',
  },
  rules,
  configs: {} as Record<string, any>,
}

// Build configs after plugin is defined to avoid circular refs
plugin.configs.recommended = {
  plugins: { specpm: plugin },
  rules: {
    'specpm/entity-match': 'error',
    'specpm/constraint-pattern': 'error',
    'specpm/endpoint-shape': 'warn',
    'specpm/state-coverage': 'warn',
  },
}

plugin.configs.strict = {
  plugins: { specpm: plugin },
  rules: {
    'specpm/entity-match': 'error',
    'specpm/constraint-pattern': 'error',
    'specpm/endpoint-shape': 'error',
    'specpm/state-coverage': 'error',
  },
}

export default plugin
export { rules }
export { clearSpecCache, getSpecsForFile, findProjectRoot, loadInstalledSpecs, detectFramework } from './lib/spec-discovery.js'
