/// <reference types="node" />
// `pnpm build:explore`: writes only Explore's database (from the full archive), Ask the
// archive's schema and the DuckDB engine into dist/, without prerendering any page. For trying Explore in `pnpm dev` on all
// ~227k articles; `pnpm build` and `pnpm build:sample` write the same files as part of a build.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteData } from '../src/data/archive.js';
import { askSchema } from '../src/domain/ask.js';
import { exploreRows } from '../src/domain/rows.js';
import { copyDuckDb } from './build.js';
import { buildDatabase } from './build-database.js';

const dist = fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url));
const started = Date.now();
const data = await loadSiteData();
const rows = exploreRows(data.archive, data.articles);
await buildDatabase(dist, rows);
await writeFile(
  join(dist, 'data', 'ask-schema.json'),
  JSON.stringify(askSchema(rows.archive, rows.facts)),
);
await copyDuckDb(dist);
console.log(
  `explore: ${String(data.archive.byTitle.size)} articles → dist/data/archive.duckdb in ${String(Math.round((Date.now() - started) / 1000))}s`,
);
