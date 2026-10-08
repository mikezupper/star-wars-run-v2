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
    // DIST_DIR: the gate's sample build goes to .sample/ (scripts/build.ts).
    outDir: process.env['DIST_DIR'] ?? 'dist',
    emptyOutDir: true,
    manifest: true,
    // Fonts stay files, however small: the CSP allows fonts from the site only (font-src 'self'),
    // not the data: URIs Vite would inline them as. Other small assets inline as usual.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: { input: ['src/entry-client.ts', 'src/page.ts', 'src/styles/site.css'] },
  },
});
