# syntax=docker/dockerfile:1
# starwars.run's two images (docs/design-docs/0003-hosting.md): the site (Caddy: the static
# files and every header) and, as target `api`, the app that renders every page and answers
# /api/ (ADRs 0010, 0011). They carry code only. The data (pages.sqlite, archive.duckdb,
# ask-schema.json) is built on your machine by `pnpm build` and reaches the app through a
# read-only volume at /app/data, so a build here needs no Wookieepedia dump and takes minutes.
# `pnpm docker:build` builds both; deploy/compose.yml runs them (docs/deploy.md).

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Gyral 0.3.1-next.9 installs from vendor/ until 0.3.1 is on npm (vendor/README.md).
COPY vendor/ ./vendor/
RUN pnpm install --frozen-lockfile
COPY . .
# The client (hashed CSS and JS), the API's one-file bundle (which records those names), then
# the rest of dist/: the 404 page and the service worker. No data is read.
RUN pnpm exec vite build && pnpm build:api && pnpm build:image

# The app: Node and the bundled service. Debian, not Alpine: DuckDB's native module is built
# for glibc. Only that module is installed, at the version package.json pins. Its data is
# mounted at /app/data (read-only); the question log is the /data volume.
FROM node:24-slim AS api
WORKDIR /app
COPY package.json ./package.source.json
RUN npm install --no-save --omit=dev --no-audit --no-fund \
      "@duckdb/node-api@$(node -p "require('./package.source.json').dependencies['@duckdb/node-api']")" \
    && rm package.source.json
COPY --from=build /app/.server/api.mjs ./
RUN mkdir -p /app/data /data && chown node:node /data
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
