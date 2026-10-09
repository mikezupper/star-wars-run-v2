# Deploying starwars.run

starwars.run runs on the same VPS as sabacc, behind the Traefik already running there, at the
root of the domain: `https://starwars.run/`. Cloudflare's proxy sits in front. Why it's built
this way is in [ADR 0003](design-docs/0003-hosting.md) and [ADR 0011](design-docs/0011-rendered-on-request.md).

Two images carry the code, and a volume carries the data. They're shipped separately:

| What         | It is                                                                                                    | How it gets there                 |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `$IMAGE`     | **site**: Caddy with the static files (assets, icons, the service worker, the 404 page) and every header | built and pushed to your registry |
| `$IMAGE-api` | **api**: Node, which renders every page, the sitemaps and `/api/`                                        | built and pushed to your registry |
| the data     | `pages.sqlite`, `archive.duckdb`, `ask-schema.json` (~1.1 GB), from `pnpm build`                         | copied into a volume by hand      |

So a code change ships small images and leaves the data alone, and the data changes only when
you rebuild it from a new Wookieepedia dump.

Nothing about a particular registry or server is committed: the image path, tag, host name,
Traefik's names and Ask's settings all come from environment variables.

## Build and push the images (on your machine)

The images hold code only: the build reads no dump and no data. Run `pnpm check` first.

```sh
IMAGE=ghcr.io/you/starwars-run pnpm docker:build   # a few minutes; tags <commit> and latest
docker login ghcr.io
IMAGE=ghcr.io/you/starwars-run pnpm docker:push    # both images, both tags
```

- Images are `linux/amd64` only.
- Tags: the commit (`git rev-parse --short=12 HEAD`) and `latest`. Deploy the commit tag;
  `latest` is a convenience. The build warns when uncommitted changes are in it.
