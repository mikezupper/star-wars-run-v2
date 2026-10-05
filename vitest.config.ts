import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from '@gyral/core/vite';

// Node tests for everything under src/. Coverage below 80% on any metric fails `pnpm test`,
// and so `pnpm check`: that is the project's quality bar, not a target to game.
export default defineConfig({
  ...gyralVitePreset(),
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Runs only inside a service worker; `pnpm smoke` checks it offline in Chromium.
      exclude: ['src/offline/sw.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
