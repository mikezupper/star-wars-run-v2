# ADR 0003 — Hosting: a Docker image on a VPS, behind Cloudflare

Status: **accepted** (2026-10-05; pages rendered on request since ADR 0011, 2026-10-08). Implemented in `swr-3mo.10` (image, headers) and `swr-3mo.9` (offline).

## Context

The owner hosts starwars.run on a VPS behind the Cloudflare proxy. The site is entirely
static (see [0001-stack.md](0001-stack.md)), so most requests can be answered from
Cloudflare's edge or the browser cache without reaching the VPS.

## Decision

- The site ships as **two Docker images** (`Dockerfile`), built from one `node:24-slim` stage
  that runs `pnpm build`. The build ingests the Wookieepedia dump, mounted from a build context
  that holds only the dump, so the dump never lands in a layer
  ([0007-wookieepedia.md](0007-wookieepedia.md)).
  - **site:** `caddy:2-alpine` serves `dist/` (assets, search indexes, sitemaps, the service
    worker) on port 8080 and forwards everything else to the app.
  - **app** (target `api`): Node with `pages.sqlite`, Explore's database and Ask's schema. It
    renders every page on request (ADR 0011, superseding "no Node process serves pages") and
    answers `/api/*` (ADR 0010).

  `compose.yaml` runs both, with Ask's settings from an `.env` beside it, read by the app only,
  and the question log in a volume. `pnpm docker:build` builds both images and
  `pnpm docker:run` starts the stack locally.

- **Production runs behind the VPS's Traefik**, the same way as sabacc (`swr-sgf.6`,
  2026-10-09), at the root domain `starwars.run`. Images are `linux/amd64`, tagged with the commit
  and pushed to a registry (`IMAGE=… pnpm docker:build`, `pnpm docker:push`); the server runs
  `deploy/compose.yml` with one `.env`. Only the site container joins Traefik's network, Traefik
  holds the Let's Encrypt certificate, and Cloudflare proxies in Full (strict) mode. The question
  log is backed up from the running app (`deploy/backup.sh`). The runbook is
  [docs/deploy.md](../deploy.md).
- **The images carry code only; the data is a volume** (2026-10-09, the owner's call). The
  archive changes with a new dump and the code changes daily, so the data (`pages.sqlite`,
  `archive.duckdb`, `ask-schema.json`, from `pnpm build`) is copied by hand into a read-only
  volume, and `pnpm docker:build` reads no dump and takes minutes. What tied the two together
  is undone: the api image links the CSS and JS of the site image built with it (written into its
  bundle), its pages' `ETag` names the data's build and the bundle, it serves the sitemaps from
  the data, and the service worker fetches pages from the network first, so new data shows
  without a new worker. This supersedes the first bullet above where they differ.

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
  only; the islands' Declarative Shadow DOM `<style>` elements allowed by hash, with no
  `'unsafe-inline'`, since Gyral 0.3; the theme script in each page's head by its hash too,
  and nothing that allows `eval()` or WebAssembly). `pnpm caddyfile` regenerates the hashes, and a
  test fails when an island's styles change without them, HSTS without `includeSubDomains`, `nosniff`, a
  referrer policy, a permissions policy, and `Cross-Origin-Opener-Policy`. Caddy's `Server`
  header is removed. Every response also carries `Speculation-Rules`, pointing browsers at
  `/speculation-rules.json` (served as `application/speculationrules+json`), so a hovered link's
  page is fetched before the click ([0011-rendered-on-request.md](0011-rendered-on-request.md)).
- `pnpm preview` and Caddy share the URL rules: a slash added with a 308 redirect, and
  `404.html` with status 404 for unknown paths. `SMOKE_BASE_URL=http://localhost:8080 pnpm
smoke` runs the whole smoke suite against the running image.
- The site works offline as a PWA. The service worker (`src/offline/sw.ts`, Workbox) is
  bundled at the end of the build by `scripts/build-sw.ts`, the way
  `mikezupper-blog-astro/scripts/build-service-worker.mjs` does it:
  - **Precached on install** (`src/offline/precache.ts`): home, the section lists, `/search/`,
    `/offline/` (rendered by the app, revised by the build's id), the hashed CSS and JS, the
    manifest and icons. Search runs on the server (ADR 0011), so there's no index to store.
  - **Record pages** are network-first (3-second timeout) and saved as they're visited.
  - **Updates** take over immediately (`skipWaiting` + `clientsClaim`); there's no "refresh
    to update" prompt, and the next navigation fetches fresh HTML.

## Consequences

- Deploying means building and pushing two images, then `docker compose pull && up -d` on the
  server ([docs/deploy.md](../deploy.md)). The VPS needs only Docker and its Traefik.
- Every header is in this repo, so `curl -I` against `docker run` shows exactly what
  Cloudflare will see.
- After a deploy, Cloudflare may serve old HTML until `s-maxage` runs out. Purge the cache
  when an update must appear immediately.
