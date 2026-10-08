/// <reference types="node" />
// `pnpm build`, after `vite build`: renders every page to dist/ as static HTML, plus 404.html
// and the sitemaps. dist/ is then exactly what the Docker image serves.
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import * as pagefind from 'pagefind';
import { homedir } from 'node:os';
import { loadSiteData } from '../src/data/archive.js';
import { WOOKIEEPEDIA_DIR } from '../src/data/wookieepedia.js';
import { dumpPath, prepareSnapshot, workersFrom } from '../src/ingest/wookieepedia/source.js';
import { createSite, sitemaps } from '../src/render/site.js';
import { askSchema } from '../src/domain/ask.js';
import { exploreRows } from '../src/domain/rows.js';
import { titleShards } from '../src/domain/titles.js';
import { buildDatabase } from './build-database.js';
import { buildServiceWorker } from './build-sw.js';
import { ORIGIN } from '../src/site.js';

/** `SITE_SAMPLE=20 pnpm build`: a quick build of a sample (ADR 0008); unset builds everything. */
const sampleOption = (): { sample?: number } => {
  const n = Number(process.env['SITE_SAMPLE']);
  return Number.isInteger(n) && n > 0 ? { sample: n } : {};
};

/** Where the API's data goes for a build in `dist`: beside it, in <dist>-api/. */
export const apiDir = (dist: string): string => `${dist.replace(/\/+$/, '')}-api`;

/** No page may be bigger than this (swr-7f1.6). The largest in the full archive is 808 KB. */
export const PAGE_BUDGET_BYTES = 1024 * 1024;

/** Runs one build stage and logs how long it took: the full build's time is spent unevenly. */
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  console.log(`${name}: ${((performance.now() - started) / 1000).toFixed(1)}s`);
  return result;
}

export async function buildSite(dist: string): Promise<readonly string[]> {
  const manifest = join(dist, '.vite', 'manifest.json');
  // The snapshot comes from the dump and is never stored (ADR 0007): bring it up to date
  // first. When it already matches the dump, this is a checksum of the dump and nothing more.
  const workers = workersFrom(process.env);
  await stage('snapshot', () =>
    prepareSnapshot({
      dump: dumpPath(process.env, homedir()),
      out: WOOKIEEPEDIA_DIR,
      log: (m) => {
        console.log(m);
      },
      ...(workers === undefined ? {} : { workers }),
    }),
  );
  const data = await stage('load', () => loadSiteData(sampleOption()));
  const site = createSite(
    {
      stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css'),
      clientEntry: await clientEntryFromManifest(manifest, 'src/entry-client.ts'),
      page: await clientEntryFromManifest(manifest, 'src/page.ts'),
    },
    data,
  );
  const pages = await stage('prerender', () =>
    prerender({ app: site, paths: site.paths, outDir: dist, origin: ORIGIN }),
  );
  await stage('page budget', () => checkPageBudget(dist, site.paths));
  await writeFile(join(dist, '404.html'), await site.notFound());
  for (const [file, xml] of sitemaps(site.sitemapPaths)) await writeFile(join(dist, file), xml);
  // The manifest is build metadata, not a page asset: don't publish it.
  await rm(join(dist, '.vite'), { recursive: true, force: true });
  // The API's data (ADR 0010): Explore's database and what Ask tells the model each section
  // holds, beside the public site (<dist>-api/), not in it: Caddy never serves them.
  const api = apiDir(dist);
  const rows = exploreRows(data.archive, data.articles);
  await stage('explore database', () => buildDatabase(api, rows));
  await writeFile(
    join(api, 'ask-schema.json'),
    JSON.stringify(askSchema(rows.archive, rows.facts)),
  );
  await stage('search index', () => indexForSearch(dist));
  await stage('title index', () => writeTitleIndex(dist, data));
  // Last: the service worker's precache list covers everything written above.
  const sw = await stage('service worker', () => buildServiceWorker(dist));
  console.log(`service worker: ${String(sw.entries)} precached files, sw.js ${sw.kb} KB`);
  return pages.map((p) => p.path);
}

/** Fails the build when a page passes PAGE_BUDGET_BYTES, naming every page that does. */
async function checkPageBudget(dist: string, paths: readonly string[]): Promise<void> {
  const over: string[] = [];
  for (const path of paths) {
    const { size } = await stat(join(dist, path, 'index.html'));
    if (size > PAGE_BUDGET_BYTES) over.push(`${path} (${String(Math.round(size / 1024))} KB)`);
  }
  if (over.length > 0) {
    throw new Error(
      `pages over the ${String(PAGE_BUDGET_BYTES / 1024)} KB budget: ${over.join(', ')}`,
    );
  }
}

/**
 * The search title index (swr-357, src/domain/titles.ts): dist/search-titles/<key>.json, one
 * per three- or four-letter word start, and index.json listing the shards and the keys split
 * by four letters.
 */
async function writeTitleIndex(
  dist: string,
  data: Awaited<ReturnType<typeof loadSiteData>>,
): Promise<void> {
  const { files, split } = titleShards(data.archive, data.links.counts, data.redirects);
  const out = join(dist, 'search-titles');
  await mkdir(out, { recursive: true });
  // `keys` lets the island skip words no title has, rather than fetch a shard that 404s.
  const keys = [...files.keys()].map((f) => f.replace(/\.json$/, '')).sort();
  await writeFile(join(out, 'index.json'), JSON.stringify({ split, keys }));
  for (const [file, rows] of files) await writeFile(join(out, file), JSON.stringify(rows));
  console.log(`title index: ${String(files.size)} shards`);
}

/**
 * The site search index (docs/product-specs/search.md): Pagefind reads each record page's
 * `<main data-pagefind-body>` and its `kind` filter, and writes static index files to
 * dist/pagefind/. The search island loads pagefind.js from there; Pagefind's own UI bundles
 * are not used, so they aren't published.
 */
async function indexForSearch(dist: string): Promise<void> {
  const { index, errors } = await pagefind.createIndex({});
  if (index === undefined) throw new Error(`pagefind: ${errors.join('; ')}`);
  const added = await index.addDirectory({ path: dist });
  if (added.errors.length > 0) throw new Error(`pagefind: ${added.errors.join('; ')}`);
  const out = join(dist, 'pagefind');
  const written = await index.writeFiles({ outputPath: out });
  if (written.errors.length > 0) throw new Error(`pagefind: ${written.errors.join('; ')}`);
  await pagefind.close();
  for (const file of await readdir(out)) {
    if (/^pagefind-(?:component-ui|modular-ui|ui|highlight)\./.test(file))
      await rm(join(out, file));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // DIST_DIR: where the site goes. The gate's sample build uses .sample/, so it never replaces
  // the full build in dist/ that `pnpm dev` serves search and Explore from (lessons-learned).
  const paths = await buildSite(
    fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url)),
  );
  console.log(`built ${String(paths.length)} pages`);
}
