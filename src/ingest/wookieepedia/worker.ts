// A parsing worker (one per core, started by ingest.ts). It receives every title and redirect
// once, then batches of articles, and answers each batch with one JSON line per article.
// Thin on purpose: the logic is in wikitext.ts and links.ts, which are tested directly.
import { parentPort, workerData } from 'node:worker_threads';
import { parseOne, type Titles } from './links.js';

interface Setup {
  readonly articles: readonly string[];
  readonly redirects: readonly (readonly [string, string])[];
}

const setup = workerData as Setup;
const titles: Titles = { articles: new Set(setup.articles), redirects: new Map(setup.redirects) };

parentPort?.on('message', (batch: readonly { readonly title: string; readonly text: string }[]) => {
  parentPort?.postMessage(batch.map(({ title, text }) => parseOne(title, text, titles)));
});
