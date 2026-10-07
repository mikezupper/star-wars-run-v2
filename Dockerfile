# syntax=docker/dockerfile:1
# starwars.run: build the static site with Node, serve it with Caddy (docs/design-docs/0003-hosting.md),
# plus the API's image (target `api`, ADR 0010). compose.yaml runs the two together.
# The build reads the Wookieepedia dump and nothing else from outside: no network beyond the
# package install. The dump isn't in the repo (ADR 0007), so `pnpm docker:build` passes the
# folder holding it as a named build context, `dump`, mounted for the one step that needs it:
#   docker build --build-context dump=<folder> --build-arg DUMP_FILE=<name> -t starwars-run .
# The snapshot is ingested inside the build (about 6.5 minutes), then every page prerendered.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Gyral 0.3.1-next.1 installs from vendor/ until 0.3.1 is on npm (vendor/README.md).
COPY vendor/ ./vendor/
RUN pnpm install --frozen-lockfile
COPY . .
ARG DUMP_FILE=starwars_pages_current.xml.7z
# Ask the archive's model name, built into the islands; its key is given at `docker run`.
ARG ASK_MODEL=Qwen3.8-27B
ENV ASK_MODEL=${ASK_MODEL}
# Each ingest worker needs about 0.5 GB; the prerender after it peaks near 10 GB.
ARG WOOKIEEPEDIA_WORKERS=4
RUN --mount=type=bind,from=dump,target=/dump \
    WOOKIEEPEDIA_DUMP="/dump/${DUMP_FILE}" WOOKIEEPEDIA_WORKERS="${WOOKIEEPEDIA_WORKERS}" pnpm build
# The API's bundle, for the api image below.
RUN pnpm build:api

# The API (ADR 0010): Node, the bundled service, and the data the site build wrote beside dist/
# (the archive database, Ask's schema) plus the title index. Debian, not Alpine: DuckDB's native
# module is built for glibc. Only that module is installed, at the version package.json pins.
FROM node:24-slim AS api
WORKDIR /app
COPY package.json ./package.source.json
RUN npm install --no-save --omit=dev --no-audit --no-fund \
      "@duckdb/node-api@$(node -p "require('./package.source.json').dependencies['@duckdb/node-api']")" \
    && rm package.source.json
COPY --from=build /app/.server/api.mjs ./
COPY --from=build /app/dist-api/archive.duckdb /app/dist-api/ask-schema.json /app/data/
COPY --from=build /app/dist/search-titles /app/data/search-titles
RUN mkdir /data && chown node:node /data
USER node
ENV API_DATA=/app/data QUESTIONS_DB=/data/questions.duckdb PORT=8090 NODE_ENV=production
VOLUME /data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:8090/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "api.mjs"]

# The site: the last stage, so a plain `docker build` builds it.
FROM caddy:2-alpine AS site
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
