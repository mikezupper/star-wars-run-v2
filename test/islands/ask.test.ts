import { inputsFor, step } from '@gyral/testing';
import { describe, expect, it, vi } from 'vitest';
import { MAX_ROWS } from '../../src/domain/ask.js';
import { ask, drivers, type AskDeps, type AskEvent } from '../../src/islands/ask.js';
import type { QueryResult } from '../../src/islands/duckdb.js';
import { Explore, type State } from '../../src/islands/explore.js';
import { ASK_TEXT } from '../../src/labels.js';

const rows = (n: number): QueryResult => ({
  columns: ['name', 'path', 'era'],
  rows: Array.from({ length: n }, (_, i) => [
    `Wookiee ${String(i)}`,
    `/characters/w${String(i)}/`,
    'canon',
  ]),
  truncated: false,
  ms: 5,
});

/** Fake deps: the model answers each step from a script, in order. */
function fakes(replies: string[], query: (sql: string) => Promise<QueryResult>): AskDeps {
  const queue = [...replies];
  return {
    chat: vi.fn<AskDeps['chat']>(() => Promise.resolve(queue.shift() ?? '')),
    stream: vi.fn<AskDeps['stream']>((_m, onText) => {
      onText('Five Wookiees');
      onText('Five Wookiees fought for the Rebel Alliance.');
      return Promise.resolve('Five Wookiees fought for the Rebel Alliance.');
    }),
    resolve: vi.fn((names: readonly string[]) =>
      Promise.resolve(
        names.map((asked) => ({
          asked,
          titles: [{ title: 'Wookiee', section: 'species' as const }],
        })),
      ),
    ),
    query: vi.fn(query),
    schema: () => Promise.resolve({ kinds: {}, fields: {} }),
  };
}

const plan = '{"names":["Wookiees"]}';
const query = (sql: string) => JSON.stringify({ sql, looksFor: 'Wookiees in the Rebel Alliance' });

describe('the ask pipeline', () => {
  it('plans, matches names, queries, summarizes, reporting each step', async () => {
    const deps = fakes([plan, query('SELECT a.name, a.path, a.era FROM archive a')], () =>
      Promise.resolve(rows(5)),
    );
    const events: AskEvent[] = [];
    const answer = await ask({ question: 'Which Wookiees?', history: [] }, deps, (e) =>
      events.push(e),
    );
    expect(events.map((e) => e._tag)).toEqual([
      'Reading',
      'Matched',
      'Searching',
      'Found',
      'Writing',
      'Writing',
    ]);
    expect(answer).toMatchObject({
      question: 'Which Wookiees?',
      looksFor: 'Wookiees in the Rebel Alliance',
      sql: 'SELECT a.name, a.path, a.era FROM archive a',
      summary: 'Five Wookiees fought for the Rebel Alliance.',
    });
    expect(answer.result.rows).toHaveLength(5);
    expect(deps.query).toHaveBeenCalledWith(
      `SELECT * FROM (SELECT a.name, a.path, a.era FROM archive a) AS answer LIMIT ${String(MAX_ROWS + 1)}`,
    );
  });

  it('retries with the error when a query fails or breaks the rules, then gives up', async () => {
    const failing = fakes(
      [plan, query('DROP TABLE archive'), query('SELECT nope'), query('SELECT 1')],
      (sql) =>
        sql.includes('nope') ? Promise.reject(new Error('Binder Error')) : Promise.resolve(rows(1)),
    );
    const answer = await ask({ question: 'q', history: [] }, failing, () => undefined);
    expect(answer.sql).toBe('SELECT 1');
    const third = vi.mocked(failing.chat).mock.calls[3]?.[0] ?? [];
    expect(third.at(-1)?.content).toContain('Binder Error');

    const hopeless = fakes([plan, 'not json', query('DELETE'), query('UPDATE')], () =>
      Promise.resolve(rows(1)),
    );
    await expect(ask({ question: 'q', history: [] }, hopeless, () => undefined)).rejects.toThrow(
      'unanswerable',
    );
  });

  it('says how many there were past the cap, and answers without a summary if that fails', async () => {
    const deps = {
      ...fakes([plan, query('SELECT 1')], () => Promise.resolve(rows(MAX_ROWS + 1))),
      stream: () => Promise.reject(new Error('stream cut')),
    };
    const events: AskEvent[] = [];
    const answer = await ask({ question: 'q', history: [] }, deps, (e) => events.push(e));
    expect(events).toContainEqual({ _tag: 'Found', count: MAX_ROWS, truncated: true });
    expect(answer.result).toMatchObject({ truncated: true });
    expect(answer.result.rows).toHaveLength(MAX_ROWS);
    expect(answer.summary).toBe('');
  });

  it('reports an unreachable model as unavailable', async () => {
    const deps = {
      ...fakes([], () => Promise.resolve(rows(1))),
      chat: () => Promise.reject(new Error('503')),
    };
    const error = await ask({ question: 'q', history: [] }, deps, () => undefined).catch(
      (e: unknown) => e,
    );
    expect(drivers.ask.toError?.(error)).toBe('unavailable');
    expect(drivers.ask.toError?.(new Error('unanswerable'))).toBe('unanswerable');
    expect(ASK_TEXT.slow).toMatch(/too long/);
  });
});

