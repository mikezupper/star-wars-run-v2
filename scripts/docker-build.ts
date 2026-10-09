/// <reference types="node" />
// `pnpm docker:build`: builds the two production images from this checkout, code only (ADR
// 0003): no dump, no data, a few minutes. The data comes from `pnpm build` (dist-api/) and goes
// into the API's data volume by hand (docs/deploy.md).
//
// Images are linux/amd64, tagged with the commit (12 characters) and `latest`: $IMAGE for the site
// and $IMAGE-api for the API. IMAGE defaults to starwars-run, which compose.yaml runs locally;
// set it to your registry path to push (`pnpm docker:push`).
import { spawnSync } from 'node:child_process';

const git = (...args: string[]): string =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();

const image = process.env['IMAGE'] ?? 'starwars-run';
const sha = git('rev-parse', '--short=12', 'HEAD');
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  console.warn(`warning: uncommitted changes are in the build, so it won't match ${sha} exactly`);
}
const tags = (name: string) => ['-t', `${name}:${sha}`, '-t', `${name}:latest`];
// The site's image (the Dockerfile's last stage), then the API's: the same build stage
// (cached), then its own small stage.
for (const args of [
  ['build', '--platform', 'linux/amd64', ...tags(image), '.'],
  ['build', '--platform', 'linux/amd64', '--target', 'api', ...tags(`${image}-api`), '.'],
]) {
  console.log(`docker ${args.join(' ')}`);
  const status = spawnSync('docker', args, { stdio: 'inherit' }).status ?? 1;
  if (status !== 0) process.exit(status);
}
console.log(`built ${image}:${sha} and ${image}-api:${sha} (and :latest)`);
