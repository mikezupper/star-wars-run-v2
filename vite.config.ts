import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// The client build: the site stylesheet (and, once pages have islands, their entry),
// content-hashed, with a manifest that scripts/build.ts reads to link them from the
// prerendered pages.
// gyralVitePreset(): Gyral's Vite settings (one Lit copy, deps pre-bundled for the dev server).
export default defineConfig({
  ...gyralVitePreset(),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: ['src/styles/site.css'] },
  },
});
