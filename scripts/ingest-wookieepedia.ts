/// <reference types="node" />
// `pnpm ingest:wookieepedia [path/to/starwars_pages_current.xml.7z] [--workers N]`: builds the
// Wookieepedia snapshot in data/wookieepedia/ from a dump you downloaded
// (docs/design-docs/0007-wookieepedia.md). It never downloads anything. The default path is
// where the owner keeps the dump. With the default worker count (one per core but one) a full
// run takes about 6.5 minutes and up to 6.5 GB of memory on 12 cores; fewer workers use less
// memory and take longer.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ingest } from '../src/ingest/wookieepedia/ingest.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { workers: { type: 'string' } },
});
const dump = positionals[0] ?? join(homedir(), 'Downloads', 'starwars_pages_current.xml.7z');
const out = fileURLToPath(new URL('../data/wookieepedia/', import.meta.url));
const meta = await ingest({
  dump,
  out,
  log: (m) => {
    console.log(m);
  },
  ...(values.workers === undefined ? {} : { workers: Number(values.workers) }),
});
console.log(JSON.stringify(meta.counts, null, 2));