describe('asking from Explore', () => {
  const spec = Explore.spec;
  const live: Extract<State, { _tag: 'Live' }> = {
    _tag: 'Live',
    sql: 'SELECT 1',
    result: { _tag: 'Idle' },
    started: false,
    question: '',
    ask: { _tag: 'Idle' },
    history: [],
    advanced: false,
  };
  const answer = {
    question: 'Which Wookiees?',
    looksFor: 'Wookiees',
    sql: 'SELECT 2',
    resolved: [],
    result: rows(2),
    summary: 'Two.',
  };

  it('asks what was typed, an example, or ?ask= on arrival; never a blank question', () => {
    const typed = step(spec, live, { _tag: 'AskTyped', text: '  Which Wookiees?  ' });
    const asked = step(spec, typed.state, { _tag: 'Ask' });
    expect(inputsFor(asked.commands, drivers.ask)).toEqual([
      { question: 'Which Wookiees?', history: [] },
    ]);
    expect(asked.state).toMatchObject({ ask: { _tag: 'Asking', steps: [] } });
    const example = step(spec, live, { _tag: 'Example', index: 1 });
    expect(inputsFor(example.commands, drivers.ask)[0]).toMatchObject({
      question: ASK_TEXT.examples[1],
    });
    const arrived = step(spec, live, { _tag: 'Arrived', question: 'Who is Yoda?' });
    expect(inputsFor(arrived.commands, drivers.ask)[0]).toMatchObject({ question: 'Who is Yoda?' });
    expect(step(spec, live, { _tag: 'Ask' }).commands).toEqual([]);
  });

  it('shows each step, the summary as it’s written, then the answer, and remembers it', () => {
    let s: State = step(spec, live, { _tag: 'Arrived', question: 'Which Wookiees?' }).state;
    for (const event of [
      { _tag: 'Reading' },
      {
        _tag: 'Matched',
        resolved: [
          { asked: 'Wookiees', titles: [{ title: 'Wookiee', section: 'species' }] },
          { asked: 'Zzz', titles: [] },
        ],
      },
      { _tag: 'Searching', looksFor: 'Wookiees' },
      { _tag: 'Found', count: 2, truncated: false },
      { _tag: 'Writing', text: 'Tw' },
      { _tag: 'Writing', text: 'Two.' },
    ] as AskEvent[]) {
      s = step(spec, s, { _tag: 'Asked', event }).state;
    }
    expect(s).toMatchObject({
      ask: {
        _tag: 'Asking',
        summary: 'Two.',
        steps: [
          ASK_TEXT.reading,
          ASK_TEXT.matched([ASK_TEXT.match('Wookiees', 'Wookiee'), ASK_TEXT.noMatch('Zzz')]),
          ASK_TEXT.searching('Wookiees'),
          ASK_TEXT.found(2, false),
          ASK_TEXT.writing,
        ],
      },
    });
    const done = step(spec, s, { _tag: 'Asked', event: { _tag: 'Answered', answer } }).state;
    expect(done).toMatchObject({
      ask: { _tag: 'Answered', answer },
      question: '',
      history: [{ question: 'Which Wookiees?', sql: 'SELECT 2' }],
    });
    const followUp = step(spec, { ...done, question: 'only canon' } as State, { _tag: 'Ask' });
    expect(inputsFor(followUp.commands, drivers.ask)[0]).toMatchObject({
      history: [{ sql: 'SELECT 2' }],
    });
  });

  it('opens the answer’s query in the SQL editor, and starts over', () => {
    const answered: State = {
      ...live,
      ask: { _tag: 'Answered', steps: [], answer },
      history: [{ question: 'q', sql: 'SELECT 2' }],
    };
    expect(step(spec, answered, { _tag: 'EditSql' }).state).toMatchObject({
      sql: 'SELECT 2',
      advanced: true,
    });
    expect(step(spec, answered, { _tag: 'StartOver' }).state).toMatchObject({
      ask: { _tag: 'Idle' },
      history: [],
    });
    expect(step(spec, live, { _tag: 'EditSql' }).state).toBe(live);
  });

  it('says why when there’s no answer, and ignores events once it has one', () => {
    const asking = step(spec, live, { _tag: 'Arrived', question: 'q' }).state;
    expect(step(spec, asking, { _tag: 'AskFailed', reason: 'unavailable' }).state).toMatchObject({
      ask: { _tag: 'Failed', reason: 'unavailable' },
    });
    expect(step(spec, live, { _tag: 'Asked', event: { _tag: 'Reading' } }).state).toBe(live);
  });
});
