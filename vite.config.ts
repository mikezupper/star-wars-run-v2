import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// The client build: the islands' entry, the every-page script (search key, service worker) and the stylesheet,
// content-hashed, with a manifest that scripts/build.ts reads to link them from the
// prerendered pages.
// gyralVitePreset(): Gyral's Vite settings. In `vite build` it precompiles the islands'
// templates, and a template that breaks one of Gyral's rules fails the build.
export default defineConfig({
  ...gyralVitePreset(),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: ['src/entry-client.ts', 'src/page.ts', 'src/styles/site.css'] },
  },
});
