import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// The client build: discovered components, the every-page script and the stylesheet, hashed.
// The build and code-only API image read both manifests before removing .vite/.
// gyralVitePreset(): Gyral's Vite settings. In `vite build` it precompiles the islands'
// templates, and a template that breaks one of Gyral's rules fails the build.
export default defineConfig({
  ...gyralVitePreset({ components: true }),
  build: {
    // DIST_DIR: the gate's sample build goes to .sample/ (scripts/build.ts).
    outDir: process.env['DIST_DIR'] ?? 'dist',
    emptyOutDir: true,
    manifest: true,
    // Fonts stay files, however small: the CSP allows fonts from the site only (font-src 'self'),
    // not the data: URIs Vite would inline them as. Other small assets inline as usual.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: { input: ['src/page.ts', 'src/styles/site.css'] },
  },
});
