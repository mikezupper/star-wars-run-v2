// The API (ADR 0010): everything on the site that answers a question. Caddy forwards /api/* here
// in production; the dev and preview servers call it in-process.
// - POST /api/ask {question, history}: Ask the archive, as server-sent events, one per step, then
//   the answer (or why there isn't one).
// - POST /api/query {sql}: the SQL editor's query, as JSON.
// - GET /api/health: 200, for Docker.
import { checkSql } from '../domain/ask.js';
import type { AskInput } from '../domain/ask-pipeline.js';
import { MAX_QUERY_ROWS } from '../domain/query.js';
import { answerQuestion, type AskContext } from './ask.js';

export const ASK_PATH = '/api/ask';
export const QUERY_PATH = '/api/query';
/** For Docker's health check: 200 once the API is open. */
export const HEALTH_PATH = '/api/health';
/** A question and a few earlier ones are a few KB; anything far bigger isn't from the page. */
export const MAX_BODY_BYTES = 64 * 1024;

const LIMITS = { question: 500, history: 4, sql: 10_000 } as const;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const error = (status: number, message: string) => json(status, { error: message });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : undefined;

/** A question and its history from a request body, or undefined if it isn't one. */
export function parseAsk(body: unknown): AskInput | undefined {
  if (!isRecord(body)) return undefined;
  const question = text(body['question'], LIMITS.question);
  if (question === undefined) return undefined;
  const history = (Array.isArray(body['history']) ? body['history'] : [])
    .filter(isRecord)
    .map((t) => ({
      question: text(t['question'], LIMITS.question),
      sql: text(t['sql'], LIMITS.sql),
      looksFor: text(t['looksFor'], LIMITS.question) ?? '',
    }))
    .filter(
      (t): t is { question: string; sql: string; looksFor: string } =>
        t.question !== undefined && t.sql !== undefined,
    )
    .slice(-LIMITS.history);
  return { question, history };
}

async function readBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) throw new RangeError('too large');
  return JSON.parse(body) as unknown;
}

export function createApi(context: AskContext): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path === HEALTH_PATH) return json(200, { ok: true });
    if (path !== ASK_PATH && path !== QUERY_PATH) return error(404, 'Not found.');
    if (request.method !== 'POST') return error(405, 'Only POST is allowed.');
    let body: unknown;
    try {
      body = await readBody(request);
    } catch (cause) {
      return cause instanceof RangeError
        ? error(413, 'The request is too large.')
        : error(400, 'The body must be JSON.');
    }

    if (path === QUERY_PATH) {
      const sql = isRecord(body) ? text(body['sql'], LIMITS.sql) : undefined;
      if (sql === undefined) return error(400, 'Send {"sql": "SELECT …"}.');
      const checked = checkSql(sql, MAX_QUERY_ROWS + 1);
      if ('error' in checked) return error(400, checked.error);
      try {
        return json(200, await context.archive.query(checked.sql, MAX_QUERY_ROWS));
      } catch (cause) {
        return error(400, cause instanceof Error ? cause.message : String(cause));
      }
    }

    const input = parseAsk(body);
    if (input === undefined) return error(400, 'Send {"question": "…", "history": []}.');
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        await answerQuestion(
          input,
          context,
          (event) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
          request.signal,
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  };
}
