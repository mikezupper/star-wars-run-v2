/// <reference types="node" />
// `pnpm build`, after `vite build`: renders every page to dist/ as static HTML, plus 404.html
// and sitemap.xml. dist/ is then exactly what the Docker image serves.
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { loadDataset } from '../src/data/load.js';
import { createSite, sitemap } from '../src/render/site.js';
import { ORIGIN } from '../src/site.js';

export async function buildSite(dist: string): Promise<readonly string[]> {
  const manifest = join(dist, '.vite', 'manifest.json');
  const site = createSite(
    { stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css') },
    await loadDataset(),
  );
  const pages = await prerender({ app: site, paths: site.paths, outDir: dist, origin: ORIGIN });
  await writeFile(join(dist, '404.html'), await site.notFound());
  await writeFile(join(dist, 'sitemap.xml'), sitemap(site.sitemapPaths));
  // The manifest is build metadata, not a page asset: don't publish it.
  await rm(join(dist, '.vite'), { recursive: true, force: true });
  return pages.map((p) => p.path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = await buildSite(fileURLToPath(new URL('../dist', import.meta.url)));
  console.log(`built ${String(paths.length)} pages`);
}
