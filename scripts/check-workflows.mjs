// `pnpm invariants`: every GitHub workflow is triggered by workflow_dispatch only.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkWorkflow } from './lib/workflows.mjs';

const dir = '.github/workflows';
const errors = readdirSync(dir)
  .filter((f) => /\.ya?ml$/.test(f))
  .flatMap((f) => checkWorkflow(join(dir, f), readFileSync(join(dir, f), 'utf8')));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('check-workflows: only workflow_dispatch triggers');
