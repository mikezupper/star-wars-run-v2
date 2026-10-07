import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from '@gyral/core/vite';

const preset = gyralVitePreset();

// Node tests for everything under src/. Coverage below 80% on any metric fails `pnpm test`,
// and so `pnpm check`: that is the project's quality bar, not a target to game.
export default defineConfig({
  ...preset,
  // The locator adds `html.at?.(...) ?? html` at each template, which V8 counts as
  // application branches. Node tests use the original tags; dev keeps source locations.
  plugins: preset.plugins.filter((plugin) => plugin.name !== 'gyral:template-locations'),
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // sw.ts runs only inside a service worker (`pnpm smoke` checks it offline in Chromium).
      // worker.ts runs only in a worker thread; the ingest's in-process mode tests the same parseOne().
      exclude: ['src/offline/sw.ts', 'src/ingest/wookieepedia/worker.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
