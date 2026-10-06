/// <reference types="node" />
// `pnpm ci:local`: runs .github/workflows/ci.yml in Docker with `gh act`, never on GitHub
// (docs/design-docs/0006-workflow.md). Only when the owner asks. The workflow builds the
// site from the Wookieepedia dump, which isn't in the repo (ADR 0007), so the dump file alone
// (not its folder) is mounted read-only into the job's container under /dump.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { DUMP_ENV, dumpPath, missingDump } from '../src/ingest/wookieepedia/source.js';

const dump = dumpPath(process.env, homedir());
if (!existsSync(dump)) {
  console.error(missingDump(dump));
  process.exit(1);
}
const args = [
  'act',
  'workflow_dispatch',
  '-W',
  '.github/workflows/ci.yml',
  '--container-options',
  `-v ${dump}:/dump/${basename(dump)}:ro`,
  '--env',
  `${DUMP_ENV}=/dump/${basename(dump)}`,
];
console.log(`gh ${args.join(' ')}`);
process.exit(spawnSync('gh', args, { stdio: 'inherit' }).status ?? 1);
