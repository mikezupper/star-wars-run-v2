// Ask the archive's driver (swr-ei6): a question in, an answer out, with each step reported as
// it happens. The model is reached through this site's /api/ask route (src/hosting/ask.ts), so
// the browser holds no key; names resolve through the search title index; the SQL runs in
// DuckDB-WASM like every Explore query. The prompts and checks are in src/domain/ask.ts.
import { command, defineDriver, type Command } from '@gyral/core';
import {
  checkSql,
  deltaText,
  readSse,
  MAX_ROWS,
  asPlan,
  asQuery,
  planMessages,
  PLAN_SCHEMA,
  QUERY_SCHEMA,
  sqlMessages,
  summaryMessages,
  type AskSchema,
  type Message,
  type Resolved,
  type Turn,
} from '../domain/ask.js';
import { QUESTIONS_PATH, type Outcome, type QuestionRecord } from '../domain/question-log.js';
import { queryRows, type QueryResult } from './duckdb.js';
import { resolveNames } from './titles.js';

/** The model, set at build time from ASK_MODEL (vite.config.ts). */
declare const __ASK_MODEL__: string | undefined;
const MODEL =
  typeof __ASK_MODEL__ === 'string' && __ASK_MODEL__ !== '' ? __ASK_MODEL__ : 'Qwen3.8-27B';

/** Tries at writing SQL that runs: the first, and two corrections with the error. */
const ATTEMPTS = 3;

export interface AskInput {
  readonly question: string;
  readonly history: readonly Turn[];
}

export interface Answer {
  readonly question: string;
  readonly looksFor: string;
  readonly sql: string;
  readonly resolved: readonly Resolved[];
  readonly result: QueryResult;
  readonly summary: string;
}

/** What the driver reports: each step and the summary as it's written (emitted), then the
 * answer (its result). */
export type AskEvent =
  | { readonly _tag: 'Reading' }
  | { readonly _tag: 'Matched'; readonly resolved: readonly Resolved[] }
  | { readonly _tag: 'Searching'; readonly looksFor: string }
  | { readonly _tag: 'Found'; readonly count: number; readonly truncated: boolean }
  | { readonly _tag: 'Writing'; readonly text: string }
  | { readonly _tag: 'Answered'; readonly answer: Answer };

/** Why a question got no answer: the model can't be reached, no query would run, or it took
 * too long. */
export type AskFailure = 'unavailable' | 'unanswerable' | 'slow';

/** The outside world, as functions: the real ones below, fakes in tests. */
export interface AskDeps {
  readonly chat: (messages: Message[], schema?: object) => Promise<string>;
  readonly stream: (messages: Message[], onText: (text: string) => void) => Promise<string>;
  readonly resolve: (names: readonly string[]) => Promise<Resolved[]>;
  readonly query: (sql: string) => Promise<QueryResult>;
  readonly schema: () => Promise<AskSchema>;
}

/** An error from reaching the model, as opposed to a query that wouldn't run. */
class Unavailable extends Error {}

/** The steps, emitted as they happen; resolves with the answer. */
export async function ask(
  input: AskInput,
  deps: AskDeps,
  emit: (event: Exclude<AskEvent, { _tag: 'Answered' }>) => void,
): Promise<Answer> {
  const { question, history } = input;
  const model = async (messages: Message[], schema?: object) => {
    try {
      return await deps.chat(messages, schema);
    } catch (cause) {
      throw new Unavailable(String(cause));
    }
  };
  emit({ _tag: 'Reading' });
  const [plan, schema] = await Promise.all([
    model(planMessages(question, history), PLAN_SCHEMA).then(asPlan),
    deps.schema(),
  ]);
  const resolved = await deps.resolve(plan?.names ?? []);
  emit({ _tag: 'Matched', resolved });

  let failed: { sql: string; error: string } | undefined;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const query = asQuery(
      await model(sqlMessages(question, resolved, schema, history, failed), QUERY_SCHEMA),
    );
    if (query === undefined) continue;
    const checked = checkSql(query.sql);
    if ('error' in checked) {
      failed = { sql: query.sql, error: checked.error };
      continue;
    }
    emit({ _tag: 'Searching', looksFor: query.looksFor });
    let result: QueryResult;
    try {
      result = await deps.query(checked.sql);
    } catch (cause) {
      failed = { sql: query.sql, error: cause instanceof Error ? cause.message : String(cause) };
      continue;
    }
    // One row past MAX_ROWS was fetched to know whether there were more.
    const truncated = result.rows.length > MAX_ROWS;
    const rows = result.rows.slice(0, MAX_ROWS);
    emit({ _tag: 'Found', count: rows.length, truncated });
    // Without a summary, the rows still answer the question.
    const summary = await deps
      .stream(summaryMessages(question, result.columns, rows, truncated, query.sql), (text) => {
        emit({ _tag: 'Writing', text });
      })
      .catch(() => '');
    const answer: Answer = {
      question,
      looksFor: query.looksFor,
      sql: query.sql.trim(),
      resolved,
      result: { ...result, rows, truncated },
      summary,
    };
    return answer;
  }
  throw new Error('unanswerable');
}

