import { html } from '@gyral/core';
import { renderToString } from '@gyral/ssr';
import { inputsFor, parse, resolve, step } from '@gyral/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult } from '../../src/domain/query.js';
import { drivers, QUERY_UNAVAILABLE } from '../../src/islands/api.js';
import { Explore, type State } from '../../src/islands/explore.js';
import { ASK_TEXT, EXPLORE_TEXT } from '../../src/labels.js';

const spec = Explore.spec;
const live = (sql = 'SELECT 1', started = false): Extract<State, { _tag: 'Live' }> => ({
  _tag: 'Live',
  sql,
  result: { _tag: 'Idle' },
  started,
  question: '',
  ask: { _tag: 'Idle' },
  history: [],
  advanced: false,
  examplesOpen: true,
});
const result: QueryResult = {
  columns: ['name', 'path', 'height_m'],
  rows: [['Luke Skywalker', '/characters/luke-skywalker/', 1.72]],
  truncated: false,
  ms: 12,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('explore', () => {
  it('starts static, then ready with the first question, without loading the engine', () => {
    const hydrated = step(spec, { _tag: 'Static' }, { _tag: 'Hydrated', serverRendered: true });
    expect(hydrated.state).toEqual(live(EXPLORE_TEXT.presets[0].sql));
    // Only ?ask= is read: nothing loads until someone asks or runs a query.
    expect(hydrated.commands.map((c) => c.driver.name)).toEqual(['ask-location']);
  });

  it('runs the SQL; the first run also starts the engine', () => {
    const first = step(spec, live(), { _tag: 'Run' });
    expect(first.state).toMatchObject({ result: { _tag: 'Running', first: true }, started: true });
    expect(inputsFor(first.commands, drivers.query)).toEqual(['SELECT 1']);
    const later = step(spec, live('SELECT 2', true), { _tag: 'Run' });
    expect(later.state).toMatchObject({ result: { _tag: 'Running', first: false } });
  });

  it('runs a preset question, and ignores blank SQL and unknown presets', () => {
    const preset = step(spec, live(), { _tag: 'Preset', index: 1 });
    expect(inputsFor(preset.commands, drivers.query)).toEqual([EXPLORE_TEXT.presets[1].sql]);
    expect(step(spec, live('  '), { _tag: 'Run' }).commands).toEqual([]);
    expect(step(spec, live(), { _tag: 'Preset', index: 99 }).commands).toEqual([]);
  });

  it('shows results or the failure for the current SQL, ignoring late ones', () => {
    const running = step(spec, live('SELECT 1'), { _tag: 'Run' });
    const command = running.commands[0];
    if (command === undefined) throw new Error('expected a query');
    const done = resolve(command, result);
    if (done === undefined) throw new Error('expected a message');
    expect(step(spec, running.state, done).state).toMatchObject({
      result: { _tag: 'Done', result },
    });
    expect(step(spec, live('SELECT 2'), { _tag: 'Done', sql: 'SELECT 1', result }).state).toEqual(
      live('SELECT 2'),
    );
    expect(step(spec, live('x'), { _tag: 'Failed', sql: 'x', reason: 'bad' }).state).toMatchObject({
      result: { _tag: 'Failed', reason: 'bad' },
    });
    expect(step(spec, live('x'), { _tag: 'Typed', sql: 'y' }).state).toMatchObject({ sql: 'y' });
    expect(step(spec, { _tag: 'Static' }, { _tag: 'Typed', sql: 'y' }).state).toEqual({
      _tag: 'Static',
    });
  });

  it('runs on Ctrl+Enter and the button, not on other keys', () => {
    const run = (input: Parameters<typeof parse>[2]) =>
      parse(Explore, 'Run', input, { state: live() });
    const key = (k: string, ctrl: boolean) => ({
      key: k,
      event: Object.assign(new Event('keydown', { cancelable: true }), {
        ctrlKey: ctrl,
        metaKey: false,
      }),
    });
    expect(run(key('Enter', true))).toEqual({ _tag: 'Run' });
    expect(run(key('Enter', false))).toBeUndefined();
    expect(run(key('a', true))).toBeUndefined();
    expect(run({ event: new Event('submit') })).toEqual({ _tag: 'Run' });
    expect(parse(Explore, 'Typed', { value: 'SELECT 3' }, { state: live() })).toEqual({
      _tag: 'Typed',
      sql: 'SELECT 3',
    });
    expect(parse(Explore, 'Preset', { value: '2' }, { state: live() })).toEqual({
      _tag: 'Preset',
      index: 2,
    });
    expect(parse(Explore, 'ExamplesToggled', { newState: 'open' }, { state: live() })).toEqual({
      _tag: 'ExamplesToggled',
      open: true,
    });
    expect(parse(Explore, 'ExamplesToggled', { newState: 'closed' }, { state: live() })).toEqual({
      _tag: 'ExamplesToggled',
      open: false,
    });
    expect(parse(Explore, 'ExamplesToggled', {}, { state: live() })).toBeUndefined();
  });
});

describe('explore view', () => {
  const names = Object.fromEntries(['Typed', 'Run', 'Preset', 'Done', 'Failed'].map((n) => [n, n]));
  const view = async (state: State) =>
    (await renderToString(spec.view(state, names as never, { props: {} } as never))).replace(
      /<!--[^>]*-->|<\?>/g,
      '',
    );

  it('renders the no-JavaScript fallback on the server', async () => {
    const out = await renderToString(html`<swr-explore></swr-explore>`);
    expect(out).toContain('href="/characters/"');
  });

  it('shows status for each stage, and results with names linked to their pages', async () => {
    expect(await view(live())).toContain(EXPLORE_TEXT.runHint);
    expect(await view({ ...live(), result: { _tag: 'Running', first: true } })).toContain(
      EXPLORE_TEXT.starting,
    );
    expect(await view({ ...live(), result: { _tag: 'Running', first: false } })).toContain(
      EXPLORE_TEXT.running,
    );
    expect(await view({ ...live(), result: { _tag: 'Failed', reason: 'oops' } })).toContain('oops');
    const done = await view({ ...live(), result: { _tag: 'Done', result } });
    expect(done).toContain('<a href="/characters/luke-skywalker/">Luke Skywalker</a>');
    expect(done).not.toContain('<th scope="col">path</th>');
    expect(done).toContain('1.72');
    const nulls = await view({
      ...live(),
      result: {
        _tag: 'Done',
        result: { columns: ['n'], rows: [[null]], truncated: true, ms: 0.2 },
      },
    });
    expect(nulls).toContain('—');
    expect(nulls).toContain('showing the first 500');
  });

  it('shows progress before any event, and puts results ahead of collapsed examples', async () => {
    const started = step(spec, live(), { _tag: 'Arrived', question: 'Who is Luke?' }).state;
    const pending = await view(started);
    expect(pending).toContain('aria-disabled="true"');
    expect(pending).toContain(ASK_TEXT.busy);
    expect(pending).toContain(
      `<p id="ask-status" role="status" aria-live="polite" aria-atomic="true">`,
    );
    expect(pending.indexOf(ASK_TEXT.reading)).toBeLessThan(pending.indexOf('class="examples"'));
    expect(pending).toContain('<details class="examples"');
    expect(pending).not.toMatch(/<details class="examples"[^>]*\bopen\b/);

    const answer = {
      question: 'Who is Luke?',
      looksFor: 'Luke',
      sql: 'SELECT name, path FROM archive',
      resolved: [],
      result,
      summary: 'Luke is here.',
    };
    const answered = await view(
      step(spec, started, { _tag: 'Asked', event: { _tag: 'Answered', answer } }).state,
    );
    expect(answered).toContain('<h3>Answer</h3>');
    expect(answered).toContain(ASK_TEXT.results(1, false));
    expect(answered.indexOf('<table>')).toBeLessThan(answered.indexOf('class="examples"'));

    const empty = await view({
      ...live(),
      ask: { _tag: 'Answered', steps: [], answer: { ...answer, result: { ...result, rows: [] } } },
    });
    expect(empty).toContain(ASK_TEXT.results(0, false));
    expect(empty).not.toContain('<table>');
  });

  it('keeps detailed steps out of the live region and places Retry beside failures', async () => {
    const started = step(spec, live(), { _tag: 'Arrived', question: 'Who is Luke?' }).state;
    const searching = step(spec, started, {
      _tag: 'Asked',
      event: { _tag: 'Searching', looksFor: 'Luke' },
    }).state;
    const out = await view(searching);
    const status = out.match(/<p id="ask-status"[^>]*>(.*?)<\/p>/s)?.[1] ?? '';
    expect(status).toContain(ASK_TEXT.searchingArchive);
    expect(status).not.toContain(ASK_TEXT.reading);
    expect(out).toContain('<details class="answer-steps">');
    expect(out).toContain(ASK_TEXT.searching('Luke'));
    const failed = await view(step(spec, searching, { _tag: 'AskFailed', reason: 'slow' }).state);
    expect(failed).toContain(ASK_TEXT.slow);
    expect(failed).toContain('>Retry</button>');
    expect(failed.indexOf(ASK_TEXT.slow)).toBeLessThan(failed.indexOf('class="examples"'));
  });
});

describe('the API drivers', () => {
  const ctx = (emit: (e: unknown) => void = () => undefined) => ({
    signal: new AbortController().signal,
    emit,
  });
  const sse = (...events: unknown[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  const answer = {
    question: 'q',
    looksFor: 'x',
    sql: 'SELECT 1',
    resolved: [],
    result: { columns: ['n'], rows: [[1]], truncated: false, ms: 1 },
    summary: 'One.',
  };

  it('post SQL to /api/query and return its rows, or its error', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(result)));
    vi.stubGlobal('fetch', fetch);
    expect(await drivers.query.run('SELECT 1', ctx())).toEqual(result);
    expect(fetch).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({ method: 'POST', body: '{"sql":"SELECT 1"}' }),
    );
    vi.stubGlobal('fetch', () =>
      Promise.resolve(Response.json({ error: 'Binder Error: no' }, { status: 400 })),
    );
    await expect(drivers.query.run('SELECT nope', ctx())).rejects.toThrow('Binder Error: no');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await expect(drivers.query.run('SELECT 1', ctx())).rejects.toThrow(QUERY_UNAVAILABLE);
  });

  it('read Ask\u2019s steps from the stream and finish with the answer', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        sse(
          { _tag: 'Reading' },
          { _tag: 'Found', count: 1, truncated: false },
          { _tag: 'Answered', answer },
        ),
      ),
    );
    const steps: unknown[] = [];
    const done = await drivers.ask.run(
      { question: 'q', history: [] },
      ctx((e) => steps.push(e)),
    );
    expect(steps).toEqual([{ _tag: 'Reading' }, { _tag: 'Found', count: 1, truncated: false }]);
    expect(done).toEqual({ _tag: 'Answered', answer });
  });

  it('give the server\u2019s reason when there\u2019s no answer, and unavailable when it can\u2019t say', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(sse({ _tag: 'Reading' }, { _tag: 'Failed', reason: 'slow' })),
    );
    const slow = await Promise.resolve(
      drivers.ask.run({ question: 'q', history: [] }, ctx()),
    ).catch((e: unknown) => e);
    expect(drivers.ask.toError?.(slow)).toBe('slow');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 502 })));
    const down = await Promise.resolve(
      drivers.ask.run({ question: 'q', history: [] }, ctx()),
    ).catch((e: unknown) => e);
    expect(drivers.ask.toError?.(down)).toBe('unavailable');
    vi.stubGlobal('fetch', () => Promise.resolve(sse({ _tag: 'Reading' })));
    const cut = await Promise.resolve(drivers.ask.run({ question: 'q', history: [] }, ctx())).catch(
      (e: unknown) => e,
    );
    expect(drivers.ask.toError?.(cut)).toBe('unavailable');
  });
});
