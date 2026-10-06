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
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: {
  readonly __WB_MANIFEST: PrecacheEntry[];
  skipWaiting(): Promise<void>;
};

// A new deploy takes over at once: there is no in-page "update available" prompt, and the
// next navigation fetches fresh HTML anyway (NetworkFirst below).
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// The shell, assets and search index. These query parameters don't change the response, so
// they mustn't miss the cache: `?q=` and `?kind=` select results on /search/, and Pagefind
// adds a cache-busting `?ts=` to pagefind-entry.json (without it, search fails offline).
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^q$/, /^kind$/, /^ts$/, /^utm_/],
});

// Article pages: fresh from the network when it answers within 3 seconds, else the copy saved
// the last time this page was visited. The 500 most recent are kept.
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

// The search index's chunks and result fragments, kept as they're fetched: their names are
// content hashes, so a saved copy is never stale. Offline, a search works when its chunks were
// fetched online (swr-7f1.8 makes all of search work offline with a title index).
registerRoute(
  ({ url }) => /^\/pagefind\/(?:index|fragment)\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'search',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 2000,
        purgeOnQuotaError: true,
      }) as unknown as WorkboxPlugin,
    ],
  }),
);

// The search title index's shards (swr-357), kept as they're fetched. Their names aren't
// hashes, so a saved shard is used at once and refreshed in the background.
registerRoute(
  ({ url }) => url.pathname.startsWith('/search-titles/'),
  new StaleWhileRevalidate({
    cacheName: 'titles',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        purgeOnQuotaError: true,
      }) as unknown as WorkboxPlugin,
    ],
  }),
);

// Offline and never visited: the offline page, for documents only.
setCatchHandler(async ({ request }) =>
  request.destination === 'document'
    ? ((await matchPrecache('/offline/')) ?? Response.error())
    : Response.error(),
);
