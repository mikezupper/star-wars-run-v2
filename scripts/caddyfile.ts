/// <reference types="node" />
// `pnpm caddyfile`: writes Caddyfile from src/hosting/headers.ts. Run it after changing the
// header policy and commit the result; test/hosting/headers.test.ts fails until you do.
import { writeFile } from 'node:fs/promises';
import { caddyfile } from '../src/hosting/headers.js';

await writeFile(new URL('../Caddyfile', import.meta.url), caddyfile());
console.log('wrote Caddyfile');
