// Opens the API (ADR 0010) from where its data is and the environment: the archive database and
// Ask's schema (written by the build outside the public site), the title index, the question
// log's file, and the model's settings. Used by the API container (scripts/api.ts) and by the
// dev and preview servers.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AskSchema } from '../domain/ask.js';
import { createApi } from './api.js';
import { openArchive } from './archive.js';
import { openQuestionLog } from './questions.js';
import { titleResolver } from './titles.js';

export interface ApiFiles {
  /** Holds archive.duckdb and ask-schema.json. */
  readonly dataDir: string;
  /** The search title index (search-titles/). */
  readonly titlesDir: string;
  /** The question log; unset, questions aren't logged. */
  readonly logFile?: string | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

export async function openApi(
  files: ApiFiles,
  env: Env,
  report?: (problem: string, cause: unknown) => void,
): Promise<{
  readonly handle: (request: Request) => Promise<Response>;
  readonly close: () => void;
}> {
  const archive = await openArchive(join(files.dataDir, 'archive.duckdb'));
  const log = files.logFile === undefined ? undefined : await openQuestionLog(files.logFile);
  let schema: Promise<AskSchema> | undefined;
  const handle = createApi({
    archive,
    resolve: titleResolver(files.titlesDir),
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
    handle,
    close: () => {
      archive.close();
      log?.close();
    },
  };
}
