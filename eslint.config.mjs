import next from 'eslint-config-next'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * ESLint flat config (Block 22 build gate).
 *
 * The custom rules below encode constraints from .claude/rules/ that the type system
 * cannot express. They are errors, not warnings: a warning in CI is a rule nobody
 * enforces.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...[next, nextCoreWebVitals, nextTypescript].flat(),

  {
    rules: {
      // rules/frontend.md 2: `any` requires a justification, so it cannot pass
      // silently. Escape hatches must carry a description.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 12,
        },
      ],
      // Unused code is either a mistake or dead weight; an `_` prefix opts out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // rules/backend.md 11: never log a secret. console.log in server code is how
      // that happens by accident; warn and error remain available.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Read configuration through @/lib/env, which validates it.' },
      ],
    },
  },

  {
    // The env modules are the one place that may read process.env — they are the
    // validators everything else goes through. Scoped to that directory rather than
    // a single file since the module was split into public, server and mode
    // (Workstream 2); the exemption is unchanged in kind.
    files: ['src/lib/env/**/*.ts', '*.config.{ts,mjs,js}', 'scripts/**'],
    rules: { 'no-restricted-globals': 'off' },
  },

  {
    // Tests may use console for diagnostics and touch process.env directly.
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-globals': 'off',
    },
  },
]

export default config
