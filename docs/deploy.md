# Deploying starwars.run

starwars.run runs on the same VPS as sabacc, behind the Traefik already running there, at the
root of the domain: `https://starwars.run/`. Cloudflare's proxy sits in front. Why it's built
this way is in [ADR 0003](design-docs/0003-hosting.md) and [ADR 0011](design-docs/0011-rendered-on-request.md).

Two images, built on your machine and pushed to a registry:

| Image        | What it is                                                                                             | Size    |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------- |
| `$IMAGE`     | **site**: Caddy with the static files (assets, icons, sitemaps, the service worker) and every header   | ~85 MB  |
| `$IMAGE-api` | **api**: Node, which renders every page from `pages.sqlite` and answers `/api/`; the archive is inside | ~1.5 GB |

Nothing about a particular registry or server is committed: the image path, tag, host name,
Traefik's names and Ask's settings all come from environment variables.

## Build and push (on your machine)

The build needs the Wookieepedia dump (`$WOOKIEEPEDIA_DUMP`, else `~/Downloads`) and up to about
10 GB of memory, so it runs here, not on the server. Run `pnpm check` first.

```sh
IMAGE=ghcr.io/you/starwars-run pnpm docker:build   # ~25 min; tags <commit> and latest
docker login ghcr.io
IMAGE=ghcr.io/you/starwars-run pnpm docker:push    # both images, both tags (~1.1 GB)
```

- Images are `linux/amd64` only.
- Tags: the commit (`git rev-parse --short=12 HEAD`) and `latest`. Deploy the commit tag;
  `latest` is a convenience. The build warns when uncommitted changes are in it.
- Without `IMAGE`, `pnpm docker:build` tags `starwars-run` and `starwars-run-api`, which
  `pnpm docker:run` starts locally (`compose.yaml` at the repo's root).

## Run on the server

Once, in a folder on the VPS (e.g. `/srv/starwars-run`):

```sh
# copy deploy/compose.yml, deploy/.env.example and deploy/backup.sh from the repo
cp .env.example .env && chmod 600 .env   # then edit: image, tag, Ask's key
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

Then purge Cloudflare's cache (below). Each image carries its own archive, so there is no data to
migrate: a deploy swaps the images, and the question log stays in its volume.

### Health and logs

- `GET /api/health` answers 200 once the api container has opened its data; its Docker health
  check uses it, and the site container waits for it.
- Logs: `docker compose logs -f api` (and `site`). Rotation is set in `compose.yml` (5 × 10 MB).
  When Ask can't reach the model, the visitor sees "The AI that reads questions isn't answering";
  the reason isn't logged yet (`swr-ddp`).

### Backups

The archive is rebuilt with every image, so the only state is the question log
(`/data/questions.duckdb` in the `starwars-run_questions` volume).

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
- **After every deploy, purge the cache** (Caching → Purge Everything), or visitors keep the old
  pages for up to a week. The service worker updates itself on the next visit.

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
| `STARWARS_HOST`                                                 | `starwars.run`                        | Host name Traefik routes to the site                     |
| `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER` | `traefik`, `websecure`, `letsencrypt` | Your Traefik names                                       |
| `ASK_ORIGIN`, `ASK_KEY`                                         | — (required)                          | Ask's OpenAI-compatible endpoint and key (ADR 0009)      |
| `ASK_MODEL`                                                     | `Qwen3.8-27B`                         | The model Ask uses                                       |
| `KEEP_BACKUPS`                                                  | `14`                                  | Question-log backups `backup.sh` keeps                   |
