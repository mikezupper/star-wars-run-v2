import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDatabase } from '../../scripts/build-database.js';
import { askSchema } from '../../src/domain/ask.js';
import type { AskEvent } from '../../src/domain/ask-pipeline.js';
import { exploreRows } from '../../src/domain/rows.js';
import { inboundLinks, titleShards } from '../../src/domain/titles.js';
import { ASK_PATH, createApi, parseAsk, QUERY_PATH } from '../../src/server/api.js';
import { openArchive, QueryTimeout, type Archive } from '../../src/server/archive.js';
import { openQuestionLog, type QuestionLog } from '../../src/server/questions.js';
import { titleResolver } from '../../src/server/titles.js';
import { fixtureSiteData } from '../fixtures/archive.js';

const { archive: site, articles } = fixtureSiteData();
let dir: string;
let archive: Archive;
let log: QuestionLog;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swr-api-'));
  const rows = exploreRows(site, articles);
  await buildDatabase(dir, rows);
  await writeFile(
    join(dir, 'ask-schema.json'),
    JSON.stringify(askSchema(rows.archive, rows.facts)),
  );
  const { files, split } = titleShards(site, inboundLinks(articles.values()));
  const titles = join(dir, 'search-titles');
  await mkdir(titles, { recursive: true });
  await writeFile(
    join(titles, 'index.json'),
    JSON.stringify({ split, keys: [...files.keys()].map((f) => f.replace(/\.json$/, '')) }),
  );
  for (const [file, shard] of files) await writeFile(join(titles, file), JSON.stringify(shard));
  archive = await openArchive(join(dir, 'archive.duckdb'), 300);
  log = await openQuestionLog(join(dir, 'questions.duckdb'));
});

afterAll(async () => {
  archive.close();
  await log.close();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('the archive, locked down', () => {
  it('answers a query', async () => {
    const r = await archive.query("SELECT name FROM archive WHERE title = 'Tatooine'", 10);
    expect(r.rows).toEqual([['Tatooine']]);
  });

  it.each([
    ['read a file', "SELECT * FROM read_csv('/etc/passwd')"],
    ['read the network', "SELECT * FROM read_csv('https://example.com/x.csv')"],
    ['attach another database', "ATTACH '/tmp/other.duckdb' AS other"],
    ['install an extension', 'INSTALL httpfs'],
    ['load an extension', 'LOAD httpfs'],
    ['write a file', "COPY (SELECT 1) TO '/tmp/out.csv'"],
    ['create a table', 'CREATE TABLE t AS SELECT 1'],
    ['change a row', "UPDATE archive SET name = 'x'"],
    ['unlock the configuration', 'SET enable_external_access = true'],
  ])('refuses to %s', async (_what, sql) => {
    await expect(archive.query(sql, 10)).rejects.toThrow();
  });

  it('stops a query at its time limit, and keeps answering after', async () => {
    await expect(
      archive.query('SELECT count(*) FROM range(100000000000)', 10),
    ).rejects.toBeInstanceOf(QueryTimeout);
    expect((await archive.query('SELECT 1', 10)).rows).toEqual([[1]]);
  });

  it('caps the rows and says so', async () => {
    const r = await archive.query('SELECT * FROM range(5)', 3);
    expect(r.rows).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });
});

describe('the API', () => {
  const api = (questions: QuestionLog = log) =>
    createApi({
      archive,
      resolve: titleResolver(join(dir, 'search-titles')),
      schema: () => Promise.resolve({ kinds: {}, fields: {} }),
      model: { origin: 'https://model.example', key: 'server-key', model: 'test-model' },
      log: questions,
    });
  /** Asks through an API with a log of its own, then reads that log back. */
  const askAndRead = async (question: string) => {
    const file = join(dir, `log-${String(Math.random()).slice(2)}.duckdb`);
    const own = await openQuestionLog(file);
    const steps = await events(await api(own)(post(ASK_PATH, { question, history: [] })));
    await own.close(); // the row is written after the answer is sent

    const db = await DuckDBInstance.create(file);
    const c = await db.connect();
    const logged = (
      await c.runAndReadAll('SELECT question, outcome, names, rows, model FROM questions')
    ).getRowObjectsJson();
    c.closeSync();
    db.closeSync();
    return { steps, logged };
  };
  const post = (path: string, body: unknown) =>
    new Request(`https://starwars.run${path}`, { method: 'POST', body: JSON.stringify(body) });
  const events = async (res: Response): Promise<AskEvent[]> =>
    (await res.text())
      .split('\n\n')
      .filter((e) => e.startsWith('data: '))
      .map((e) => JSON.parse(e.slice(6)) as AskEvent);

  /** A fake model: plan, then the given SQL, then a streamed sentence. Checks the key. */
  const model = (sql: string) =>
    vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer server-key');
      const body = JSON.parse(init?.body as string) as {
        response_format?: { json_schema?: { name?: string } };
        stream?: boolean;
      };
      const step = body.response_format?.json_schema?.name;
      const reply = (content: string) => Response.json({ choices: [{ message: { content } }] });
      if (step === 'plan') return Promise.resolve(reply('{"names":["Tatooine"]}'));
      if (step === 'query')
        return Promise.resolve(reply(JSON.stringify({ sql, looksFor: 'people from Tatooine' })));
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Luke comes from Tatooine.' } }] })}\n\ndata: [DONE]\n\n`,
        ),
      );
    });

  it('runs the SQL editor’s queries, and says why one fails', async () => {
    const ok = await api()(
      post(QUERY_PATH, { sql: "SELECT name FROM archive WHERE section = 'planets' ORDER BY name" }),
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { rows: string[][] }).rows.flat()).toContain('Tatooine');
    const bad = await api()(post(QUERY_PATH, { sql: 'DROP TABLE archive' }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'The query must start with SELECT or WITH.' });
    const escape = await api()(
      post(QUERY_PATH, { sql: "SELECT * FROM read_text('/etc/hostname')" }),
    );
    expect(escape.status).toBe(400);
  });

  it('answers a question as a stream of steps, and logs it', async () => {
    vi.stubGlobal(
      'fetch',
      model(
        "SELECT a.name, a.path, a.era FROM archive a WHERE EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND f.field = 'homeworld' AND f.link = 'Tatooine')",
      ),
    );
    const { steps, logged } = await askAndRead('Who comes from Tatooine?');
    expect(steps.map((e) => e._tag)).toEqual([
      'Reading',
      'Matched',
      'Searching',
      'Found',
      'Writing',
      'Answered',
    ]);
    const last = steps.at(-1);
    expect(last?._tag === 'Answered' && last.answer.result.rows.flat()).toContain('Luke Skywalker');
    expect(last?._tag === 'Answered' && last.answer.summary).toBe('Luke comes from Tatooine.');
    expect(logged).toEqual([
      {
        question: 'Who comes from Tatooine?',
        outcome: 'answered',
        names: ['Tatooine'],
        rows: expect.any(Number) as unknown,
        model: 'test-model',
      },
    ]);
  });

  it('streams a failure with its reason, and logs it', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 503 })));
    const { steps, logged } = await askAndRead('Who comes from Hoth?');
    expect(steps.at(-1)).toEqual({ _tag: 'Failed', reason: 'unavailable' });
    expect(logged).toEqual([
      {
        question: 'Who comes from Hoth?',
        outcome: 'unavailable',
        names: [],
        rows: null,
        model: 'test-model',
      },
    ]);
  });

  it('refuses what isn’t a request it serves', async () => {
    expect((await api()(new Request(`https://starwars.run${ASK_PATH}`))).status).toBe(405);
    expect((await api()(post('/api/other', {}))).status).toBe(404);
    expect(
      (await api()(new Request(`https://starwars.run${ASK_PATH}`, { method: 'POST', body: 'x' })))
        .status,
    ).toBe(400);
    expect((await api()(post(ASK_PATH, { question: 'x'.repeat(70_000) }))).status).toBe(413);
    expect((await api()(post(ASK_PATH, { question: ' ' }))).status).toBe(400);
  });

  it('keeps only the history a follow-up needs', () => {
    const history = Array.from({ length: 9 }, (_, i) => ({
      question: `q${String(i)}`,
      sql: 'SELECT 1',
    }));
    expect(
      parseAsk({ question: 'only canon', history: [...history, { question: 'no sql' }, 'junk'] }),
    ).toEqual({
      question: 'only canon',
      history: history.slice(-4).map((t) => ({ ...t, looksFor: '' })),
    });
  });
});

