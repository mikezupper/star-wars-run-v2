/// <reference types="node" />
// `pnpm build:questions`: bundles the question log service (scripts/question-log.ts) into one
// file, .server/question-log.mjs, for its container: plain Node, no node_modules (it uses only
// node: built-ins).
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  publicDir: false,
  build: {
    ssr: 'scripts/question-log.ts',
    outDir: '.server',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'question-log.mjs' } },
  },
  ssr: { target: 'node', noExternal: true },
});
console.log('wrote .server/question-log.mjs');
