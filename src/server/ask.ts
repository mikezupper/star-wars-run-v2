// Ask the archive on the server (ADR 0010): runs the pipeline (src/domain/ask-pipeline.ts) with
// the real outside world (the model with the server's key, the title index, the locked-down
// archive) and records how each question went in the question log. A question stops after
// TIME_LIMIT_MS; a visitor leaving stops it too.
import type { AskSchema } from '../domain/ask.js';
import { MAX_ROWS } from '../domain/ask.js';
import {
  ask,
  Unavailable,
  type AskEvent,
  type AskFailure,
  type AskInput,
} from '../domain/ask-pipeline.js';
import type { Archive } from './archive.js';
import { modelClient, type ModelSettings } from './model.js';
import type { Outcome, QuestionLog } from './questions.js';
import type { Search } from './search.js';

/** A question that takes longer than this is stopped, with its own message. */
export const TIME_LIMIT_MS = 45_000;

export interface AskContext {
  readonly archive: Archive;
  /** Ask's names to the articles they mean: search's name lookup (src/server/search.ts). */
  readonly resolve: Search['resolve'];
  /** Search itself, for /api/search; unset when the data has no search index. */
  readonly search?: Search['search'];
  readonly schema: () => Promise<AskSchema>;
  readonly model: ModelSettings;
  readonly log: QuestionLog | undefined;
  /** Where a failure nobody else sees goes (a log row that wouldn't write): the console. */
  readonly report?: (problem: string, cause: unknown) => void;
}

const SLOW = 'slow';

/** Answers one question, reporting each event; resolves when the last one has been sent. */
export async function answerQuestion(
  input: AskInput,
  context: AskContext,
  send: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const stop = new AbortController();
  const onAbort = () => {
    stop.abort();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    stop.abort(SLOW);
  }, TIME_LIMIT_MS);
  const started = performance.now();
  let names: string[] = [];
  const record = (outcome: Outcome, sql: string | null, rows: number | null) => {
    // A question the visitor left isn't logged: nobody waited for it.
    if (signal?.aborted === true || context.log === undefined) return;
    void context.log
      .add({
        question: input.question,
        outcome,
        names,
        sql,
        rows,
        seconds: (performance.now() - started) / 1000,
        model: context.model.model,
        followUp: input.history.length > 0,
      })
      .catch((cause: unknown) => context.report?.('question log', cause));
  };
  const model = modelClient(context.model, stop.signal);
  try {
    const answer = await ask(
      input,
      {
        chat: model.chat,
        stream: model.stream,
        resolve: context.resolve,
        query: (sql) => context.archive.query(sql, MAX_ROWS + 1),
        schema: context.schema,
      },
      (event) => {
        if (event._tag === 'Matched') names = event.resolved.map((r) => r.asked);
        send(event);
      },
    );
    const rows = answer.result.rows.length;
    record(rows === 0 ? 'empty' : 'answered', answer.sql, rows);
    send({ _tag: 'Answered', answer });
  } catch (cause) {
    const reason: AskFailure =
      stop.signal.reason === SLOW
        ? 'slow'
        : cause instanceof Unavailable
          ? 'unavailable'
          : 'unanswerable';
    record(reason, null, null);
    // The visitor sees "isn't answering"; the server's log says why (swr-ddp).
    if (reason === 'unavailable' && signal?.aborted !== true) {
      context.report?.('ask: the model is unavailable', cause);
    }
    send({ _tag: 'Failed', reason });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
