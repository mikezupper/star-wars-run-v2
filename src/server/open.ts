// Opens the app (ADRs 0010 and 0011) from where its data is and the environment: the archive
// database, Ask's schema and the pages' file (written by the build outside the public site), the
// SQLite search indexes, the question log's file, and the model's settings. /api/ goes to the API; with a
// pages file, every other path is a page rendered on request. Used by the app container
// (scripts/api.ts) and by the preview server; the dev server renders pages itself.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AskSchema } from '../domain/ask.js';
import { createApi } from './api.js';
import { createPagesApp, type PagesCode } from './app.js';
import { openPages } from './pages.js';
import { openArchive } from './archive.js';
import { openQuestionLog } from './questions.js';

export interface ApiFiles {
  /** Holds archive.duckdb, ask-schema.json and, for pages, pages.sqlite. */
  readonly dataDir: string;
  /** The question log; unset, questions aren't logged. */
  readonly logFile?: string | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Opens something on first use and keeps it, unless opening failed: then the next call tries
 * again. A server that opened the API while `pnpm build` was rewriting its files would
 * otherwise answer every later request with the same failure until it restarted (swr-gqt).
 */
export function openOnce<T>(open: () => Promise<T>): () => Promise<T> {
  let opened: Promise<T> | undefined;
  return () =>
    (opened ??= open().catch((error: unknown) => {
      opened = undefined;
      throw error;
    }));
}

export async function openApi(
  files: ApiFiles,
  env: Env,
  report?: (problem: string, cause: unknown) => void,
  code: PagesCode = {},
): Promise<{
  readonly handle: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}> {
  const archive = await openArchive(join(files.dataDir, 'archive.duckdb'));
  const log = files.logFile === undefined ? undefined : await openQuestionLog(files.logFile);
  let schema: Promise<AskSchema> | undefined;
  const pagesFile = join(files.dataDir, 'pages.sqlite');
  const pages = existsSync(pagesFile) ? openPages(pagesFile) : undefined;
  const page = pages === undefined ? undefined : createPagesApp(pages, code);
  const api = createApi({
    archive,
    // Without the pages file there's no search: Ask then finds no names, and says so.
    resolve:
      pages?.search.resolve ??
      ((names) => Promise.resolve(names.map((asked) => ({ asked, titles: [] })))),
    ...(pages === undefined ? {} : { search: pages.search.search, preview: pages.preview }),
    schema: () =>
      (schema ??= readFile(join(files.dataDir, 'ask-schema.json'), 'utf8').then(
        (t) => JSON.parse(t) as AskSchema,
      )),
    model: {
      origin: env['ASK_ORIGIN'] ?? 'http://127.0.0.1:9',
      key: env['ASK_KEY'] ?? '',
      model: env['ASK_MODEL'] ?? 'Qwen3.8-27B',
    },
    log,
    ...(report === undefined ? {} : { report }),
  });
  return {
    handle: (request) =>
      page === undefined || new URL(request.url).pathname.startsWith('/api/')
        ? api(request)
        : page(request),
    close: async () => {
      await log?.close();
      archive.close();
      pages?.close();
    },
  };
}
