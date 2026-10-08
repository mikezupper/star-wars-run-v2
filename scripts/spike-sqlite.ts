/// <reference types="node" />
// Spike for ADR 0011 (swr-sgf.3): can pages render on request from a read-only SQLite file fast
// enough? Three steps, each timed:
//   tsx scripts/spike-sqlite.ts build <file>   the full snapshot → one SQLite file
//   tsx scripts/spike-sqlite.ts serve <file>   an HTTP server rendering every page from it
//   tsx scripts/spike-sqlite.ts load <url> [requests] [concurrency]   random uncached articles
// The server keeps only the address book (titles, eras, kinds, twins) and link counts in memory;
// each article's record and its "Linked from" list are read from the file when its page renders.
// A spike: the numbers go in ADR 0011, and the app server (swr-sgf.4) builds on what holds up.
import { statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { loadSiteData } from '../src/data/archive.js';
import { buildArchive, type Summary } from '../src/domain/archive.js';
import type { ArticleRecord } from '../src/domain/article.js';
import type { LinkGraph } from '../src/domain/links.js';
import { createSite } from '../src/render/site.js';

const [mode, target, ...rest] = process.argv.slice(2);
const seconds = (since: number) => ((performance.now() - since) / 1000).toFixed(1);
const heapGb = () => (process.memoryUsage().rss / 1e9).toFixed(2);

if (mode === 'build' && target !== undefined) {
  let t = performance.now();
  const data = await loadSiteData();
  console.log(`load snapshot + link graph: ${seconds(t)}s`);
  t = performance.now();
  await rm(target, { force: true });
  const db = new DatabaseSync(target);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE summaries (title TEXT PRIMARY KEY, era TEXT NOT NULL, kind TEXT, counterpart TEXT) WITHOUT ROWID;
    CREATE TABLE articles (title TEXT PRIMARY KEY, record TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE links (title TEXT PRIMARY KEY, count INTEGER NOT NULL, linked_from TEXT) WITHOUT ROWID;
  `);
  db.exec('BEGIN');
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
  db.close();
  console.log(
    `write ${target}: ${seconds(t)}s, ${(statSync(target).size / 1e6).toFixed(0)} MB, ` +
      `${data.articles.size} articles`,
  );
} else if (mode === 'serve' && target !== undefined) {
  const t = performance.now();
  const db = new DatabaseSync(target, { readOnly: true });
  const summaries = db.prepare('SELECT title, era, kind, counterpart FROM summaries').all();
  const archive = buildArchive(
    summaries.map((r) => ({
      title: String(r['title']),
      era: r['era'] as Summary['era'],
      ...(r['kind'] === null ? {} : { kind: String(r['kind']) }),
      ...(r['counterpart'] === null ? {} : { counterpart: String(r['counterpart']) }),
    })),
  );
  const counts = new Map(
    db
      .prepare('SELECT title, count FROM links')
      .all()
      .map((r) => [String(r['title']), Number(r['count'])] as const),
  );
  const getRecord = db.prepare('SELECT record FROM articles WHERE title = ?');
  const getLinkedFrom = db.prepare('SELECT linked_from FROM links WHERE title = ?');
  // Just enough of a Map for createSite: has() from the address book, get() from the file.
  const articles = {
    has: (title: string) => archive.byTitle.has(title),
    get: (title: string) => {
      const row = getRecord.get(title);
      return row === undefined ? undefined : (JSON.parse(String(row['record'])) as ArticleRecord);
    },
  } as unknown as ReadonlyMap<string, ArticleRecord>;
  const linkedFrom = {
    get: (title: string) => {
      const json = getLinkedFrom.get(title)?.['linked_from'];
      return json === undefined || json === null
        ? undefined
        : (JSON.parse(String(json)) as string[]);
    },
  } as unknown as ReadonlyMap<string, readonly string[]>;
  const links: LinkGraph = { counts, linkedFrom };
  const site = createSite(
    { stylesheet: '/assets/site.css', clientEntry: '/assets/entry.js', page: '/assets/page.js' },
    { archive, articles, links },
  );
  console.log(`start: ${seconds(t)}s, rss ${heapGb()} GB, ${site.paths.length} routes`);
  const port = Number(rest[0] ?? 5600);
  http
    .createServer((req, res) => {
      void (async () => {
        const response = await site.fetch(new Request(`http://localhost${req.url ?? '/'}`));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body === null) res.end();
        else await pipeline(Readable.fromWeb(response.body as never), res);
      })();
    })
    .listen(port, () => {
      console.log(`serving http://localhost:${String(port)}/`);
    });
  setInterval(() => {
    console.log(`rss ${heapGb()} GB`);
  }, 30_000).unref();
} else if (mode === 'load' && target !== undefined) {
  // Article paths from the sitemap would need a fetch per part; read them from the snapshot.
  const index = await import('../src/data/wookieepedia.js').then((m) => m.loadWookieepediaIndex());
  const paths = [...buildArchive(index.articles.values()).byTitle.values()].map((e) => e.path);
  const total = Number(rest[0] ?? 2000);
  const concurrency = Number(rest[1] ?? 16);
  const latencies: number[] = [];
  let bytes = 0;
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        next += 1;
        const path = paths[Math.floor(Math.random() * paths.length)] ?? '/';
        const t = performance.now();
        const response = await fetch(new URL(path, target));
        bytes += (await response.arrayBuffer()).byteLength;
        latencies.push(performance.now() - t);
        if (!response.ok) console.log(`${String(response.status)} ${path}`);
      }
    }),
  );
  const wall = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const at = (q: number) => (latencies[Math.floor(q * (latencies.length - 1))] ?? 0).toFixed(1);
  console.log(
    `${String(total)} random articles, ${String(concurrency)} at a time: ` +
      `p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, p99 ${at(0.99)} ms, max ${at(1)} ms; ` +
      `${(total / wall).toFixed(0)} pages/s; ${(bytes / total / 1024).toFixed(0)} KB a page`,
  );
} else {
  console.error(
    'usage: tsx scripts/spike-sqlite.ts build <file> | serve <file> [port] | load <url> [n] [c]',
  );
  process.exit(2);
}