- Without `IMAGE`, `pnpm docker:build` tags `starwars-run` and `starwars-run-api`, which
  `pnpm docker:run` starts locally (`compose.yaml` at the repo's root), with this checkout's
  `dist-api/` as the data.
- The api image links the CSS and JS of the site image built with it, whatever build wrote the
  data, and its pages' `ETag` names both, so new code is never answered with an old page.

## Prepare the data (on your machine, by hand)

The data needs the Wookieepedia dump (`$WOOKIEEPEDIA_DUMP`, else `~/Downloads`) and up to about
10 GB of memory, so it's built here, and only when you want new data:

```sh
pnpm build    # ingests the dump if it changed (~6.5 min), then writes dist-api/ (~2.5 min)
```

The three files the app needs are in `dist-api/`: `pages.sqlite`, `archive.duckdb` and
`ask-schema.json`. (`dist/` is for `pnpm preview` and `pnpm smoke`; the server doesn't need it.)
If a change alters the format of `pages.sqlite`, which is rare and its commit says so, rebuild the
data with that commit before deploying it.

### Put it in a volume

`STARWARS_DATA` in `.env` says where the app reads the data, mounted read-only at `/app/data`.
**A dated host folder is the simplest**, and makes switching and rolling back one line:

```sh
D=$(date +%F)    # e.g. 2026-10-09
ssh vps mkdir -p /srv/starwars-run/data/$D
rsync -a --progress dist-api/{pages.sqlite,archive.duckdb,ask-schema.json} vps:/srv/starwars-run/data/$D/
# on the server, in .env: STARWARS_DATA=/srv/starwars-run/data/2026-10-09
docker compose up -d    # recreates the api container on the new folder
```

Keep the previous folder until the new one has served for a while; to roll back, put its path
back in `.env` and run `docker compose up -d`.

**A named Docker volume works too.** Leave `STARWARS_DATA` unset and the app reads the volume
`starwars-run_data`. Fill it with a throwaway container, with the app stopped so it never reads a
half-copied file:

```sh
# on the server, with the three files in /tmp/starwars-data/
docker compose stop api
docker run --rm -v starwars-run_data:/data -v /tmp/starwars-data:/new:ro alpine cp /new/. /data/ -r
docker compose start api
```

Without the files, the api container stops at once and says which ones are missing
(`docker compose logs api`).

## Run on the server

Once, in a folder on the VPS (e.g. `/srv/starwars-run`):

```sh
# copy deploy/compose.yml, deploy/.env.example and deploy/backup.sh from the repo
cp .env.example .env && chmod 600 .env   # then edit: image, tag, data, Ask's key
# put the data in place (above), then
docker login ghcr.io
docker compose pull && docker compose up -d
```

Traefik must already be running on the server (it is, for sabacc), attached to the external
network `TRAEFIK_NETWORK` (default `traefik`), with the entrypoint `TRAEFIK_ENTRYPOINT`
(default `websecure`) and the certificate resolver `TRAEFIK_CERTRESOLVER` (default
`letsencrypt`).

- **No ports are published.** Only the site container joins Traefik's network; the api
  container is on an internal network that only the site reaches.
- **Ask's key reaches the api container only:** `compose.yml` lists its variables one by one.
- **Ask's answers stream** as server-sent events through Traefik and Caddy without buffering.

### Update and roll back

```sh
# .env: STARWARS_TAG=<new commit>
docker compose pull && docker compose up -d
# roll back: put the previous commit back in .env and run the same two commands
```

Then purge Cloudflare's cache (below). A code deploy leaves the data and the question log alone;
new data is its own step (above).

### Health and logs

- `GET /api/health` answers 200 once the api container has opened its data; its Docker health
  check uses it, and the site container waits for it.
- Logs: `docker compose logs -f api` (and `site`). Rotation is set in `compose.yml` (5 × 10 MB).
  When Ask can't reach the model, the visitor sees "The AI that reads questions isn't answering";
  the reason isn't logged yet (`swr-ddp`).

### Backups

The data can always be rebuilt from the dump (and the dated folders above are copies of it), so
the state to back up is the question log (`/data/questions.duckdb` in the
`starwars-run_questions` volume).

```sh
./backup.sh     # writes /data/backups/questions-<time>.duckdb, keeps the newest KEEP_BACKUPS (14)
```

It runs inside the api container while the site stays up. Nightly, from the host's crontab:

```cron
30 3 * * * cd /srv/starwars-run && ./backup.sh >> backup.log 2>&1
```

To copy them off the server: `docker compose cp api:/data/backups ./backups`. To restore, stop
the api container, put the copy at `/data/questions.duckdb` in the volume, and start it.

## Cloudflare

- **DNS:** an `A` record for `starwars.run` (the root) pointing at the VPS, proxied. The root
  domain served an old 2021 site until this deploy, so check the record before the first
  `up -d`.
- **SSL/TLS mode: Full (strict).** Traefik holds a Let's Encrypt certificate for `starwars.run`,
  as it does for `sabacc.starwars.run`. If the first certificate can't be issued while the proxy
  is on, switch to Full until Traefik has it, then back to strict.
- **Cache Rule:** Cloudflare doesn't cache HTML by default. Add a rule for `starwars.run` that
  makes responses eligible for cache and respects the origin's `Cache-Control`; pages send
  `s-maxage=604800` and an `ETag` from the build (ADR 0011). Leave `/api/*` out: the app sends
  `no-store` there, except `/api/search`.
- **After every deploy, code or data, purge the cache** (Caching → Purge Everything), or visitors
  keep the old pages for up to a week. The service worker fetches pages from the network first,
  so visitors who have it see new pages too.

## Check it

From your machine, against production (the page list comes from your local `dist/`):

```sh
SMOKE_BASE_URL=https://starwars.run SMOKE_PAGES=1000 pnpm smoke
```

Everything should pass except smoke's Ask check, which expects its fake model's wording and gets
the real model's (`swr-d6q`).

## Settings

| Variable                                                        | Default                               | Meaning                                                  |
| --------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `STARWARS_IMAGE`                                                | — (required)                          | Registry path of the site's image; the api's adds `-api` |
| `STARWARS_TAG`                                                  | `latest`                              | Commit tag to run                                        |
| `STARWARS_DATA`                                                 | the volume `starwars-run_data`        | The data: a host folder or a volume name, read-only      |
| `STARWARS_HOST`                                                 | `starwars.run`                        | Host name Traefik routes to the site                     |
| `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER` | `traefik`, `websecure`, `letsencrypt` | Your Traefik names                                       |
| `ASK_ORIGIN`, `ASK_KEY`                                         | — (required)                          | Ask's OpenAI-compatible endpoint and key (ADR 0009)      |
| `ASK_MODEL`                                                     | `Qwen3.8-27B`                         | The model Ask uses                                       |
| `KEEP_BACKUPS`                                                  | `14`                                  | Question-log backups `backup.sh` keeps                   |