describe('the question log', () => {
  it('lets go of its file between rows, and waits for a reader to let go', async () => {
    const file = join(dir, 'log-locked.duckdb');
    const own = await openQuestionLog(file);
    const row = {
      question: 'Who is Yoda?',
      outcome: 'answered',
      names: ['Yoda'],
      sql: null,
      rows: 1,
      seconds: 1,
      model: 'm',
      followUp: false,
    } as const;
    await own.add(row);
    // Someone mining the log holds the file; the next row waits for them.
    const reader = await DuckDBInstance.create(file, { access_mode: 'READ_ONLY' });
    const later = own.add({ ...row, question: 'And Dooku?' });
    await new Promise((r) => setTimeout(r, 400));
    reader.closeSync();
    await later;
    await own.close();
    const db = await DuckDBInstance.create(file);
    const c = await db.connect();
    expect(
      (await c.runAndReadAll('SELECT question FROM questions ORDER BY id')).getRows().flat(),
    ).toEqual(['Who is Yoda?', 'And Dooku?']);
    c.closeSync();
    db.closeSync();
  });

  it('writes one row per question, names as a list', async () => {
    const file = join(dir, 'log-test.duckdb');
    const own = await openQuestionLog(file);
    await own.add({
      question: 'Which Wookiees?',
      outcome: 'answered',
      names: ['Wookiees', 'Rebel Alliance'],
      sql: 'SELECT 1',
      rows: 5,
      seconds: 7.43,
      model: 'm',
      followUp: true,
    });
    await own.close();
    const db = await DuckDBInstance.create(file);
    const c = await db.connect();
    const rows: unknown = (
      await c.runAndReadAll(
        'SELECT question, outcome, names, rows, seconds, follow_up FROM questions',
      )
    ).getRowObjectsJson();
    expect(rows).toEqual([
      {
        question: 'Which Wookiees?',
        outcome: 'answered',
        names: ['Wookiees', 'Rebel Alliance'],
        rows: 5,
        seconds: 7.4,
        follow_up: true,
      },
    ]);
    c.closeSync();
    db.closeSync();
  });
});
