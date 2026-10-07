import { defineConfig, loadEnv } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// The client build: the islands' entry, the every-page script (search key, service worker) and the stylesheet,
// content-hashed, with a manifest that scripts/build.ts reads to link them from the
// prerendered pages.
// gyralVitePreset(): Gyral's Vite settings. In `vite build` it precompiles the islands'
// templates, and a template that breaks one of Gyral's rules fails the build.
export default defineConfig(({ mode }) => {
  // Ask the archive's model name, from the environment or .env. Only this one variable is read
  // for the browser: the key stays on the server (src/hosting/ask.ts).
  const model = process.env['ASK_MODEL'] ?? loadEnv(mode, process.cwd(), 'ASK_MODEL')['ASK_MODEL'];
  return {
    ...gyralVitePreset(),
    define: { __ASK_MODEL__: JSON.stringify(model ?? '') },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      manifest: true,
      rollupOptions: { input: ['src/entry-client.ts', 'src/page.ts', 'src/styles/site.css'] },
    },
  };
});
