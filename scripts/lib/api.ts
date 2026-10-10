/// <reference types="node" />
// The API (ADR 0010) inside the dev and preview servers: the same handler the API container
// runs, opened on first use from the build in DIST_DIR (the archive database beside it, in
// <DIST_DIR>-api/), with Ask's settings from the environment or .env. Questions are logged to
// data/questions/questions.duckdb (gitignored), or QUESTIONS_DB.
import { existsSync } from 'node:fs';
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

/** Headers Caddy adds in production, applied to app responses by preview. */
export async function handleApi(
  request: Request,
  extra: Readonly<Record<string, string>> = {},
): Promise<Response> {
  try {
    const response = await (await api()).handle(request);
    const headers = new Headers(extra);
    for (const [name, value] of response.headers) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error(`api: ${request.method} ${new URL(request.url).pathname}:`, error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 502,
      headers: { ...extra, 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}
