# ADR 0003 — Hosting: a Docker image on a VPS, behind Cloudflare

Status: **accepted** (2026-10-05). Implementation: `swr-3mo.10`; offline support: `swr-3mo.9`.

## Context

The owner hosts starwars.run on a VPS behind the Cloudflare proxy. The site is entirely
static (see [0001-stack.md](0001-stack.md)), so most requests can be answered from
Cloudflare's edge or the browser cache without reaching the VPS.

## Decision

- The site ships as a **Docker image**. A multi-stage build runs `pnpm build`, and the final
  stage serves `dist/` with a static file server (Caddy or nginx; the bead decides). No Node
  process runs in production.
- **Cache headers do the scaling.** The planned policy:

  | Path                 | `Cache-Control`                                              | Why                                         |
  | -------------------- | ------------------------------------------------------------ | ------------------------------------------- |
  | `/assets/*` (hashed) | `public, max-age=31536000, immutable`                        | The file name changes when the content does |
  | HTML pages           | short `max-age`, longer `s-maxage`, `stale-while-revalidate` | Cloudflare holds pages; browsers recheck    |
  | `/sw.js`             | `no-cache`                                                   | A stale worker would pin old pages          |

  The bead sets the exact numbers and records them here.

- Security headers, including a Content Security Policy, are set by the file server.
- `pnpm preview` serves `dist/` with the same URL rules as production: a slash added with a
  308 redirect, and `404.html` with status 404 for unknown paths.
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
