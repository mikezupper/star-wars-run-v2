/// <reference types="node" />
// The API service (ADR 0010): the container's entry point, an HTTP server around the handler in
// src/server/. Caddy forwards /api/* here. Bundled to one file by `pnpm build:api`; only DuckDB's
// native module stays outside the bundle.
//   API_DATA: archive.duckdb, ask-schema.json and search-titles/ (default /app/data)
//   QUESTIONS_DB: the question log (default /data/questions.duckdb, a volume)
//   ASK_ORIGIN, ASK_KEY, ASK_MODEL: the model; PORT (default 8090)
import http from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openApi } from '../src/server/open.js';

const data = process.env['API_DATA'] ?? '/app/data';
const api = await openApi(
  {
    dataDir: data,
    titlesDir: join(data, 'search-titles'),
    logFile: process.env['QUESTIONS_DB'] ?? '/data/questions.duckdb',
  },
  process.env,
  (problem, cause) => {
    console.error(`api: ${problem}:`, cause);
  },
);
const port = Number(process.env['PORT'] ?? 8090);

http
  .createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const abort = new AbortController();
      // 'close' also fires after a response finishes normally; only a dropped connection aborts.
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });
      const response = await api.handle(
        new Request(new URL(req.url ?? '/', 'http://localhost'), {
          method: req.method ?? 'GET',
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          signal: abort.signal,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body === null) res.end();
      else await pipeline(Readable.fromWeb(response.body as never), res).catch(() => undefined);
    })().catch((cause: unknown) => {
      console.error('api:', cause);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  })
  .listen(port, () => {
    console.log(`api: http://localhost:${String(port)}/api/`);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void api.close().finally(() => process.exit(0));
  });
}
