import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadArticles, loadWookieepediaIndex, summaryOf } from '../../src/data/wookieepedia.js';
import { articleLine, snapshotFiles } from '../../src/ingest/wookieepedia/snapshot.js';

const dirs: string[] = [];
afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe('the Wookieepedia snapshot index', () => {
  it('reads titles, eras, kinds and redirects from what the ingest writes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-wook-'));
    dirs.push(dir);
    const files = snapshotFiles(
      [
        articleLine('Tatooine', { era: 'canon', kind: 'CelestialBody', fields: [], lead: [] }),
        articleLine('Revan', { era: 'legends', fields: [], lead: [] }),
      ],
      new Map([['Tatoo', 'Tatooine']]),
    );
    for (const [name, contents] of files) await writeFile(join(dir, name), contents);
    const index = await loadWookieepediaIndex(dir);
    expect([...index.articles.values()]).toEqual([
      { title: 'Revan', era: 'legends' },
      { title: 'Tatooine', era: 'canon', kind: 'CelestialBody' },
    ]);
    expect(index.redirects.get('Tatoo')).toBe('Tatooine');
  });

  it('says how to build the snapshot when there is none', async () => {
    await expect(loadWookieepediaIndex(join(tmpdir(), 'swr-no-such-dir'))).rejects.toThrow(
      /pnpm ingest:wookieepedia/,
    );
  });
});

describe('reading a line\u2019s summary without parsing the article', () => {
  const lineOf = (title: string, kind?: string) =>
    articleLine(title, {
      era: 'legends',
      ...(kind === undefined ? {} : { kind }),
      fields: [{ name: 'title', items: [[{ text: '"title":"Decoy"' }]] }],
      lead: [],
    }).line;

  it('matches a full parse, for titles with quotes and backslashes, with or without a kind', () => {
    for (const line of [
      lineOf('Luke Skywalker/Legends', 'Character'),
      lineOf('"Wild Karrde" \\ the ship', 'Ship'),
      lineOf('Untyped'),
    ]) {
      const { title, era, kind } = JSON.parse(line) as Record<string, string>;
      expect(summaryOf(line)).toEqual({ title, era, ...(kind === undefined ? {} : { kind }) });
    }
  });

  it('reads the counterpart from the head too', () => {
    const line = articleLine('Palpatine', {
      era: 'legends',
      kind: 'Character',
      counterpart: 'Darth "Sidious"',
      fields: [],
      lead: [],
    }).line;
    expect(summaryOf(line)).toEqual({
      title: 'Palpatine',
      era: 'legends',
      kind: 'Character',
      counterpart: 'Darth "Sidious"',
    });
    expect(summaryOf('{"era":"legends","counterpart":"X","title":"Y"}')).toEqual({
      title: 'Y',
      era: 'legends',
      counterpart: 'X',
    });
  });

  it('falls back to a full parse when the keys come in another order', () => {
    expect(summaryOf('{"era":"canon","title":"Hoth"}')).toEqual({ title: 'Hoth', era: 'canon' });
  });

  it('loads only the articles asked for', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-only-'));
    dirs.push(dir);
    const lines = ['A', 'B', 'C'].map((t) => articleLine(t, { era: 'canon', fields: [], lead: [] }));
    for (const [file, bytes] of snapshotFiles(lines, new Map())) {
      await writeFile(join(dir, file), bytes);
    }
    expect([...(await loadArticles(dir, new Set(['B']))).keys()]).toEqual(['B']);
    expect((await loadArticles(dir)).size).toBe(3);
  });
});
