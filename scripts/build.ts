/// <reference types="node" />
// `pnpm build`, after `vite build` (ADR 0011): pages render on request, so the build writes
// their data, not their HTML. dist/ gets the public files (assets, 404.html, the sitemaps, the
// search indexes, the service worker) and <dist>-api/ the app's data: pages.sqlite, Explore's
// database and Ask's schema.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest } from '@gyral/ssr/static';
import * as pagefind from 'pagefind';
import { homedir } from 'node:os';
import { loadSiteData } from '../src/data/archive.js';
import { WOOKIEEPEDIA_DIR } from '../src/data/wookieepedia.js';
import { dumpPath, prepareSnapshot, workersFrom } from '../src/ingest/wookieepedia/source.js';
import { displayTitle } from '../src/domain/archive.js';
import { createSite, sitemaps, type SiteData } from '../src/render/site.js';
import { writePages } from '../src/server/pages.js';
import { SECTIONS } from '../src/domain/sections.js';
import { askSchema } from '../src/domain/ask.js';
import { exploreRows } from '../src/domain/rows.js';
import { titleShards } from '../src/domain/titles.js';
import { buildDatabase } from './build-database.js';
import { buildServiceWorker } from './build-sw.js';

/** `SITE_SAMPLE=20 pnpm build`: a quick build of a sample (ADR 0008); unset builds everything. */
const sampleOption = (): { sample?: number } => {
  const n = Number(process.env['SITE_SAMPLE']);
  return Number.isInteger(n) && n > 0 ? { sample: n } : {};
};

/** Where the API's data goes for a build in `dist`: beside it, in <dist>-api/. */
export const apiDir = (dist: string): string => `${dist.replace(/\/+$/, '')}-api`;

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
  const assets = {
    stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css'),
    clientEntry: await clientEntryFromManifest(manifest, 'src/entry-client.ts'),
    page: await clientEntryFromManifest(manifest, 'src/page.ts'),
  };
  const site = createSite(assets, data);
  // The build's id: every page's ETag, and the precached pages' revision.
  const build = Date.now().toString(36);
  // The app's data (ADRs 0010, 0011), beside the public site (<dist>-api/), not in it: Caddy
  // never serves it. The pages first, then Explore's database and what Ask tells the model.
  const api = apiDir(dist);
  await stage('pages', () => {
    writePages(join(api, 'pages.sqlite'), data, { build, assets });
    return Promise.resolve();
  });
  // For Caddy's own errors (a missing asset); the app renders its 404s itself.
  await writeFile(join(dist, '404.html'), await site.notFound());
  for (const [file, xml] of sitemaps(site.sitemapPaths)) await writeFile(join(dist, file), xml);
  // The manifest is build metadata, not a page asset: don't publish it.
  await rm(join(dist, '.vite'), { recursive: true, force: true });
  const rows = exploreRows(data.archive, data.articles);
  await stage('explore database', () => buildDatabase(api, rows));
  await writeFile(
    join(api, 'ask-schema.json'),
    JSON.stringify(askSchema(rows.archive, rows.facts)),
  );
  await stage('search index', () => indexForSearch(dist, data));
  await stage('title index', () => writeTitleIndex(dist, data));
  // Last: the service worker's precache list covers everything written above, and the shell
  // pages, which the app renders, by the build's id.
  const shell = ['/', '/search/', '/offline/', ...SECTIONS.map((s) => `/${s}/`)];
  const sw = await stage('service worker', () => buildServiceWorker(dist, { shell, build }));
  console.log(`service worker: ${String(sw.entries)} precached files, sw.js ${sw.kb} KB`);
  return site.paths;
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
 * The site search index (docs/product-specs/search.md): one Pagefind record per article, its
 * title, lead and facts as text, filterable by section (`kind`), written as static files to
 * dist/pagefind/. With no HTML pages to crawl (ADR 0011), the records come from the data. The
 * search island loads pagefind.js from there; Pagefind's own UI bundles aren't published.
 * Server search replaces all of this (swr-sgf.5).
 */
async function indexForSearch(dist: string, data: SiteData): Promise<void> {
  const { index, errors } = await pagefind.createIndex({});
  if (index === undefined) throw new Error(`pagefind: ${errors.join('; ')}`);
  for (const entry of data.archive.byTitle.values()) {
    const record = data.articles.get(entry.title);
    if (record === undefined) continue;
    const title = displayTitle(entry.title);
    const text = (runs: readonly { readonly text: string }[]) => runs.map((r) => r.text).join('');
    const added = await index.addCustomRecord({
      url: entry.path,
      content: [
        title,
        ...record.lead.map(text),
        ...record.fields.flatMap((f) => f.items.map(text)),
      ].join('\n'),
      language: 'en',
      meta: { title },
      filters: { kind: [entry.section] },
    });
    if (added.errors.length > 0) throw new Error(`pagefind: ${added.errors.join('; ')}`);
  }
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
