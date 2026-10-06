import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { openDump, readPages, type DumpPage } from '../../../src/ingest/wookieepedia/dump.js';
import { ingest } from '../../../src/ingest/wookieepedia/ingest.js';
import {
  parseOne,
  resolveLinks,
  resolveTitle,
  type Titles,
} from '../../../src/ingest/wookieepedia/links.js';
import {
  kindCounts,
  SHARD_SIZE,
  snapshotFiles,
} from '../../../src/ingest/wookieepedia/snapshot.js';
import type { ParsedArticle } from '../../../src/ingest/wookieepedia/wikitext.js';

const page = (title: string, text: string, extra = '', ns = 0) =>
  `<page><title>${title}</title><ns>${String(ns)}</ns><id>1</id>${extra}<revision><id>2</id><timestamp>2026-07-30T10:00:00Z</timestamp><text xml:space="preserve">${text}</text></revision></page>`;
const dumpXml = (...pages: string[]) =>
  `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/"><siteinfo><sitename>Wookieepedia</sitename></siteinfo>${pages.join('')}</mediawiki>`;

const XML = dumpXml(
  page(
    'Luke Skywalker',
    "{{Top}}\n{{Character\n|name=Luke\n|homeworld=[[Tatooine]]&lt;ref&gt;x&lt;/ref&gt;\n|species=[[Humans]]\n}}\n'''Luke''' was from [[Tatooine]] and knew [[Nobody Here]].",
  ),
  page('Tatooine', '{{CelestialBody\n|region=[[Outer Rim]]\n|suns=2\n}}\nA desert planet.'),
  page('Human', '{{Species\n|designation=Sentient\n|lifespan=100 years\n}}\nHumans were common.'),
  page('Humans', '#REDIRECT [[Human]]', '<redirect title="Human" />'),
  page('Luke Skywalker/Legends', '{{Top|leg}}\nLuke, in [[Legends]].'),
  page('Talk:Luke Skywalker', 'Discussion', '', 1),
);

/** The XML in small chunks, so tags and entities straddle chunk boundaries as in a real stream. */
async function* chunks(text: string, size = 7): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) {
    await Promise.resolve();
    yield text.slice(i, i + size);
  }
}

const collect = async (gen: AsyncGenerator<DumpPage>) => {
  const out: DumpPage[] = [];
  for await (const p of gen) out.push(p);
  return out;
};

const dirs: string[] = [];
afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe('dump reader', () => {
  it('yields every page with namespace, redirect, decoded text and timestamp, across chunk boundaries', async () => {
    const pages = await collect(readPages(chunks(XML)));
    expect(pages.map((p) => [p.title, p.ns, p.redirect])).toEqual([
      ['Luke Skywalker', 0, undefined],
      ['Tatooine', 0, undefined],
      ['Human', 0, undefined],
      ['Humans', 0, 'Human'],
      ['Luke Skywalker/Legends', 0, undefined],
      ['Talk:Luke Skywalker', 1, undefined],
    ]);
    expect(pages[0]?.text).toContain('[[Tatooine]]<ref>x</ref>');
    expect(pages[0]?.timestamp).toBe('2026-07-30T10:00:00Z');
  });

  it('fails on malformed XML', async () => {
    await expect(collect(readPages(chunks('<mediawiki><page><title>x</page>')))).rejects.toThrow();
  });

  it('reports a dump 7-Zip cannot open', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-dump-'));
    dirs.push(dir);
    await writeFile(join(dir, 'broken.7z'), 'not an archive');
    const { xml, done } = await openDump(join(dir, 'broken.7z'));
    xml.resume();
    await expect(done).rejects.toThrow(/7-Zip could not read/);
  });
});

describe('link resolution', () => {
  const titles: Titles = {
    articles: new Set(['Human', 'Tatooine']),
    redirects: new Map([
      ['Humans', 'Human'],
      ['Loop a', 'Loop b'],
      ['Loop b', 'Loop a'],
    ]),
  };

  it('follows redirects to an article, and gives up on loops and missing pages', () => {
    expect(resolveTitle('Tatooine', titles)).toBe('Tatooine');
    expect(resolveTitle('humans', titles)).toBe('Human');
    expect(resolveTitle('Loop a', titles)).toBeUndefined();
    expect(resolveTitle('Nobody', titles)).toBeUndefined();
  });

  it('turns links to nowhere into text, merging with neighbouring text', () => {
    const article: ParsedArticle = {
      era: 'canon',
      fields: [{ name: 'species', items: [[{ text: 'Humans', link: 'Humans' }]] }],
      lead: [[{ text: 'Knew ' }, { text: 'Nobody', link: 'Nobody' }, { text: '.' }]],
    };
    expect(resolveLinks(article, titles)).toEqual({
      era: 'canon',
      fields: [{ name: 'species', items: [[{ text: 'Humans', link: 'Human' }]] }],
      lead: [[{ text: 'Knew Nobody.' }]],
    });
  });

  it('reports a parse failure instead of throwing', () => {
    expect(parseOne('X', null as unknown as string, titles)).toMatchObject({ title: 'X' });
  });
});

