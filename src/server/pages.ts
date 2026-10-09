// The pages' data on the server (ADR 0011): one read-only SQLite file the build writes beside
// the Explore database. The app keeps the address book (titles, eras, kinds, twins) and the link
// counts in memory, and reads an article's record and its "Linked from" list when its page
// renders. Measured in the spike: 6.8 s to open the full archive, 0.6 GB, p50 23 ms a page.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildArchive, type Archive, type Summary } from '../domain/archive.js';
import type { ArticleRecord } from '../domain/article.js';
import type { LinkGraph } from '../domain/links.js';
import type { Assets } from '../render/layout.js';
import type { SiteData } from '../render/site.js';

/** What a build stamps on its pages: where its CSS and JS are, and its id for ETags. */
export interface PagesMeta {
  readonly build: string;
  readonly assets: Assets;
}

export interface Pages {
  readonly data: SiteData;
  readonly meta: PagesMeta;
  readonly close: () => void;
}

const SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE summaries (title TEXT PRIMARY KEY, era TEXT NOT NULL, kind TEXT, counterpart TEXT) WITHOUT ROWID;
  CREATE TABLE articles (title TEXT PRIMARY KEY, record TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE links (title TEXT PRIMARY KEY, count INTEGER NOT NULL, linked_from TEXT) WITHOUT ROWID;
`;

/** Writes `file` from scratch: every article, the address book, the link graph and `meta`. */
export function writePages(file: string, data: SiteData, meta: PagesMeta): void {
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
  return {
    data: { archive, articles, links },
    meta: {
      build: meta.get('build') ?? 'unknown',
      assets: JSON.parse(meta.get('assets') ?? '{}') as Assets,
    },
    close: () => {
      db.close();
    },
  };
}
