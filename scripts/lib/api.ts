/// <reference types="node" />
// The API (ADR 0010) inside the dev and preview servers: the same handler the API container
// runs, opened on first use from the build in DIST_DIR (the archive database beside it, in
// <DIST_DIR>-api/), with Ask's settings from the environment or .env. Questions are logged to
// data/questions/questions.duckdb (gitignored), or QUESTIONS_DB.
import { existsSync } from 'node:fs';
import type http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { openApi, openOnce } from '../../src/server/open.js';

const env = new URL('../../.env', import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);

const DIST = process.env['DIST_DIR'] ?? 'dist';
const at = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

export const isApi = (pathname: string): boolean => pathname.startsWith('/api/');

// Opened on the first request, and again on the next one if that failed: the build may have
// been rewriting <DIST_DIR>-api/ at the time.
const api = openOnce(() =>
  openApi(
    {
      dataDir: at(`${DIST}-api`),
      logFile: process.env['QUESTIONS_DB'] ?? at('data/questions/questions.duckdb'),
    },
    process.env,
    (problem, cause) => {
      console.error(`api: ${problem}:`, cause);
    },
  ),
);

/** `extra`: headers the production server (Caddy) adds to everything, for the preview server. */
export async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  extra: Readonly<Record<string, string>> = {},
): Promise<void> {
  const chunks: Buffer[] = [];
  const abort = new AbortController();
  // 'close' also fires after a response finishes normally; only a dropped connection aborts.
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  try {
    // Only POSTs have a body. Reading inside the try: a client that drops mid-request (smoke's
    // link check cancels every response) must end this request, not the process.
    if (req.method === 'POST') for await (const chunk of req) chunks.push(chunk as Buffer);
    const response = await (
      await api()
    ).handle(
      new Request(new URL(req.url ?? '/', 'http://localhost'), {
        method: req.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(typeof req.headers['if-none-match'] === 'string'
            ? { 'if-none-match': req.headers['if-none-match'] }
            : {}),
        },
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
        signal: abort.signal,
      }),
    );
    res.writeHead(response.status, { ...extra, ...Object.fromEntries(response.headers) });
    // pipeline(), not pipe(): an aborted or broken stream ends this response, not the process.
    if (response.body === null) res.end();
    else await pipeline(Readable.fromWeb(response.body as never), res).catch(() => undefined);
  } catch (error) {
    console.error(`api: ${req.method ?? 'GET'} ${req.url ?? '/'}:`, error);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(error) }));
  }
}
