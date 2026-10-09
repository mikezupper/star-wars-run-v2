/// <reference types="node" />
// `pnpm docker:build`: builds the production images (the site, and the API) from this
// checkout plus the Wookieepedia dump
// ($WOOKIEEPEDIA_DUMP, else ~/Downloads). The dump goes in as the `dump` build context, mounted
// only for the build step (see Dockerfile), so it never lands in an image layer. The context is
// a temporary folder holding just the dump: Docker sends a context folder whole, and the
// dump's own folder (~/Downloads) can hold gigabytes of other files (docs/lessons-learned.md).
// Takes about 25 minutes: the ingest, then every page.
//
// Images are linux/amd64, tagged with the commit (12 characters) and `latest`: $IMAGE for the site
// and $IMAGE-api for the API. IMAGE defaults to starwars-run, which compose.yaml runs locally;
// set it to your registry path to push (`pnpm docker:push`, docs/deploy.md).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpPath, missingDump, WORKERS_ENV } from '../src/ingest/wookieepedia/source.js';

const git = (...args: string[]): string =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();

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
const image = process.env['IMAGE'] ?? 'starwars-run';
const sha = git('rev-parse', '--short=12', 'HEAD');
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  console.warn(`warning: uncommitted changes are in the build, so it won't match ${sha} exactly`);
}
const common = [
  'build',
  '--platform',
  'linux/amd64',
  '--build-context',
  `dump=${context}`,
  '--build-arg',
  `DUMP_FILE=${basename(dump)}`,
  ...(workers === undefined ? [] : ['--build-arg', `${WORKERS_ENV}=${workers}`]),
];
const tags = (name: string) => ['-t', `${name}:${sha}`, '-t', `${name}:latest`];
// The site's image (the Dockerfile's last stage), then the API's: the same build stage
// (cached), then its own small stage.
for (const args of [
  [...common, ...tags(image), '.'],
  [...common, '--target', 'api', ...tags(`${image}-api`), '.'],
]) {
  console.log(`docker ${args.join(' ')}`);
  const status = spawnSync('docker', args, { stdio: 'inherit' }).status ?? 1;
  if (status !== 0) process.exit(status);
}
console.log(`built ${image}:${sha} and ${image}-api:${sha} (and :latest)`);
