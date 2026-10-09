/// <reference types="node" />
// `pnpm docker:push`: pushes the images `pnpm docker:build` made for this commit, both tags, to
// your registry. No registry is written into the repo: it comes from IMAGE.
//
//   docker login ghcr.io
//   IMAGE=ghcr.io/you/starwars-run pnpm docker:build
//   IMAGE=ghcr.io/you/starwars-run pnpm docker:push
//
// Then on the server: STARWARS_TAG=<commit> in .env, `docker compose pull && docker compose up -d`
// (docs/deploy.md). The API image carries the archive, so each push sends about 1.1 GB.
import { spawnSync } from 'node:child_process';

const image = process.env['IMAGE'];
if (image === undefined || !image.includes('/')) {
  console.error(
    `IMAGE must be your registry path, e.g. IMAGE=ghcr.io/you/starwars-run (got '${image ?? ''}')`,
  );
  process.exit(1);
}
const sha = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
  encoding: 'utf8',
}).stdout.trim();
for (const name of [image, `${image}-api`]) {
  for (const tag of [sha, 'latest']) {
    console.log(`docker push ${name}:${tag}`);
    const status =
      spawnSync('docker', ['push', `${name}:${tag}`], { stdio: 'inherit' }).status ?? 1;
    if (status !== 0) process.exit(status);
  }
}
console.log(
  `pushed ${image}:${sha} and ${image}-api:${sha} (and latest). Deploy with STARWARS_TAG=${sha}.`,
);
