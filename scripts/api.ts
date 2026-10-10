/// <reference types="node" />
// The app (ADRs 0010, 0011): the container's entry point, an HTTP server around the handler in
// src/server/. Caddy forwards every page and /api/* here. Bundled to one file by
// `pnpm build:api`; only DuckDB's native module stays outside the bundle.
//   API_DATA: pages.sqlite, archive.duckdb and ask-schema.json, a read-only volume (default
//     /app/data); the image carries none of it (ADR 0003)
//   QUESTIONS_DB: the question log (default /data/questions.duckdb, a volume)
//   ASK_ORIGIN, ASK_KEY, ASK_MODEL: the model; PORT (default 8090)
//   KEEP_BACKUPS: copies `node api.mjs backup` keeps (default 14)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { ORIGIN } from '../src/site.js';
import type { Assets } from '../src/render/layout.js';
import { openApi } from '../src/server/open.js';
import { backupQuestionLog } from '../src/server/questions.js';

/** The site image's CSS and JS, written in by `pnpm build:api`; null without a client build. */
declare const __SITE_ASSETS__: Assets | null;

const data = process.env['API_DATA'] ?? '/app/data';
/** The data the image doesn't carry (ADR 0003): mounted read-only at API_DATA. */
const DATA_FILES = ['pages.sqlite', 'archive.duckdb', 'ask-schema.json'];
const logFile = process.env['QUESTIONS_DB'] ?? '/data/questions.duckdb';

// `node api.mjs backup` (deploy/backup.sh): copy the question log beside it, keep the newest
// KEEP_BACKUPS (default 14), and exit. The running server is left alone.
if (process.argv[2] === 'backup') {
  const copy = await backupQuestionLog(
    logFile,
    join(logFile, '..', 'backups'),
    Number(process.env['KEEP_BACKUPS'] ?? 14),
  );
  console.log(`backup: ${copy}`);
  process.exit(0);
}

const missing = DATA_FILES.filter((file) => !existsSync(join(data, file)));
if (missing.length > 0) {
  console.error(
    `api: no ${missing.join(', ')} in ${data}. The image carries no data: copy the files from ` +
      '`pnpm build` (dist-api/) into the data volume (docs/deploy.md).',
  );
  process.exit(1);
}
// This bundle's own id, for pages' ETags: new code changes them even when the data is the same.
const assets = typeof __SITE_ASSETS__ === 'undefined' ? null : __SITE_ASSETS__;
const code = {
  ...(assets === null ? {} : { assets }),
  id: createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex')
    .slice(0, 12),
};
const api = await openApi(
  {
    dataDir: data,
    logFile,
  },
  process.env,
  (problem, cause) => {
    console.error(`api: ${problem}:`, cause);
  },
  code,
);
const port = Number(process.env['PORT'] ?? 8090);

http
  .createServer(
    toNodeListener(api.handle, {
      origin: ORIGIN,
      onError: (cause) => {
        console.error('api:', cause);
      },
    }),
  )
  .listen(port, () => {
    console.log(`api: http://localhost:${String(port)}/api/`);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void api.close().finally(() => process.exit(0));
  });
}
