import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDataset } from '../../src/data/load.js';
import { KINDS } from '../../src/domain/records.js';
import { SNAPSHOT_VERSION } from '../../src/domain/snapshot.js';
import { fetchSwapi, snapshotFiles, writeSnapshot } from '../../src/ingest/snapshot.js';
import { fromSwapi } from '../../src/ingest/swapi.js';
import { world } from '../fixtures/swapi.js';

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'swr-snapshot-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('fetchSwapi', () => {
  it('fetches each kind from swapi.info', async () => {
    const urls: string[] = [];
    const collections = await fetchSwapi((url) => {
      urls.push(url);
      return Promise.resolve([url]);
    });
    expect(urls.sort()).toEqual(KINDS.map((k) => `https://swapi.info/api/${k}`).sort());
    expect(collections.people).toEqual(['https://swapi.info/api/people']);
  });

  it('uses fetch by default and fails on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('/films')
            ? new Response('gone', { status: 503, statusText: 'Service Unavailable' })
            : Response.json([]),
        ),
      ),
    );
    await expect(fetchSwapi()).rejects.toThrow(
      'GET https://swapi.info/api/films: 503 Service Unavailable',
    );
  });
});

describe('snapshot files', () => {
  const data = fromSwapi(world());

  it('are byte-for-byte stable for the same data', () => {
    expect(snapshotFiles(data)).toEqual(snapshotFiles(fromSwapi(world())));
  });

  it('round-trip through disk', async () => {
    const dir = await tempDir();
    await writeSnapshot(dir, data);
    expect(await loadDataset(dir)).toEqual(JSON.parse(JSON.stringify(data)));
    expect(JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))).toEqual({
      version: SNAPSHOT_VERSION,
      sources: ['https://swapi.info/api/'],
    });
  });

  it('refuse to load a snapshot from another version', async () => {
    const dir = await tempDir();
    await writeSnapshot(dir, data);
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ version: 0, sources: [] }));
    await expect(loadDataset(dir)).rejects.toThrow(/Run `pnpm ingest`/);
  });
});
