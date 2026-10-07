/// <reference types="node" />
// The question log service (swr-ca3.3): POST /api/ask/log → one row in SQLite. It runs in its
// own container next to the site (compose.yaml); Caddy forwards /api/ask/log to it. Bundled
// to one file by `pnpm build:questions`. QUESTIONS_DB is the database file, PORT the port.
import http from 'node:http';
import { QUESTIONS_PATH } from '../src/domain/question-log.js';
import { handleQuestionLog, openQuestionLog } from '../src/server/question-log.js';

const log = openQuestionLog(process.env['QUESTIONS_DB'] ?? '/data/questions.db');
const port = Number(process.env['PORT'] ?? 8090);

http
  .createServer((req, res) => {
    void (async () => {
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== QUESTIONS_PATH) {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const response = await handleQuestionLog(
        new Request('http://localhost' + QUESTIONS_PATH, {
          method: req.method ?? 'GET',
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
        }),
        log,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers)).end();
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  })
  .listen(port, () => {
    console.log(`question log: http://localhost:${String(port)}${QUESTIONS_PATH}`);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.close();
    process.exit(0);
  });
}