describe('snapshot files', () => {
  it('sort by title, shard, and gzip deterministically', () => {
    const lines = Array.from({ length: SHARD_SIZE + 2 }, (_, i) => ({
      title: `T${String(SHARD_SIZE + 2 - i).padStart(6, '0')}`,
      line: `{"n":${String(i)}}`,
      era: 'canon' as const,
    }));
    const files = snapshotFiles(
      lines,
      new Map([
        ['B', 'A'],
        ['A', 'C'],
      ]),
    );
    expect([...files.keys()]).toEqual([
      'articles-000.jsonl.gz',
      'articles-001.jsonl.gz',
      'redirects.jsonl.gz',
    ]);
    const second = gunzipSync(files.get('articles-001.jsonl.gz') ?? Buffer.alloc(0)).toString();
    expect(second.trim().split('\n')).toHaveLength(2);
    expect(gunzipSync(files.get('redirects.jsonl.gz') ?? Buffer.alloc(0)).toString()).toBe(
      '{"from":"A","to":"C"}\n{"from":"B","to":"A"}\n',
    );
    expect(
      snapshotFiles(
        [...lines].reverse(),
        new Map([
          ['A', 'C'],
          ['B', 'A'],
        ]),
      ),
    ).toEqual(files);
  });

  it('count kinds, most common first', () => {
    expect(kindCounts(['Character', undefined, 'Character', 'Species'])).toEqual({
      Character: 2,
      '(none)': 1,
      Species: 1,
    });
  });
});

describe('ingest, end to end', () => {
  it('turns a real .7z dump into a snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-ingest-'));
    dirs.push(dir);
    await writeFile(join(dir, 'dump.xml'), XML);
    const { path7za } = createRequire(import.meta.url)('7zip-bin') as { path7za: string };
    execFileSync(path7za, ['a', join(dir, 'dump.7z'), join(dir, 'dump.xml')], { stdio: 'ignore' });

    const messages: string[] = [];
    const meta = await ingest({
      dump: join(dir, 'dump.7z'),
      out: join(dir, 'out'),
      workers: 0,
      log: (m) => messages.push(m),
    });
    expect(meta.counts).toMatchObject({
      articles: 4,
      redirects: 1,
      canon: 3,
      legends: 1,
      failed: 0,
    });
    expect(meta.counts.kinds).toEqual({ '(none)': 1, Character: 1, CelestialBody: 1, Species: 1 });
    expect(meta.source.latestRevision).toBe('2026-07-30T10:00:00Z');
    expect(meta.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(messages.some((m) => m.startsWith('pass 1: 4 articles, 1 redirects'))).toBe(true);

    expect((await readdir(join(dir, 'out'))).sort()).toEqual([
      'articles-000.jsonl.gz',
      'meta.json',
      'redirects.jsonl.gz',
    ]);
    const records = gunzipSync(await readFile(join(dir, 'out', 'articles-000.jsonl.gz')))
      .toString()
      .trim()
      .split('\n')
      .map(
        (l) =>
          JSON.parse(l) as {
            title: string;
            fields: { name: string; items: unknown }[];
            lead: unknown;
          },
      );
    expect(records.map((r) => r.title)).toEqual([
      'Human',
      'Luke Skywalker',
      'Luke Skywalker/Legends',
      'Tatooine',
    ]);
    const luke = records[1];
    // The redirect "Humans" resolves to "Human"; the citation is gone; a link to no article is text.
    expect(luke?.fields).toEqual([
      { name: 'homeworld', items: [[{ text: 'Tatooine', link: 'Tatooine' }]] },
      { name: 'species', items: [[{ text: 'Humans', link: 'Human' }]] },
    ]);
    expect(luke?.lead).toEqual([
      [
        { text: 'Luke was from ' },
        { text: 'Tatooine', link: 'Tatooine' },
        { text: ' and knew Nobody Here.' },
      ],
    ]);

    // Same dump, same code: the snapshot is kept, not rebuilt. --force rebuilds it.
    const again: string[] = [];
    await ingest({
      dump: join(dir, 'dump.7z'),
      out: join(dir, 'out'),
      workers: 0,
      log: (m) => again.push(m),
    });
    expect(again).toEqual([expect.stringMatching(/is current for this dump; skipping/)]);
    const forced: string[] = [];
    await ingest({
      dump: join(dir, 'dump.7z'),
      out: join(dir, 'out'),
      workers: 0,
      force: true,
      log: (m) => forced.push(m),
    });
    expect(forced.some((m) => m.startsWith('pass 1:'))).toBe(true);
  });
});
