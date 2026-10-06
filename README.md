# starwars.run

A Star Wars reference site with a page for every Wookieepedia article: about 227,000 of them,
canon and Legends. Every page links to the pages it mentions: Luke's page links to Tatooine and
lists the 607 stories he turns up in, and A New Hope's page lists everyone who turns up in it.
You can search everything, ask the archive questions in SQL on the Explore page, and the pages
you've visited still work offline.

**Status:** rebuilt in October 2026. Pages, search, Explore and offline support work. Next:
building all 227,000 pages at once, and putting the Wookieepedia dump into the build, Docker
and CI.

## How it works

- **Data** comes from Wookieepedia's database dump, downloaded once. An ingest step parses
  every article into a snapshot in `data/wookieepedia/`, so builds never need the network. The
  snapshot is rebuilt from the dump and never committed.
- **Pages** are rendered at build time with [Gyral](https://gyral.dev), a Model-View-Intent
  framework for web components. Only the search page loads the framework; other pages ship a few hundred bytes of script for
  the search shortcut.
- **Hosting** is a Docker image serving static files, behind Cloudflare.

The details are in [ARCHITECTURE.md](ARCHITECTURE.md) and the
[design docs](docs/design-docs/index.md).

## Run it

You need Node 24 or later and pnpm 10.

The site is built from Wookieepedia's dump, `starwars_pages_current.xml.7z` (about 260 MB), from
[Fandom's database dumps](https://starwars.fandom.com/wiki/Special:Statistics). Turn it into a
snapshot once; it takes about 6.5 minutes:

```sh
pnpm install
pnpm ingest:wookieepedia ~/Downloads/starwars_pages_current.xml.7z
pnpm dev        # http://localhost:5500
```

To build the static site and serve it the way production does:

```sh
pnpm build
pnpm preview    # http://localhost:5501
```

To build and run the production image (Caddy serving the static site). For now, the image
builds only where `data/wookieepedia/` exists, since the dump isn't wired into Docker yet:

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

Text and facts from [Wookieepedia](https://starwars.fandom.com), under CC BY-SA 3.0. Star Wars and its characters are trademarks of Lucasfilm Ltd. This is an
unofficial fan project, not affiliated with or endorsed by Lucasfilm.

## License

- **Code:** MIT, © 2026 Mike Zupper. See [LICENSE](LICENSE).
- **Text and data from Wookieepedia:** CC BY-SA 3.0, credited on every page that uses them.
  See [CONTENT-LICENSE.md](CONTENT-LICENSE.md).
