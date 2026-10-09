/// <reference types="node" />
// The client build's entry files, read from Vite's manifest in <dist>/.vite/: the full build
// (scripts/build.ts), the image build (scripts/build-image.ts) and the API's bundle
// (scripts/build-api.ts) all link the same hashed CSS and JS.
import { join } from 'node:path';
import { clientEntryFromManifest } from '@gyral/ssr/static';
import type { Assets } from '../../src/render/layout.js';

export async function siteAssets(dist: string): Promise<Assets> {
  const manifest = join(dist, '.vite', 'manifest.json');
  return {
    stylesheet: await clientEntryFromManifest(manifest, 'src/styles/site.css'),
    clientEntry: await clientEntryFromManifest(manifest, 'src/entry-client.ts'),
    page: await clientEntryFromManifest(manifest, 'src/page.ts'),
  };
}
