/// <reference types="node" />
// `pnpm build`, after `vite build` (ADR 0011): pages render on request, so the build writes
// their data, not their HTML. dist/ gets the public files (assets, 404.html, the sitemaps, the
// service worker) and <dist>-api/ the app's data: pages.sqlite (pages and search), Explore's
// database and Ask's schema.
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { loadSiteData } from '../src/data/archive.js';
import { WOOKIEEPEDIA_DIR } from '../src/data/wookieepedia.js';
import { dumpPath, prepareSnapshot, workersFrom } from '../src/ingest/wookieepedia/source.js';
import { createSite, sitemaps } from '../src/render/site.js';
import { writePages } from '../src/server/pages.js';
import { SHELL_PATHS } from '../src/offline/precache.js';
import { askSchema } from '../src/domain/ask.js';
import { exploreRows } from '../src/domain/rows.js';
import { buildDatabase } from './build-database.js';
import { buildServiceWorker } from './build-sw.js';
import { siteAssets } from './lib/assets.js';

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
  const assets = await siteAssets(dist);
  const site = createSite(assets, data);
  // The build's id: every page's ETag, and the precached pages' revision.
  const build = Date.now().toString(36);
  // The app's data (ADRs 0010, 0011), beside the public site (<dist>-api/), not in it: Caddy
  // never serves it. The pages first, then Explore's database and what Ask tells the model.
  const api = apiDir(dist);
  await stage('pages', () => {
    writePages(join(api, 'pages.sqlite'), data, { build, assets }, data.redirects);
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
  // Last: the service worker's precache list covers everything written above, and the shell
  // pages, which the app renders, by the build's id.
  const sw = await stage('service worker', () =>
    buildServiceWorker(dist, { shell: SHELL_PATHS, build }),
  );
  console.log(`service worker: ${String(sw.entries)} precached files, sw.js ${sw.kb} KB`);
  return site.paths;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // DIST_DIR: where the site goes. The gate's sample build uses .sample/, so it never replaces
  // the full build in dist/ that `pnpm dev` serves search and Explore from (lessons-learned).
  const paths = await buildSite(
    fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url)),
  );
  console.log(`built ${String(paths.length)} pages`);
}
