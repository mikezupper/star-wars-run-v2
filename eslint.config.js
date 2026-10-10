// Lint rules are agent guardrails: every restriction message says how to fix it.
// Layers and allowed edges: ARCHITECTURE.md. The import rules below are that table, enforced.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import gyral from '@gyral/core/eslint';

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
  'Only scripts/ingest-wookieepedia.ts uses src/ingest: raw wikitext must never reach the build or the browser. Read articles through src/data, or move the shared code to src/domain.',
];
const DATA = [
  '(^|/)data/',
  'src/data reads files from disk at build time. Take the site data as a parameter instead; scripts/build.ts and scripts/dev.ts load it.',
];
const RENDER = [
  '(^|/)render/',
  'src/render is server-only page templates. Move what you need into src/domain (pure) or src/site.ts (constants).',
];
const ISLANDS = [
  '(^|/)islands/',
  'Only src/render may import islands (to server-render them). Lower layers must not depend on UI.',
];
const GYRAL = [
  '^@gyral/',
  'Rendering belongs in src/render (pages) or src/islands (interactive components).',
];
const GYRAL_SSR = [
  '^@gyral/ssr',
  'Islands run in the browser: use @gyral/core define(). @gyral/ssr is for src/render.',
];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.sample/',
      '.server/',
      'dist-api/',
      '.sample-api/',
      'coverage/',
      '.smoke/',
      '.claude/',
      '.beads/',
      '.pnpm-store/',
      '.gyral/',
      'node_modules/',
    ],
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
    // Playwright: page.evaluate() callbacks run in the browser.
    files: ['scripts/smoke.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
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
  // Gyral's template rules (docs/references/gyral/views.md): the same checks the template
  // compiler runs in `vite build`, in the editor and in `pnpm lint`, for page templates too.
  { files: ['src/**/*.ts'], ...gyral.configs.recommended },
  // The layer table from ARCHITECTURE.md.
  {
    files: ['src/site.ts'],
    rules: forbid([
      '.',
      'src/site.ts holds constants every layer reads, so it imports nothing. Put the code that needs this import in the layer that uses it.',
    ]),
  },
  {
    // Every user-facing string; read by pages and islands alike, so it depends on types only.
    files: ['src/labels.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    files: ['src/page.ts', 'src/hyperspace.ts', 'src/previews.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    // The header policy is plain data; preview and the Caddyfile generator read it.
    files: ['src/hosting/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    // The precache list is pure; the worker imports only Workbox.
    files: ['src/offline/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    files: ['src/ingest/**/*.ts'],
    rules: forbid(DATA, RENDER, ISLANDS, GYRAL),
  },
  {
    files: ['src/data/**/*.ts'],
    rules: forbid(INGEST, RENDER, ISLANDS, GYRAL),
  },
  {
    // The app (ADRs 0010, 0011): Node, DuckDB and SQLite, behind Caddy. It renders pages through
    // src/render, so that layer is allowed; islands and Gyral directly are not.
    files: ['src/server/**/*.ts'],
    rules: forbid(INGEST, DATA, ISLANDS, GYRAL),
  },
  {
    files: ['src/render/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA),
  },
  {
    files: ['src/islands/**/*.ts'],
    rules: forbid(NODE, INGEST, DATA, RENDER, GYRAL_SSR),
  },
);
