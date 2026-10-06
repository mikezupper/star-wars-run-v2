import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadWookieepediaIndex } from '../../src/data/wookieepedia.js';
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
