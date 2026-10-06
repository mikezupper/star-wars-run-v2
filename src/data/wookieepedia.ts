// Reads the Wookieepedia snapshot that `pnpm ingest:wookieepedia` writes to data/wookieepedia/
// (src/ingest/wookieepedia/snapshot.ts). It's rebuilt from the dump, never stored (ADR 0007),
// so a missing snapshot is an expected state with its own message.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { ArticleRecord } from '../domain/article.js';

export const WOOKIEEPEDIA_DIR = fileURLToPath(new URL('../../data/wookieepedia/', import.meta.url));

/** What matching and indexing need from each article, without its text. */
export interface ArticleSummary {
  readonly title: string;
  readonly era: 'canon' | 'legends';
  readonly kind?: string;
}

export interface WookieepediaIndex {
  readonly articles: ReadonlyMap<string, ArticleSummary>;
  readonly redirects: ReadonlyMap<string, string>;
}

const lines = (gz: Buffer): string[] => gunzipSync(gz).toString('utf8').split('\n').filter(Boolean);

export async function loadWookieepediaIndex(dir: string = WOOKIEEPEDIA_DIR): Promise<WookieepediaIndex> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(
      `No Wookieepedia snapshot in ${dir}. Run \`pnpm ingest:wookieepedia <dump.7z>\` first (ADR 0007).`,
    );
  }
  const articles = new Map<string, ArticleSummary>();
  for (const file of files.filter((f) => /^articles-\d+\.jsonl\.gz$/.test(f)).sort()) {
    for (const line of lines(await readFile(join(dir, file)))) {
      const { title, era, kind } = JSON.parse(line) as ArticleSummary;
      articles.set(title, { title, era, ...(kind === undefined ? {} : { kind }) });
    }
  }
  const redirects = new Map<string, string>();
  for (const line of lines(await readFile(join(dir, 'redirects.jsonl.gz')))) {
    const { from, to } = JSON.parse(line) as { from: string; to: string };
    redirects.set(from, to);
  }
  return { articles, redirects };
}

/**
 * Every article in the snapshot, or only those named in `only`. The full archive is about
 * 1–2 GB in memory: the dev server loads it once at start, not per request.
 */
export async function loadArticles(
  dir: string = WOOKIEEPEDIA_DIR,
  only?: ReadonlySet<string>,
): Promise<Map<string, ArticleRecord>> {
  await loadWookieepediaIndex(dir); // the same clear error when there's no snapshot
  const out = new Map<string, ArticleRecord>();
  const files = (await readdir(dir)).filter((f) => /^articles-\d+\.jsonl\.gz$/.test(f)).sort();
  for (const file of files) {
    for (const line of lines(await readFile(join(dir, file)))) {
      const record = JSON.parse(line) as ArticleRecord;
      if (only === undefined || only.has(record.title)) out.set(record.title, record);
    }
  }
  return out;
}
