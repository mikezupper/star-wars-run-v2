/// <reference types="node" />
// `pnpm build`, after `vite build`: renders every page to dist/ as static HTML, plus 404.html
// and sitemap.xml. dist/ is then exactly what the Docker image serves.
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import * as pagefind from 'pagefind';
import { loadSiteData } from '../src/data/archive.js';
import { createSite, sitemap } from '../src/render/site.js';
import { exploreRows } from '../src/domain/rows.js';
import { buildDatabase } from './build-database.js';
import { buildServiceWorker } from './build-sw.js';
import { ORIGIN } from '../src/site.js';

/** `SITE_SAMPLE=20 pnpm build`: a quick build of a sample (ADR 0008); unset builds everything. */
const sampleOption = (): { sample?: number } => {
  const n = Number(process.env['SITE_SAMPLE']);
  return Number.isInteger(n) && n > 0 ? { sample: n } : {};
};

export async function buildSite(dist: string): Promise<readonly string[]> {
  const manifest = join(dist, '.vite', 'manifest.json');
  const data = await loadSiteData(sampleOption());
  const site = createSite(
    {
      stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css'),
      clientEntry: await clientEntryFromManifest(manifest, 'src/entry-client.ts'),
      page: await clientEntryFromManifest(manifest, 'src/page.ts'),
    },
    data,
  );
  const pages = await prerender({ app: site, paths: site.paths, outDir: dist, origin: ORIGIN });
  await writeFile(join(dist, '404.html'), await site.notFound());
  await writeFile(join(dist, 'sitemap.xml'), sitemap(site.sitemapPaths));
  // The manifest is build metadata, not a page asset: don't publish it.
  await rm(join(dist, '.vite'), { recursive: true, force: true });
  // The Explore page's data and engine (swr-7f1.7): a DuckDB database and DuckDB-WASM,
  // self-hosted because the CSP allows only this origin.
  await buildDatabase(dist, exploreRows(data.archive, data.articles));
  await copyDuckDb(dist);
  await indexForSearch(dist);
  // Last: the service worker's precache list covers everything written above.
  const sw = await buildServiceWorker(dist);
  console.log(`service worker: ${String(sw.entries)} precached files, sw.js ${sw.kb} KB`);
  return pages.map((p) => p.path);
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
  const paths = await buildSite(fileURLToPath(new URL('../dist', import.meta.url)));
  console.log(`built ${String(paths.length)} pages`);
}

/** DuckDB-WASM's engine and worker (the `eh` build: WebAssembly exceptions, Baseline). */
async function copyDuckDb(dist: string): Promise<void> {
  // The package doesn't export package.json; its main entry sits in dist/ beside the engine.
  const from = dirname(createRequire(import.meta.url).resolve('@duckdb/duckdb-wasm'));
  await mkdir(join(dist, 'duckdb'), { recursive: true });
  for (const file of ['duckdb-eh.wasm', 'duckdb-browser-eh.worker.js']) {
    await copyFile(join(from, file), join(dist, 'duckdb', file));
  }
}
