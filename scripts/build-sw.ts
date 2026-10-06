/// <reference types="node" />
// Builds dist/sw.js once dist/ is complete (called last by scripts/build.ts): bundles
// src/offline/sw.ts with Vite into one classic script, then replaces `self.__WB_MANIFEST`
// with the precache list (src/offline/precache.ts) computed from the files in dist/.
// The approach follows mikezupper-blog-astro's scripts/build-service-worker.mjs.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { build, type Rolldown } from 'vite';
import { isPrecached, precacheEntries, type BuiltFile } from '../src/offline/precache.js';

const INJECTION_POINT = 'self.__WB_MANIFEST';

/** The precached files in dist/, with their bytes for the revision hash. */
async function builtFiles(dist: string): Promise<BuiltFile[]> {
  const files: BuiltFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(dist, path).split(sep).join('/');
      if (entry.isDirectory()) await walk(path);
      // Read only what's precached: the full archive's 227k pages would not fit in memory.
      else if (isPrecached(rel)) files.push({ path: rel, content: await readFile(path) });
    }
  };
  await walk(dist);
  return files;
}

const sha = (content: Uint8Array | string): string =>
  createHash('sha256').update(content).digest('hex').slice(0, 16);

export async function buildServiceWorker(
  dist: string,
): Promise<{ readonly entries: number; readonly kb: string }> {
  const result = (await build({
    configFile: false,
    logLevel: 'warn',
    // Workbox checks process.env.NODE_ENV for its debug logging; a worker has no `process`.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: true,
      emptyOutDir: false,
      rollupOptions: {
        input: 'src/offline/sw.ts',
        output: { format: 'iife', entryFileNames: 'sw.js' },
      },
    },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
  const output = (Array.isArray(result) ? result[0] : result)?.output[0];
  if (output?.type !== 'chunk') throw new Error('service worker: Vite produced no chunk');
  if (!output.code.includes(INJECTION_POINT)) {
    throw new Error(
      `service worker: "${INJECTION_POINT}" is missing from the bundle. src/offline/sw.ts must pass it to precacheAndRoute().`,
    );
  }
  const entries = precacheEntries(await builtFiles(dist), sha);
  const code = output.code.replace(INJECTION_POINT, JSON.stringify(entries));
  await writeFile(join(dist, 'sw.js'), code);
  return { entries: entries.length, kb: (code.length / 1024).toFixed(1) };
}
