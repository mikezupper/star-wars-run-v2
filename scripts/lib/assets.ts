/// <reference types="node" />
// The client build's entry files, read from Vite's manifest in <dist>/.vite/: the full build
// (scripts/build.ts), the image build (scripts/build-image.ts) and the API's bundle
// (scripts/build-api.ts) all link the same hashed CSS and JS.
import { join } from 'node:path';
import { clientAssetsFromManifest, componentsFromManifest } from '@gyral/ssr/static';
import { storeComponents, type Assets } from '../../src/render/assets.js';

export async function siteAssets(dist: string): Promise<Assets> {
  const manifest = join(dist, '.vite', 'manifest.json');
  const components = await componentsFromManifest(dist);
  if (components === undefined || !components.modules.has('swr-explore')) {
    throw new Error('The client build is missing automatic components, including swr-explore.');
  }
  return {
    stylesheet: (await clientAssetsFromManifest(manifest, 'src/styles/site.css')).entry,
    page: (await clientAssetsFromManifest(manifest, 'src/page.ts')).entry,
    components: storeComponents(components),
  };
}
