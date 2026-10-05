# syntax=docker/dockerfile:1
# starwars.run: build the static site with Node, serve it with Caddy (docs/design-docs/0003-hosting.md).
# The build needs no network beyond the package install: data/ is committed.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
