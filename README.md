# starwars.run

A Star Wars reference site: films, characters, planets, species, vehicles and starships, each
on its own page and linked to everything it relates to. Luke's page links to Tatooine, and
Tatooine's page links back to everyone from there. You can search everything, and
the pages you've visited still work offline.

**Status:** rebuilt in October 2026: data, pages, search, offline support and the Docker
image are done. Local CI and a larger dataset (Wookieepedia) are next.

## How it works

- **Data** comes from [swapi.info](https://swapi.info). An ingest step fetches it once,
  checks its shape, and saves a snapshot in the repo, so builds never need the network.
- **Pages** are rendered at build time with [Gyral](https://gyral.dev), a Model-View-Intent
  framework for web components. Only the search page loads the framework; other pages ship a few hundred bytes of script for
  the search shortcut.
- **Hosting** is a Docker image serving static files, behind Cloudflare.

The details are in [ARCHITECTURE.md](ARCHITECTURE.md) and the
[design docs](docs/design-docs/index.md).

## Run it

You need Node 24 or later and pnpm 10.

```sh
pnpm install
pnpm dev        # http://localhost:5500
```

To build the static site and serve it the way production does:

```sh
pnpm build
pnpm preview    # http://localhost:5501
```

To build and run the production image (Caddy serving the static site):

```sh
pnpm docker:build
pnpm docker:run   # http://localhost:8080
```

Before committing, run the full check: typecheck, lint, formatting, docs checks, tests (80%
coverage minimum), build, and browser smoke tests. The first run needs
`pnpm exec playwright install chromium`.

```sh
pnpm check
```

## Contributing

Work is tracked with [beads](https://github.com/gastownhall/beads) (`bd ready` lists
what's next). Coding agents start at [AGENTS.md](AGENTS.md).

## Credits

Star Wars data from [swapi.info](https://swapi.info), which builds on the original SWAPI by
Paul Hallett and Juriy Bura. Star Wars and its characters are trademarks of Lucasfilm Ltd. This is an
unofficial fan project, not affiliated with or endorsed by Lucasfilm.

## License

MIT, for the code. © 2026 Mike Zupper.
