// The service worker (docs/product-specs/offline.md). Bundled to dist/sw.js by
// scripts/build-sw.ts, which replaces `self.__WB_MANIFEST` with the precache list from
// src/offline/precache.ts. Runs only inside a service worker, so unit tests can't load it;
// `pnpm smoke` checks it offline in Chromium.
import { clientsClaim } from 'workbox-core';
import type { WorkboxPlugin } from 'workbox-core/types.js';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: {
  readonly __WB_MANIFEST: PrecacheEntry[];
  skipWaiting(): Promise<void>;
};

// A new deploy takes over at once: there is no in-page "update available" prompt, and the
// next navigation fetches fresh HTML anyway (NetworkFirst below).
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Every page, the precached shell pages included: fresh from the network when it answers within
// 3 seconds, else the copy saved the last time this page was visited. The 500 most recent are
// kept. Registered before the precache's route, so a page is never served from the precache
// while the network answers: the data can change without a new service worker (ADR 0003).
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 3,
    // Workbox's own types predate exactOptionalPropertyTypes; the plugin is a WorkboxPlugin.
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        purgeOnQuotaError: true,
      }) as unknown as WorkboxPlugin,
    ],
  }),
);

// The shell pages and assets, for offline. Only tracking parameters are ignored: `/search/?q=`
// is a different page from `/search/` now that results render on the server (ADR 0011).
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/^utm_/] });

// Offline and not saved: the precached copy of a shell page, else the offline page; for
// documents only.
setCatchHandler(async ({ request }) =>
  request.destination === 'document'
    ? ((await matchPrecache(request.url)) ?? (await matchPrecache('/offline/')) ?? Response.error())
    : Response.error(),
);
