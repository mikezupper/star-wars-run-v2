// Reads the Wookieepedia snapshot that `pnpm ingest:wookieepedia` writes to data/wookieepedia/
// (src/ingest/wookieepedia/snapshot.ts). It's rebuilt from the dump, never stored (ADR 0007),
// so a missing snapshot is an expected state with its own message.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

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
