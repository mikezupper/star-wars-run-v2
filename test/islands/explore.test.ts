import { html } from '@gyral/core';
import { renderToString } from '@gyral/ssr';
import { inputsFor, resolve, step } from '@gyral/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drivers, plainValue, type QueryResult } from '../../src/islands/duckdb.js';
import { Explore, type Msg, type State } from '../../src/islands/explore.js';
import { EXPLORE_TEXT } from '../../src/labels.js';

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
});
const result: QueryResult = {
  columns: ['name', 'path', 'height_m'],
  rows: [['Luke Skywalker', '/characters/luke-skywalker/', 1.72]],
  truncated: false,
  ms: 12,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@duckdb/duckdb-wasm');
  vi.resetModules();
});

describe('explore', () => {
  it('starts static, then ready with the first question, without loading the engine', () => {
    const hydrated = step(spec, { _tag: 'Static' }, { _tag: 'Hydrated' } as unknown as Msg);
    expect(hydrated.state).toEqual(live(EXPLORE_TEXT.presets[0].sql));
    // Only ?ask= is read: nothing loads until someone asks or runs a query.
    expect(hydrated.commands.map((c) => c.driver.name)).toEqual(['ask-location']);
  });

  it('runs the SQL; the first run also starts the engine', () => {
    const first = step(spec, live(), { _tag: 'Run' });
    expect(first.state).toMatchObject({ result: { _tag: 'Running', first: true }, started: true });
    expect(inputsFor(first.commands, drivers.duckdb)).toEqual(['SELECT 1']);
    const later = step(spec, live('SELECT 2', true), { _tag: 'Run' });
    expect(later.state).toMatchObject({ result: { _tag: 'Running', first: false } });
  });

  it('runs a preset question, and ignores blank SQL and unknown presets', () => {
    const preset = step(spec, live(), { _tag: 'Preset', index: 1 });
    expect(inputsFor(preset.commands, drivers.duckdb)).toEqual([EXPLORE_TEXT.presets[1].sql]);
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
    const parse = (spec.intent as Record<string, (i: unknown) => unknown>)['Run'];
    const key = (k: string, ctrl: boolean) => ({
      key: k,
      event: { type: 'keydown', ctrlKey: ctrl, metaKey: false, preventDefault: vi.fn() },
    });
    expect(parse?.(key('Enter', true))).toEqual({ _tag: 'Run' });
    expect(parse?.(key('Enter', false))).toBeUndefined();
    expect(parse?.(key('a', true))).toBeUndefined();
    expect(parse?.({ event: { type: 'submit' } })).toEqual({ _tag: 'Run' });
    const other = spec.intent as Record<string, (i: unknown) => unknown>;
    expect(other['Typed']?.({ value: 'SELECT 3' })).toEqual({ _tag: 'Typed', sql: 'SELECT 3' });
    expect(other['Preset']?.({ value: '2' })).toEqual({ _tag: 'Preset', index: 2 });
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
});

describe('DuckDB driver', () => {
  it('turns DuckDB values into plain ones', () => {
    expect(plainValue(5n)).toBe(5);
    expect(plainValue(2n ** 70n)).toBe((2n ** 70n).toString());
    expect(plainValue(undefined)).toBeNull();
    expect(plainValue({ a: 1 })).toBe('{"a":1}');
    expect(plainValue(true)).toBe(true);
  });

  it('starts the engine once, attaches the archive read-only and returns rows', async () => {
    const queries: string[] = [];
    const registerFileURL = vi.fn(() => Promise.resolve());
    const instantiate = vi.fn(() => Promise.resolve());
    const conn = {
      query: (sql: string) => {
        queries.push(sql);
        return Promise.resolve({
          schema: { fields: [{ name: 'n' }] },
          numRows: 1,
          toArray: () => [{ toJSON: () => ({ n: 42n }) }],
        });
      },
    };
    vi.doMock('@duckdb/duckdb-wasm', () => ({
      AsyncDuckDB: class {
        instantiate = instantiate;
        registerFileURL = registerFileURL;
        connect = () => Promise.resolve(conn);
      },
      VoidLogger: class {
        readonly stub = true;
      },
      DuckDBDataProtocol: { HTTP: 4 },
    }));
    vi.stubGlobal(
      'Worker',
      class {
        addEventListener = vi.fn();
      },
    );
    vi.stubGlobal('window', { location: { origin: 'https://starwars.run' } });
    const fresh = await import('../../src/islands/duckdb.js');
    const ctx = { signal: new AbortController().signal, emit: () => undefined };
    const answer = await fresh.drivers.duckdb.run('SELECT 42 AS n', ctx);
    await fresh.drivers.duckdb.run('SELECT 1', ctx);
    expect(answer).toMatchObject({ columns: ['n'], rows: [[42]], truncated: false });
    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(registerFileURL).toHaveBeenCalledWith(
      'archive.duckdb',
      'https://starwars.run/data/archive.duckdb',
      4,
      false,
    );
    expect(queries.slice(0, 2)).toEqual([
      "ATTACH 'archive.duckdb' AS archive_db (READ_ONLY)",
      'USE archive_db',
    ]);
  });

  it('fails with a clear message when the engine worker cannot load', async () => {
    vi.doMock('@duckdb/duckdb-wasm', () => ({
      AsyncDuckDB: class {
        instantiate = () => new Promise(() => undefined); // never settles, as in a real failure
      },
      VoidLogger: class {
        readonly stub = true;
      },
      DuckDBDataProtocol: { HTTP: 4 },
    }));
    vi.stubGlobal(
      'Worker',
      class {
        addEventListener(_type: string, listener: () => void) {
          setTimeout(listener, 0);
        }
      },
    );
    vi.stubGlobal('window', { location: { origin: 'https://starwars.run' } });
    const fresh = await import('../../src/islands/duckdb.js');
    await expect(
      fresh.drivers.duckdb.run('SELECT 1', {
        signal: new AbortController().signal,
        emit: () => undefined,
      }),
    ).rejects.toThrow(fresh.ENGINE_UNAVAILABLE);
  });
});
