// Lint rules are agent guardrails: every restriction message says how to fix it.
// Layers and allowed edges: ARCHITECTURE.md. The import rules below are that table, enforced.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const SEE = 'See the Layers table in ARCHITECTURE.md.';

/** Forbidden imports for one layer, as no-restricted-imports regex patterns. */
const forbid = (...rules) => ({
  'no-restricted-imports': [
    'error',
    { patterns: rules.map(([regex, message]) => ({ regex, message: `${message} ${SEE}` })) },
  ],
});

// Each entry: [regex over the import specifier, why it's wrong and what to do instead].
const NODE = [
  '^node:',
  'Node built-ins are not allowed in this layer: it also runs in the browser. Do the I/O in src/data or src/ingest and pass the result in.',
];
const INGEST = [
  '(^|/)ingest/',
  'Only scripts/ingest.ts uses src/ingest: raw source data must never reach the build or the browser. Read records through src/data, or move the shared code to src/domain.',
];
const DATA = [
  '(^|/)data/',
  'src/data reads files from disk at build time. Take a Dataset as a parameter instead; scripts/build.ts and scripts/dev.ts load it.',
];
const RENDER = [
  '(^|/)render/',
  'src/render is server-only page templates. Move what you need into src/domain (pure) or src/site.ts (constants).',
];
const ISLANDS = [
  '(^|/)islands/',
  'Only src/render may import islands (to server-render them). Lower layers must not depend on UI.',
];
const VALIBOT = [
  '^valibot$',
  'Schema checks belong at the boundary, in src/ingest. Code past it relies on the domain types.',
];
const GYRAL = [
  '^@gyral/|^lit($|/)',
  'Rendering belongs in src/render (pages) or src/islands (interactive components).',
];
const GYRAL_SSR = [
  '^@gyral/ssr',
  'Islands run in the browser: use @gyral/core define(). @gyral/ssr is for src/render.',
];

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', '.claude/', '.beads/', '.pnpm-store/', 'node_modules/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    // Taste invariants for application code. no-console: src/ returns values or throws; only
    // scripts/ print. max-lines: split a file that outgrows one screenful of purpose.
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
      'max-lines': ['error', { max: 450, skipBlankLines: true, skipComments: true }],
    },
  },
  // The layer table from ARCHITECTURE.md.
  {
    files: ['src/site.ts'],
    rules: forbid([
      '.',
      'src/site.ts holds constants every layer reads, so it imports nothing. Put the code that needs this import in the layer that uses it.',
    ]),
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, VALIBOT, GYRAL),
  },
  {
    files: ['src/ingest/**/*.ts'],
    rules: forbid(DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    files: ['src/data/**/*.ts'],
    rules: forbid(INGEST, RENDER, ISLANDS, VALIBOT, GYRAL),
  },
  {
    files: ['src/render/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, VALIBOT),
  },
  {
    files: ['src/islands/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, VALIBOT, GYRAL_SSR),
  },
);