/** A question that takes longer than this is stopped, with its own message. */
export const TIME_LIMIT_MS = 45_000;

const ASK_URL = '/api/ask/chat/completions';

async function complete(body: object, signal: AbortSignal): Promise<Response> {
  const response = await fetch(ASK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0, ...body }),
    signal,
  });
  if (!response.ok) throw new Error(`/api/ask: ${String(response.status)}`);
  return response;
}

let schema: Promise<AskSchema> | undefined;

/** The real outside world: the model through /api/ask, the title index, DuckDB, the schema. */
function browserDeps(signal: AbortSignal): AskDeps {
  return {
    chat: async (messages, json) => {
      const response = await complete(
        {
          messages,
          ...(json === undefined
            ? {}
            : { response_format: { type: 'json_schema', json_schema: json } }),
        },
        signal,
      );
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? '';
    },
    stream: async (messages, onText) => {
      const response = await complete({ messages, stream: true }, signal);
      if (response.body === null) return '';
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const { data, rest } = readSse(buffer + value);
        buffer = rest;
        for (const payload of data) text += deltaText(payload);
        onText(text);
      }
      return text;
    },
    resolve: resolveNames,
    query: queryRows,
    schema: () => {
      schema ??= fetch('/data/ask-schema.json').then((r) => r.json() as Promise<AskSchema>);
      schema.catch(() => (schema = undefined));
      return schema;
    },
  };
}

/** Thrown when a question runs past TIME_LIMIT_MS. */
class Slow extends Error {}
const SLOW = 'slow';

const failureOf = (cause: unknown): AskFailure =>
  cause instanceof Slow ? 'slow' : cause instanceof Unavailable ? 'unavailable' : 'unanswerable';

/**
 * Posts how a question went to the question log (swr-ca3.3), fire and forget: a failed post
 * never touches the answer. Nothing identifies the visitor.
 */
function record(entry: Omit<QuestionRecord, 'model'>): void {
  void fetch(QUESTIONS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...entry, model: MODEL }),
    keepalive: true,
  }).catch(() => undefined);
}

const askDriver = defineDriver<AskInput, AskEvent, AskFailure>({
  name: 'ask',
  concurrency: 'switch',
  run: async (input, { emit, signal }) => {
    // One signal for both ways a question ends early: a newer question, or the time limit.
    const stop = new AbortController();
    const onAbort = () => {
      stop.abort();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      stop.abort(SLOW);
    }, TIME_LIMIT_MS);
    const started = performance.now();
    let names: string[] = [];
    const log = (outcome: Outcome, sql: string | null, rows: number | null) => {
      // A question replaced by a newer one isn't logged: the newer one is what was meant.
      if (signal.aborted) return;
      const seconds = (performance.now() - started) / 1000;
      record({
        question: input.question,
        outcome,
        names,
        sql,
        rows,
        seconds,
        followUp: input.history.length > 0,
      });
    };
    try {
      const answer = await ask(input, browserDeps(stop.signal), (event) => {
        if (event._tag === 'Matched') names = event.resolved.map((r) => r.asked);
        emit(event);
      });
      const rows = answer.result.rows.length;
      log(rows === 0 ? 'empty' : 'answered', answer.sql, rows);
      return { _tag: 'Answered', answer };
    } catch (cause) {
      const error = stop.signal.reason === SLOW ? new Slow() : cause;
      log(failureOf(error), null, null);
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  },
  toError: failureOf,
});

/** Asks a question; every event becomes a message, and a newer question cancels this one. */
export const askQuestion = <M>(
  input: AskInput,
  onEvent: (event: AskEvent) => M,
  failed: (reason: AskFailure) => M,
): Command<M> => command(askDriver, input, { onSuccess: onEvent, onFailure: failed });

/** For tests: `@gyral/testing` matches commands to drivers by name. */
export const drivers = { ask: askDriver } as const;
