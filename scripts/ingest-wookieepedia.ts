/// <reference types="node" />
// `pnpm ingest:wookieepedia [path/to/starwars_pages_current.xml.7z] [--workers N] [--force]`: builds the
// Wookieepedia snapshot in data/wookieepedia/ from a dump you downloaded
// (docs/design-docs/0007-wookieepedia.md). It never downloads anything. Without a path it uses
// $WOOKIEEPEDIA_DUMP, else ~/Downloads (src/ingest/wookieepedia/source.ts). `pnpm build` runs
// the same ingest first, so this is for rebuilding on purpose (--force) or a dump elsewhere. With the default worker count (one per core but one) a full
// run takes about 6.5 minutes and up to 6.5 GB of memory on 12 cores; fewer workers use less
// memory and take longer. A snapshot already built from the same dump by the same code is kept
// (ADR 0007: the snapshot is rebuilt from the dump, never stored); --force rebuilds it.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ingest } from '../src/ingest/wookieepedia/ingest.js';
import { dumpPath, missingDump, workersFrom } from '../src/ingest/wookieepedia/source.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { workers: { type: 'string' }, force: { type: 'boolean' } },
});
const dump = positionals[0] ?? dumpPath(process.env, homedir());
if (!existsSync(dump)) {
  console.error(missingDump(dump));
  process.exit(1);
}
const workers = values.workers === undefined ? workersFrom(process.env) : Number(values.workers);
const out = fileURLToPath(new URL('../data/wookieepedia/', import.meta.url));
const meta = await ingest({
  dump,
  out,
  force: values.force === true,
  log: (m) => {
    console.log(m);
  },
  ...(workers === undefined ? {} : { workers }),
});
console.log(JSON.stringify(meta.counts, null, 2));
