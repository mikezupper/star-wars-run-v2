# syntax=docker/dockerfile:1
# starwars.run: build the static site with Node, serve it with Caddy (docs/design-docs/0003-hosting.md),
# plus the question log's image (target `questions`). compose.yaml runs the two together.
# The build reads the Wookieepedia dump and nothing else from outside: no network beyond the
# package install. The dump isn't in the repo (ADR 0007), so `pnpm docker:build` passes the
# folder holding it as a named build context, `dump`, mounted for the one step that needs it:
#   docker build --build-context dump=<folder> --build-arg DUMP_FILE=<name> -t starwars-run .
# The snapshot is ingested inside the build (about 6.5 minutes), then every page prerendered.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Gyral 0.3.0 installs from vendor/ until it's on npm (vendor/README.md).
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

# The question log (src/server/question-log.ts): its own small image, `--target questions`. The
# install steps are the same as above, so Docker reuses them; the image is Node and one file.
FROM node:24-slim AS questions-build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY vendor/ ./vendor/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:questions

FROM node:24-alpine AS questions
WORKDIR /app
COPY --from=questions-build /app/.server/question-log.mjs ./
RUN mkdir /data && chown node:node /data
USER node
ENV QUESTIONS_DB=/data/questions.db PORT=8090
VOLUME /data
EXPOSE 8090
CMD ["node", "question-log.mjs"]

# The site: the last stage, so a plain `docker build` builds it.
FROM caddy:2-alpine AS site
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
