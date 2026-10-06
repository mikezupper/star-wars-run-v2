import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DUMP_ENV,
  dumpPath,
  missingDump,
  prepareSnapshot,
  workersFrom,
} from '../../../src/ingest/wookieepedia/source.js';

const dirs: string[] = [];
afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const XML = `<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/"><siteinfo><sitename>Wookieepedia</sitename></siteinfo><page><title>Tatooine</title><ns>0</ns><id>1</id><revision><id>2</id><timestamp>2026-07-30T10:00:00Z</timestamp><text xml:space="preserve">A desert planet.</text></revision></page></mediawiki>`;

describe('where the dump is', () => {
  it('comes from the environment, else ~/Downloads', () => {
    expect(dumpPath({ [DUMP_ENV]: '/data/dump.7z' }, '/home/x')).toBe('/data/dump.7z');
    expect(dumpPath({ [DUMP_ENV]: '' }, '/home/x')).toBe(
      '/home/x/Downloads/starwars_pages_current.xml.7z',
    );
    expect(dumpPath({}, '/home/x')).toBe('/home/x/Downloads/starwars_pages_current.xml.7z');
  });

  it('reads a worker count only when it is a whole number', () => {
    expect(workersFrom({ WOOKIEEPEDIA_WORKERS: '4' })).toBe(4);
    expect(workersFrom({ WOOKIEEPEDIA_WORKERS: '0' })).toBe(0);
    expect(workersFrom({ WOOKIEEPEDIA_WORKERS: 'many' })).toBeUndefined();
    expect(workersFrom({})).toBeUndefined();
  });

  it('says where to get the dump and how to point at it', () => {
    const message = missingDump('/nowhere/dump.7z');
    expect(message).toContain('/nowhere/dump.7z');
    expect(message).toContain('https://starwars.fandom.com/wiki/Special:Statistics');
    expect(message).toContain(DUMP_ENV);
  });
});

describe('getting the snapshot ready', () => {
  it('fails with instructions when there is neither a dump nor a snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-source-'));
    dirs.push(dir);
    await expect(
      prepareSnapshot({ dump: join(dir, 'none.7z'), out: join(dir, 'out'), log: () => undefined }),
    ).rejects.toThrow(/no snapshot in .*\n.*No Wookieepedia dump/s);
  });

  it('ingests the dump once, then keeps the snapshot; without the dump it uses the snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-source-'));
    dirs.push(dir);
    await writeFile(join(dir, 'dump.xml'), XML);
    const { path7za } = createRequire(import.meta.url)('7zip-bin') as { path7za: string };
    execFileSync(path7za, ['a', join(dir, 'dump.7z'), join(dir, 'dump.xml')], { stdio: 'ignore' });
    const out = join(dir, 'out');
    const messages: string[] = [];
    const log = (m: string) => messages.push(m);

    const built = await prepareSnapshot({ dump: join(dir, 'dump.7z'), out, workers: 0, log });
    expect(built.counts.articles).toBe(1);
    await prepareSnapshot({ dump: join(dir, 'dump.7z'), out, workers: 0, log });
    expect(messages.some((m) => m.includes('is current for this dump; skipping'))).toBe(true);

    const kept = await prepareSnapshot({ dump: join(dir, 'gone.7z'), out, log });
    expect(kept.source.sha256).toBe(built.source.sha256);
    expect(messages.at(-1)).toMatch(/No dump at .*gone\.7z.*2026-07-30.*may be stale/);
  });
});
