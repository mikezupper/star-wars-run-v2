// The Wookieepedia ingest (docs/design-docs/0007-wookieepedia.md): a local dump in, a
// snapshot out. Two passes over the dump:
// 1. titles and redirects only (no wikitext parsing): what every link may point at;
// 2. every article parsed in worker threads, one per core, links resolved through pass 1.
// Then the lines are sorted by title and written as shards (snapshot.ts).
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openDump, readPages, type DumpPage } from './dump.js';
import { kindCounts, snapshotFiles, SNAPSHOT_VERSION, type Line, type Meta } from './snapshot.js';
import { parseOne, type Titles } from './links.js';
import { normaliseTitle } from './wikitext.js';

const BATCH = 250;

export interface IngestOptions {
  readonly dump: string;
  readonly out: string;
  /** Worker threads; defaults to one per core but one. 0 parses on this thread (tests). */
  readonly workers?: number;
  readonly log?: (message: string) => void;
}

/** Every page of the dump, closing the 7-Zip process when done. */
async function* pages(dump: string): AsyncGenerator<DumpPage> {
  const { xml, done } = await openDump(dump);
  yield* readPages(xml);
  await done;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

type Result = Line | { title: string; error: string };

/** Parses on the calling thread: what each worker does, without threads (workers: 0). */
function inProcess(setup: { articles: string[]; redirects: [string, string][] }) {
  const titles: Titles = { articles: new Set(setup.articles), redirects: new Map(setup.redirects) };
  return {
    run: (batch: readonly { title: string; text: string }[]): Promise<Result[]> =>
      Promise.resolve(batch.map((page) => parseOne(page.title, page.text, titles))),
    close: () => Promise.resolve([]),
  };
}

/** A pool of parsing workers. `run` resolves with the lines of one batch. */
function pool(size: number, setup: object) {
  const workers = Array.from(
    { length: size },
    () => new Worker(new URL('./worker.ts', import.meta.url), { workerData: setup }),
  );
  const idle = [...workers];
  const waiting: ((w: Worker) => void)[] = [];
  const take = () =>
    new Promise<Worker>((resolve) => {
      const w = idle.pop();
      if (w !== undefined) resolve(w);
      else waiting.push(resolve);
    });
  const give = (w: Worker) => {
    const next = waiting.shift();
    if (next !== undefined) next(w);
    else idle.push(w);
  };
  return {
    async run(batch: readonly { title: string; text: string }[]) {
      const w = await take();
      try {
        return await new Promise<Result[]>((resolve, reject) => {
          w.once('message', resolve);
          w.once('error', reject);
          w.postMessage(batch);
        });
      } finally {
        w.removeAllListeners('error');
        give(w);
      }
    },
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}

export async function ingest(options: IngestOptions): Promise<Meta> {
  const log = options.log ?? (() => undefined);
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;

  // Pass 1: titles and redirects.
  const articles = new Set<string>();
  const redirects = new Map<string, string>();
  let latestRevision = '';
  for await (const page of pages(options.dump)) {
    if (page.ns !== 0) continue;
    if (page.timestamp > latestRevision) latestRevision = page.timestamp;
    if (page.redirect !== undefined) redirects.set(normaliseTitle(page.title), page.redirect);
    else articles.add(normaliseTitle(page.title));
  }
  log(
    `pass 1: ${String(articles.size)} articles, ${String(redirects.size)} redirects (${elapsed()})`,
  );

  // Pass 2: parse in workers.
  const size = options.workers ?? Math.max(1, availableParallelism() - 1);
  const limit = Math.max(1, size);
  log(`pass 2: parsing with ${String(size)} workers`);
  const setup = { articles: [...articles], redirects: [...redirects] };
  const workers = size === 0 ? inProcess(setup) : pool(size, setup);
  const lines: Line[] = [];
  const failures: { title: string; error: string }[] = [];
  const inFlight = new Set<Promise<void>>();
  let batch: { title: string; text: string }[] = [];
  let seen = 0;
  const send = async (b: { title: string; text: string }[]) => {
    for (const result of await workers.run(b)) {
      if ('error' in result) failures.push(result);
      else lines.push(result);
    }
  };
  const flush = async () => {
    const job = send(batch).finally(() => inFlight.delete(job));
    inFlight.add(job);
    batch = [];
    // Backpressure: never more batches in flight than twice the workers.
    if (inFlight.size >= 2 * limit) await Promise.race(inFlight);
  };
  try {
    for await (const page of pages(options.dump)) {
      if (page.ns !== 0 || page.redirect !== undefined) continue;
      batch.push({ title: normaliseTitle(page.title), text: page.text });
      if (batch.length >= BATCH) await flush();
      if (++seen % 25_000 === 0) log(`pass 2: ${String(seen)} sent (${elapsed()})`);
    }
    if (batch.length > 0) await flush();
    await Promise.all(inFlight);
  } finally {
    await workers.close();
  }
  log(`pass 2: ${String(lines.length)} parsed, ${String(failures.length)} failed (${elapsed()})`);

  const meta: Meta = {
    version: SNAPSHOT_VERSION,
    source: { file: basename(options.dump), sha256: await sha256(options.dump), latestRevision },
    parser: 'wikiparser-node@1.48.0',
    counts: {
      articles: lines.length,
      redirects: redirects.size,
      canon: lines.filter((l) => l.era === 'canon').length,
      legends: lines.filter((l) => l.era === 'legends').length,
      failed: failures.length,
      kinds: kindCounts(lines.map((l) => l.kind)),
    },
  };
  await mkdir(options.out, { recursive: true });
  for (const [name, contents] of snapshotFiles(lines, redirects)) {
    await writeFile(join(options.out, name), contents);
  }
  await writeFile(join(options.out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  if (failures.length > 0) {
    await writeFile(join(options.out, 'failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  }
  log(`wrote ${options.out} (${elapsed()})`);
  return meta;
}
