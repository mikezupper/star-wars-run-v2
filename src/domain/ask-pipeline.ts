// Ask the archive's pipeline (ADR 0009, 0010): a question in, an answer out, each step reported
// as it happens. It runs on the server (src/server/ask.ts); the outside world (the model, the
// title index, the database, the schema) comes in as functions, so tests and pnpm ask:eval can
// give it their own. The prompts and checks are in ask.ts.
import {
  asPlan,
  asQuery,
  checkSql,
  MAX_ROWS,
  planMessages,
  PLAN_SCHEMA,
  QUERY_SCHEMA,
  sqlMessages,
  summaryMessages,
  type AskSchema,
  type Message,
  type Resolved,
  type Turn,
} from './ask.js';
import type { QueryResult } from './query.js';

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

/** What a question reports: each step and the summary as it's written, then the answer, or
 * why there isn't one. The API streams these to the browser (ADR 0010). */
export type AskEvent =
  | { readonly _tag: 'Reading' }
  | { readonly _tag: 'Matched'; readonly resolved: readonly Resolved[] }
  | { readonly _tag: 'Searching'; readonly looksFor: string }
  | { readonly _tag: 'Found'; readonly count: number; readonly truncated: boolean }
  | { readonly _tag: 'Writing'; readonly text: string }
  | { readonly _tag: 'Answered'; readonly answer: Answer }
  | { readonly _tag: 'Failed'; readonly reason: AskFailure };

/** The events before the answer: what the pipeline reports as it goes. */
export type Step = Exclude<AskEvent, { _tag: 'Answered' } | { _tag: 'Failed' }>;

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
export class Unavailable extends Error {}

/** The steps, emitted as they happen; resolves with the answer. */
export async function ask(
  input: AskInput,
  deps: AskDeps,
  emit: (event: Step) => void,
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
