/// <reference types="node" />
// `pnpm build:explore`: writes only Explore's database (from the full archive) and the DuckDB
// engine into dist/, without prerendering any page. For trying Explore in `pnpm dev` on all
// ~227k articles; `pnpm build` and `pnpm build:sample` write the same files as part of a build.
import { fileURLToPath } from 'node:url';
import { loadSiteData } from '../src/data/archive.js';
import { exploreRows } from '../src/domain/rows.js';
import { copyDuckDb } from './build.js';
import { buildDatabase } from './build-database.js';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const started = Date.now();
const data = await loadSiteData();
await buildDatabase(dist, exploreRows(data.archive, data.articles));
await copyDuckDb(dist);
console.log(
  `explore: ${String(data.archive.byTitle.size)} articles → dist/data/archive.duckdb in ${String(Math.round((Date.now() - started) / 1000))}s`,
);
