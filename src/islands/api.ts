// The Explore page's drivers (ADR 0010): everything it asks goes to this site's API. Ask posts a
// question and reads the steps as server-sent events; the SQL editor posts a query and gets rows
// back as JSON. No database, no model and no key in the browser.
import { command, defineDriver, type Command } from '@gyral/core';
import { readSse, type Turn } from '../domain/ask.js';
import type { AskEvent, AskFailure, AskInput, Step } from '../domain/ask-pipeline.js';
import type { QueryResult } from '../domain/query.js';

/** Thrown with why a question got no answer; the reason comes from the server's last event. */
class NoAnswer extends Error {
  constructor(readonly reason: AskFailure) {
    super(reason);
  }
}

const post = (path: string, body: unknown, signal: AbortSignal): Promise<Response> =>
  fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

const askDriver = defineDriver<AskInput, AskEvent, AskFailure>({
  name: 'ask',
  concurrency: 'switch',
  run: async (input, { emit, signal }) => {
    const response = await post('/api/ask', input, signal);
    if (!response.ok || response.body === null) throw new NoAnswer('unavailable');
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { data, rest } = readSse(buffer + value);
      buffer = rest;
      for (const payload of data) {
        const event = JSON.parse(payload) as AskEvent;
        if (event._tag === 'Answered') return event;
        if (event._tag === 'Failed') throw new NoAnswer(event.reason);
        emit(event satisfies Step);
      }
    }
    throw new NoAnswer('unavailable'); // the stream ended without an answer
  },
  toError: (cause) => (cause instanceof NoAnswer ? cause.reason : 'unavailable'),
});

/** Asks a question; every event becomes a message, and a newer question cancels this one. */
export const askQuestion = <M>(
  input: { readonly question: string; readonly history: readonly Turn[] },
  onEvent: (event: AskEvent) => M,
  failed: (reason: AskFailure) => M,
): Command<M> => command(askDriver, input, { onSuccess: onEvent, onFailure: failed });

/** Shown when the API can't be reached at all (offline, or down). */
export const QUERY_UNAVAILABLE =
  'the archive could not be reached. Check your connection and try again.';

const queryDriver = defineDriver<string, QueryResult, string>({
  name: 'query',
  concurrency: 'switch',
  run: async (sql, { signal }) => {
    const response = await post('/api/query', { sql }, signal).catch(() => {
      throw new Error(QUERY_UNAVAILABLE);
    });
    const body = (await response.json().catch(() => ({ error: QUERY_UNAVAILABLE }))) as
      QueryResult | { readonly error: string };
    if ('error' in body) throw new Error(body.error);
    return body;
  },
  toError: (cause) => (cause instanceof Error ? cause.message : String(cause)),
});

/** Runs SQL on the server; a newer query cancels the one in flight. */
export const runQuery = <M>(
  sql: string,
  done: (result: QueryResult) => M,
  failed: (reason: string) => M,
): Command<M> => command(queryDriver, sql, { onSuccess: done, onFailure: failed });

/** For tests: `@gyral/testing` matches commands to drivers by name. */
export const drivers = { ask: askDriver, query: queryDriver } as const;
