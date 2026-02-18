export const specYamlSchema = {
  type: 'object',
  required: ['name', 'version', 'description', 'author', 'license'],
  properties: {
    name: {
      type: 'string',
      pattern: '^@[a-z0-9-]+/[a-z0-9-]+$',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+',
    },
    description: { type: 'string', minLength: 1 },
    author: { type: 'string', minLength: 1 },
    license: { type: 'string', minLength: 1 },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
    specpm: { type: 'string' },
    entities: {
      type: 'array',
      items: { type: 'string' },
    },
    states: {
      type: 'array',
      items: { type: 'string' },
    },
    constraints: { type: 'string' },
    docs: {
      type: 'array',
      items: { type: 'string' },
    },
    dependencies: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    peerDependencies: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    context: {
      type: 'object',
      properties: {
        priority: {
          type: 'array',
          items: { type: 'string' },
        },
        tokenBudget: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const
