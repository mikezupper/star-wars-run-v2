/// <reference types="node" />
// Ask the archive's /api/ask route for the dev and preview servers (swr-ei6.1): a Node request
// in, src/hosting/ask.ts's proxyAsk(), the streamed answer out. Caddy does the same in
// production. Settings come from the environment, or from .env when it exists.
import { existsSync } from 'node:fs';
import type http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ASK_PATH, proxyAsk } from '../../src/hosting/ask.js';
import { QUESTIONS_PATH } from '../../src/domain/question-log.js';
import {
  handleQuestionLog,
  openQuestionLog,
  type QuestionLog,
} from '../../src/server/question-log.js';

const env = new URL('../../.env', import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);

export const isAsk = (pathname: string): boolean =>
  pathname === ASK_PATH || pathname === QUESTIONS_PATH;

/** Locally, questions go to data/questions/questions.db (gitignored), opened on first use. */
let log: QuestionLog | undefined;
const localLog = (): QuestionLog =>
  (log ??= openQuestionLog(
    process.env['QUESTIONS_DB'] ??
      new URL('../../data/questions/questions.db', import.meta.url).pathname,
  ));

export async function handleAsk(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (new URL(req.url ?? '/', 'http://localhost').pathname === QUESTIONS_PATH) {
    const response = await handleQuestionLog(
      new Request('http://localhost' + QUESTIONS_PATH, {
        method: req.method ?? 'GET',
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      }),
      localLog(),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers)).end();
    return;
  }
  const abort = new AbortController();
  // 'close' also fires after a response finishes normally; only a dropped connection aborts.
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  try {
    const response = await proxyAsk(
      new Request(new URL(req.url ?? '/', 'http://localhost'), {
        method: req.method ?? 'GET',
        headers: { accept: req.headers.accept ?? 'application/json' },
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
        signal: abort.signal,
      }),
      { ASK_ORIGIN: process.env['ASK_ORIGIN'], ASK_KEY: process.env['ASK_KEY'] },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    // pipeline(), not pipe(): an aborted or broken stream must end this response, not the process.
    if (response.body === null) res.end();
    else await pipeline(Readable.fromWeb(response.body as never), res).catch(() => undefined);
  } catch (error) {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: String(error) } }));
  }
}
