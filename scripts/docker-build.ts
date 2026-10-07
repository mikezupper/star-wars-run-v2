/// <reference types="node" />
// `pnpm docker:build`: builds the production image from this checkout plus the Wookieepedia dump
// ($WOOKIEEPEDIA_DUMP, else ~/Downloads). The dump goes in as the `dump` build context, mounted
// only for the build step (see Dockerfile), so it never lands in an image layer. The context is
// a temporary folder holding just the dump: Docker sends a context folder whole, and the
// dump's own folder (~/Downloads) can hold gigabytes of other files (docs/lessons-learned.md). Takes about 15 minutes:
// the ingest, then every page.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpPath, missingDump, WORKERS_ENV } from '../src/ingest/wookieepedia/source.js';

const dump = dumpPath(process.env, homedir());
if (!existsSync(dump)) {
  console.error(missingDump(dump));
  process.exit(1);
}
// One fixed folder under node_modules/.cache, emptied and refilled on every run, so an
// interrupted build leaves nothing to clean up. It's ignored by git and Docker, and on the same
// filesystem as the checkout, so the dump is usually hard-linked (no copy, no space). /tmp is
// often a separate in-memory filesystem, where a link fails and 262 MB would be copied.
const context = fileURLToPath(new URL('../node_modules/.cache/swr-docker-dump/', import.meta.url));
rmSync(context, { recursive: true, force: true });
mkdirSync(context, { recursive: true });
try {
  linkSync(dump, join(context, basename(dump)));
} catch {
  copyFileSync(dump, join(context, basename(dump))); // another filesystem: copy instead
}
const workers = process.env[WORKERS_ENV];
// The model name only: the key never goes into the build (it's given at `docker run`).
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const model = process.env['ASK_MODEL'];
const args = [
  'build',
  '--build-context',
  `dump=${context}`,
  '--build-arg',
  `DUMP_FILE=${basename(dump)}`,
  ...(workers === undefined ? [] : ['--build-arg', `${WORKERS_ENV}=${workers}`]),
  ...(model === undefined ? [] : ['--build-arg', `ASK_MODEL=${model}`]),
  '-t',
  'starwars-run',
  '.',
];
console.log(`docker ${args.join(' ')}`);
process.exit(spawnSync('docker', args, { stdio: 'inherit' }).status ?? 1);
