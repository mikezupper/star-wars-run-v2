# Records: home, list pages, record pages, cross-links

Bead: `swr-3mo.5`. Data: [0002-data.md](../design-docs/0002-data.md).

## Pages

| Page      | URL                  | Shows                                                              |
| --------- | -------------------- | ------------------------------------------------------------------ |
| Home      | `/`                  | What the site is, a way into each type, search                     |
| List      | `/<type>/`           | Every record of that type, by name, each linking to its page       |
| Record    | `/<type>/<slug>/`    | Every known field of the record, and links to every related record |
| Not found | any other path (404) | A plain way back: home and search                                  |

Types, with their URL segments: `films`, `people`, `planets`, `species`, `vehicles`,
`starships`.

## Cross-links

Every relationship in the data is a link, **in both directions**:

- A person links to their homeworld, species, films, vehicles and starships.
- A planet lists the people from it (residents), the species native to it, and its films.
  swapi.info gives only a species' homeworld, so the planet side is built from that
  (`src/domain/catalog.ts`).
- A film lists its characters, planets, species, vehicles and starships, in the order the
  data gives them.
- Vehicles and starships list their pilots and films. Species list their members and their
  homeworld.

A relationship with nothing on the other end isn't shown. "Pilots: none" is noise.

## Fields

Show a field only when its value is known. Units are written out (`172 cm`, `77 kg`,
`1,000 credits`). Film release dates are shown in a readable form. Copy and labels follow
[0005-writing.md](../design-docs/0005-writing.md).

## Acceptance criteria

- `pnpm build` writes `dist/<type>/<slug>/index.html` for every record, and a list page per
  type.
- Every internal link on every page resolves to a built page (checked by script).
- Record and list pages ship no framework JavaScript. The only script is the search
  shortcut and service worker registration (`src/page.ts`, a few hundred bytes), and the page works without it.
- Each page has a unique `<title>` and description, and a canonical URL with a trailing
  slash. All indexable pages are in `sitemap.xml`.
- `/people/luke-skywalker/` links to `/planets/tatooine/`, and `/planets/tatooine/` links
  back to `/people/luke-skywalker/`.
