# ADR 0003 — Hosting: a Docker image on a VPS, behind Cloudflare

Status: **accepted** (2026-10-05). Implemented in `swr-3mo.10` (image, headers) and `swr-3mo.9` (offline).

## Context

The owner hosts starwars.run on a VPS behind the Cloudflare proxy. The site is entirely
static (see [0001-stack.md](0001-stack.md)), so most requests can be answered from
Cloudflare's edge or the browser cache without reaching the VPS.

## Decision

- The site ships as a **Docker image** (`Dockerfile`): `node:24-slim` runs `pnpm build`, then
  `caddy:2-alpine` serves `dist/` on port 8080. No Node process runs in production; the image
  is about 70 MB. `pnpm docker:build` and `pnpm docker:run` build and run it locally.
- **Headers have one source:** `src/hosting/headers.ts`. The preview server applies it, so
  `pnpm smoke` runs under the production CSP, and `pnpm caddyfile` renders it to the committed
  `Caddyfile`. A test fails if the two drift.
- **Cache headers do the scaling:**

  | Path                                                    | `Cache-Control`                                                    | Why                                                        |
  | ------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
  | `/assets/*` (hashed)                                    | `public, max-age=31536000, immutable`                              | The file name changes when the content does                |
  | `/icons/*`                                              | `public, max-age=86400`                                            | Rarely change, not hashed                                  |
  | `/sw.js`                                                | `no-cache`                                                         | A stale worker would pin old pages                         |
  | Everything else (HTML, search index, manifest, sitemap) | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | Browsers recheck after 5 minutes; Cloudflare holds an hour |
  | 404 responses                                           | `public, max-age=60`                                               | A page added by a deploy shows up quickly                  |

  **Cloudflare doesn't cache HTML by default.** For `s-maxage` to take effect, add a Cache
  Rule for the site that makes responses eligible for cache and respects origin headers.

- **Security headers on every response, the 404 included:** a Content Security Policy (`'self'`
  only; `'unsafe-inline'` styles for Declarative Shadow DOM; `'wasm-unsafe-eval'` for Pagefind's
  WebAssembly, which does not allow `eval()`), HSTS without `includeSubDomains`, `nosniff`, a
  referrer policy, a permissions policy, and `Cross-Origin-Opener-Policy`. Caddy's `Server`
  header is removed.
- `pnpm preview` and Caddy share the URL rules: a slash added with a 308 redirect, and
  `404.html` with status 404 for unknown paths. `SMOKE_BASE_URL=http://localhost:8080 pnpm
smoke` runs the whole smoke suite against the running image.
- The site works offline as a PWA. The service worker (`src/offline/sw.ts`, Workbox) is
  bundled after prerendering by `scripts/build-sw.ts`, the way
  `mikezupper-blog-astro/scripts/build-service-worker.mjs` does it:
  - **Precached on install** (`src/offline/precache.ts`): home, the section lists, `/search/`,
    `/offline/`, the hashed CSS and JS, the manifest and icons, and the **whole Pagefind
    index**, because a search result needs its page's fragment. About 1.5 MB, once, in the
    background. At Wookieepedia scale this won't hold; the spike (`swr-4g6`) must revisit it.
  - **Record pages** are network-first (3-second timeout) and saved as they're visited.
  - **Updates** take over immediately (`skipWaiting` + `clientsClaim`); there's no "refresh
    to update" prompt, and the next navigation fetches fresh HTML.

## Consequences

- Deploying means building and running an image. The VPS needs only Docker.
- Every header is in this repo, so `curl -I` against `docker run` shows exactly what
  Cloudflare will see.
- After a deploy, Cloudflare may serve old HTML until `s-maxage` runs out. Purge the cache
  when an update must appear immediately.
