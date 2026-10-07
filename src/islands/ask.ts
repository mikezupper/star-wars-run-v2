// Ask the archive's driver (swr-ei6): a question in, an answer out, with each step reported as
// it happens. The model is reached through this site's /api/ask route (src/hosting/ask.ts), so
// the browser holds no key; names resolve through the search title index; the SQL runs in
// DuckDB-WASM like every Explore query. The prompts and checks are in src/domain/ask.ts.
import { command, defineDriver, type Command } from '@gyral/core';
import {
  checkSql,
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

/** Why a question got no answer: the model can't be reached, or no query would run. */
export type AskFailure = 'unavailable' | 'unanswerable';

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
      .stream(summaryMessages(question, result.columns, rows, truncated), (text) => {
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

/** The real outside world: the SDK through /api/ask, the title index, DuckDB, the schema. */
function browserDeps(): AskDeps {
  const client = import('openai').then(
    ({ default: OpenAI }) =>
      new OpenAI({
        baseURL: new URL('/api/ask', window.location.origin).href,
        apiKey: 'set-by-the-server', // /api/ask replaces it with the real key
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
      }),
  );
  let schema: Promise<AskSchema> | undefined;
  return {
    chat: async (messages, json) => {
      const response = await (
        await client
      ).chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0,
        ...(json === undefined
          ? {}
          : { response_format: { type: 'json_schema', json_schema: json as never } }),
      });
      return response.choices[0]?.message.content ?? '';
    },
    stream: async (messages, onText) => {
      const stream = await (
        await client
      ).chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0,
        stream: true,
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta.content ?? '';
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

let deps: AskDeps | undefined;

const askDriver = defineDriver<AskInput, AskEvent, AskFailure>({
  name: 'ask',
  concurrency: 'switch',
  run: async (input, { emit }) => {
    deps ??= browserDeps();
    return { _tag: 'Answered', answer: await ask(input, deps, emit) };
  },
  toError: (cause) => (cause instanceof Unavailable ? 'unavailable' : 'unanswerable'),
});

/** Asks a question; every event becomes a message, and a newer question cancels this one. */
export const askQuestion = <M>(
  input: AskInput,
  onEvent: (event: AskEvent) => M,
  failed: (reason: AskFailure) => M,
): Command<M> => command(askDriver, input, { onSuccess: onEvent, onFailure: failed });

/** For tests: `@gyral/testing` matches commands to drivers by name. */
export const drivers = { ask: askDriver } as const;
