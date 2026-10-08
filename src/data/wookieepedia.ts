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
  readonly counterpart?: string;
}

export interface WookieepediaIndex {
  readonly articles: ReadonlyMap<string, ArticleSummary>;
  readonly redirects: ReadonlyMap<string, string>;
}

const lines = (gz: Buffer): string[] => gunzipSync(gz).toString('utf8').split('\n').filter(Boolean);

/**
 * A line's title, era, kind and counterpart, read from its start without parsing the article:
 * articleLine() (src/ingest/wookieepedia/snapshot.ts) writes those keys first. Parsing every
 * article in full just to index it made a 400-page sample build spend half a minute loading.
 */
const STRING = '("(?:[^"\\\\]|\\\\.)*")';
const HEAD = new RegExp(
  `^\\{"title":${STRING},"era":"(canon|legends)"(?:,"kind":${STRING})?(?:,"counterpart":${STRING})?`,
);

export function summaryOf(line: string): ArticleSummary {
  const head = HEAD.exec(line);
  if (head?.[1] === undefined) {
    const { title, era, kind, counterpart } = JSON.parse(line) as ArticleSummary;
    return {
      title,
      era,
      ...(kind === undefined ? {} : { kind }),
      ...(counterpart === undefined ? {} : { counterpart }),
    };
  }
  const read = (json: string | undefined) =>
    json === undefined ? undefined : (JSON.parse(json) as string);
  const kind = read(head[3]);
  const counterpart = read(head[4]);
  return {
    title: JSON.parse(head[1]) as string,
    era: head[2] as ArticleSummary['era'],
    ...(kind === undefined ? {} : { kind }),
    ...(counterpart === undefined ? {} : { counterpart }),
  };
}

const articleFiles = async (dir: string): Promise<string[]> => {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(
      `No Wookieepedia snapshot in ${dir}. Run \`pnpm ingest:wookieepedia <dump.7z>\` first (ADR 0007).`,
    );
  }
  return files.filter((f) => /^articles-\d+\.jsonl\.gz$/.test(f)).sort();
};

export async function loadWookieepediaIndex(dir: string = WOOKIEEPEDIA_DIR): Promise<WookieepediaIndex> {
  const articles = new Map<string, ArticleSummary>();
  for (const file of await articleFiles(dir)) {
    for (const line of lines(await readFile(join(dir, file)))) {
      const summary = summaryOf(line);
      articles.set(summary.title, summary);
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
  const out = new Map<string, ArticleRecord>();
  for (const file of await articleFiles(dir)) {
    for (const line of lines(await readFile(join(dir, file)))) {
      if (only !== undefined && !only.has(summaryOf(line).title)) continue;
      const record = JSON.parse(line) as ArticleRecord;
      out.set(record.title, record);
    }
  }
  return out;
}
