// The pages' data on the server (ADR 0011): one read-only SQLite file the build writes beside
// the Explore database. The app keeps the address book (titles, eras, kinds, twins) and the link
// counts in memory, and reads an article's record and its "Linked from" list when its page
// renders. Measured in the spike: 6.8 s to open the full archive, 0.6 GB, p50 23 ms a page.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildArchive,
  displayTitle,
  type Archive,
  type Entry,
  type Summary,
} from '../domain/archive.js';
import type { ArticleRecord, Rich } from '../domain/article.js';
import { tokens } from '../domain/search.js';
import type { LinkGraph } from '../domain/links.js';
import type { Assets } from '../render/layout.js';
import type { SiteData } from '../render/site.js';
import { createSearch, type Search } from './search.js';
import { articlePreview, type ArticlePreview } from '../domain/preview.js';

/** What a build stamps on its pages: where its CSS and JS are, and its id for ETags. */
export interface PagesMeta {
  readonly build: string;
  readonly assets: Assets;
}

export interface Pages {
  readonly data: SiteData;
  readonly meta: PagesMeta;
  readonly search: Search;
  readonly preview: (path: string) => ArticlePreview | undefined;
  readonly close: () => void;
}

const SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE summaries (title TEXT PRIMARY KEY, era TEXT NOT NULL, kind TEXT, counterpart TEXT) WITHOUT ROWID;
  CREATE TABLE articles (title TEXT PRIMARY KEY, record TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE links (title TEXT PRIMARY KEY, count INTEGER NOT NULL, linked_from TEXT) WITHOUT ROWID;
  CREATE TABLE names (id INTEGER PRIMARY KEY, name TEXT NOT NULL, alias INTEGER NOT NULL, title TEXT NOT NULL, links INTEGER NOT NULL);
  CREATE VIRTUAL TABLE names_fts USING fts5(name, content='names', content_rowid='id', tokenize='unicode61 remove_diacritics 2', prefix='2 3');
  CREATE VIRTUAL TABLE names_tri USING fts5(name, content='names', content_rowid='id', tokenize='trigram');
  CREATE VIRTUAL TABLE texts USING fts5(title UNINDEXED, name, body, tokenize='unicode61 remove_diacritics 2');
`;

/** Redirect chains longer than this are broken (they loop); the ingest uses the same limit. */
const MAX_HOPS = 5;

/** Where a redirect lands, following chains, or undefined when it lands nowhere here. */
function landing(
  from: string,
  redirects: ReadonlyMap<string, string>,
  has: (title: string) => boolean,
): string | undefined {
  let target = redirects.get(from);
  for (let hop = 0; target !== undefined && !has(target) && hop < MAX_HOPS; hop++) {
    target = redirects.get(target);
  }
  return target !== undefined && has(target) ? target : undefined;
}

/** Search's tables (src/server/search.ts): names and redirects, and each article's text. */
function writeSearch(
  db: DatabaseSync,
  data: SiteData,
  redirects: ReadonlyMap<string, string>,
): void {
  const name = db.prepare('INSERT INTO names (name, alias, title, links) VALUES (?, ?, ?, ?)');
  const links = (title: string) => data.links.counts.get(title) ?? 0;
  const has = (title: string) => data.archive.byTitle.has(title);
  for (const title of data.archive.byTitle.keys()) {
    if (/\(disambiguation\)$/.test(title)) continue;
    name.run(displayTitle(title), 0, title, links(title));
  }
  for (const from of redirects.keys()) {
    const target = landing(from, redirects, has);
    if (target === undefined) continue;
    const alias = displayTitle(from);
    // "Luke skywalker" adds nothing to "Luke Skywalker".
    if (tokens(alias).join(' ') === tokens(displayTitle(target)).join(' ')) continue;
    name.run(alias, 1, target, links(target));
  }
  db.exec("INSERT INTO names_fts(names_fts) VALUES ('rebuild')");
  db.exec("INSERT INTO names_tri(names_tri) VALUES ('rebuild')");
  const text = db.prepare('INSERT INTO texts (title, name, body) VALUES (?, ?, ?)');
  const plain = (runs: Rich) => runs.map((r) => r.text).join('');
  for (const [title, record] of data.articles) {
    if (/\(disambiguation\)$/.test(title)) continue;
    const body = [...record.lead.map(plain), ...record.fields.flatMap((f) => f.items.map(plain))];
    text.run(title, displayTitle(title), body.join('\n'));
  }
  db.exec("INSERT INTO texts(texts) VALUES ('optimize')");
}

/**
 * Writes `file` from scratch: every article, the address book, the link graph, search's
 * indexes (with `redirects`, so "vader" finds Anakin Skywalker) and `meta`.
 */
export function writePages(
  file: string,
  data: SiteData,
  meta: PagesMeta,
  redirects: ReadonlyMap<string, string> = new Map(),
): void {
  mkdirSync(dirname(file), { recursive: true });
  rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    db.exec(SCHEMA);
    db.exec('BEGIN');
    const setMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    setMeta.run('build', meta.build);
    setMeta.run('assets', JSON.stringify(meta.assets));
    const summary = db.prepare('INSERT INTO summaries VALUES (?, ?, ?, ?)');
    for (const e of data.archive.byTitle.values())
      summary.run(e.title, e.era, e.kind ?? null, e.counterpart ?? null);
    const article = db.prepare('INSERT INTO articles VALUES (?, ?)');
    for (const [title, record] of data.articles) article.run(title, JSON.stringify(record));
    const link = db.prepare('INSERT INTO links VALUES (?, ?, ?)');
    for (const [title, count] of data.links.counts) {
      const from = data.links.linkedFrom.get(title);
      link.run(title, count, from === undefined ? null : JSON.stringify(from));
    }
    writeSearch(db, data, redirects);
    db.exec('COMMIT');
    db.exec('VACUUM');
  } finally {
    db.close();
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : String(value));

/**
 * A read-only map backed by one SQL lookup per get(). createSite only asks has() and get(); the
 * rest of ReadonlyMap isn't needed on the server, and iterating 227k rows by accident would be
 * a bug, so those throw.
 */
function lookup<V>(has: (key: string) => boolean, get: (key: string) => V | undefined) {
  const refuse = () => {
    throw new Error('pages: iterating the archive on the server reads every row; use get()');
  };
  return {
    has,
    get,
    get size() {
      return refuse();
    },
    keys: refuse,
    values: refuse,
    entries: refuse,
    forEach: refuse,
    [Symbol.iterator]: refuse,
  } as unknown as ReadonlyMap<string, V>;
}

/** Opens `file` read-only as the site's data. */
export function openPages(file: string): Pages {
  const db = new DatabaseSync(file, { readOnly: true });
  const meta = new Map(
    db
      .prepare('SELECT key, value FROM meta')
      .all()
      .map((r) => [text(r['key']), text(r['value'])] as const),
  );
  const archive: Archive = buildArchive(
    db
      .prepare('SELECT title, era, kind, counterpart FROM summaries')
      .all()
      .map((r): Summary => ({
        title: text(r['title']),
        era: r['era'] === 'legends' ? 'legends' : 'canon',
        ...(r['kind'] === null ? {} : { kind: text(r['kind']) }),
        ...(r['counterpart'] === null ? {} : { counterpart: text(r['counterpart']) }),
      })),
  );
  const counts = new Map(
    db
      .prepare('SELECT title, count FROM links')
      .all()
      .map((r) => [text(r['title']), Number(r['count'])] as const),
  );
  const record = db.prepare('SELECT record FROM articles WHERE title = ?');
  const linkers = db.prepare('SELECT linked_from FROM links WHERE title = ?');
  const articles = lookup<ArticleRecord>(
    (title) => archive.byTitle.has(title),
    (title) => {
      const row = record.get(title);
      return row === undefined ? undefined : (JSON.parse(text(row['record'])) as ArticleRecord);
    },
  );
  const linkedFrom = lookup<readonly string[]>(
    (title) => counts.has(title),
    (title) => {
      const json = linkers.get(title)?.['linked_from'];
      return typeof json === 'string' ? (JSON.parse(json) as string[]) : undefined;
    },
  );
  const links: LinkGraph = { counts, linkedFrom };
  const search = createSearch(db, archive, counts);
  // Created once on the first preview, rather than scanning the address book per hover.
  let byPath: ReadonlyMap<string, Entry> | undefined;
  return {
    data: {
      archive,
      articles,
      links,
      search: (query, section) => search.search(query, section === undefined ? {} : { section }),
    },
    search,
    preview: (path) => {
      byPath ??= new Map([...archive.byTitle.values()].map((e) => [e.path, e]));
      const entry = byPath.get(path);
      const article = entry === undefined ? undefined : articles.get(entry.title);
      return entry === undefined || article === undefined
        ? undefined
        : articlePreview(entry, article);
    },
    meta: {
      build: meta.get('build') ?? 'unknown',
      assets: JSON.parse(meta.get('assets') ?? '{}') as Assets,
    },
    close: () => {
      db.close();
    },
  };
}
