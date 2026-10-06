# syntax=docker/dockerfile:1
# starwars.run: build the static site with Node, serve it with Caddy (docs/design-docs/0003-hosting.md).
# The build reads the Wookieepedia dump and nothing else from outside: no network beyond the
# package install. The dump isn't in the repo (ADR 0007), so `pnpm docker:build` passes the
# folder holding it as a named build context, `dump`, mounted for the one step that needs it:
#   docker build --build-context dump=<folder> --build-arg DUMP_FILE=<name> -t starwars-run .
# The snapshot is ingested inside the build (about 6.5 minutes), then every page prerendered.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG DUMP_FILE=starwars_pages_current.xml.7z
# Each ingest worker needs about 0.5 GB; the prerender after it peaks near 10 GB.
ARG WOOKIEEPEDIA_WORKERS=4
RUN --mount=type=bind,from=dump,target=/dump \
    WOOKIEEPEDIA_DUMP="/dump/${DUMP_FILE}" WOOKIEEPEDIA_WORKERS="${WOOKIEEPEDIA_WORKERS}" pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
