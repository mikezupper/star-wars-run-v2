/// <reference types="node" />
// `pnpm build`, after `vite build`: renders every page to dist/ as static HTML, plus 404.html
// and sitemap.xml. dist/ is then exactly what the Docker image serves.
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import * as pagefind from 'pagefind';
import { loadDataset } from '../src/data/load.js';
import { createSite, sitemap } from '../src/render/site.js';
import { buildServiceWorker } from './build-sw.js';
import { ORIGIN } from '../src/site.js';

export async function buildSite(dist: string): Promise<readonly string[]> {
  const manifest = join(dist, '.vite', 'manifest.json');
  const site = createSite(
    {
      stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css'),
      clientEntry: await clientEntryFromManifest(manifest, 'src/entry-client.ts'),
      page: await clientEntryFromManifest(manifest, 'src/page.ts'),
    },
    await loadDataset(),
  );
  const pages = await prerender({ app: site, paths: site.paths, outDir: dist, origin: ORIGIN });
  await writeFile(join(dist, '404.html'), await site.notFound());
  await writeFile(join(dist, 'sitemap.xml'), sitemap(site.sitemapPaths));
  // The manifest is build metadata, not a page asset: don't publish it.
  await rm(join(dist, '.vite'), { recursive: true, force: true });
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
