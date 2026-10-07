/// <reference types="node" />
// `pnpm ask:eval`: asks the questions in test/fixtures/ask-eval.json through the real Ask the
// archive pipeline (src/islands/ask.ts), against the real model (ASK_* in .env) and the full
// build's database and title index (dist/, or DIST_DIR), and scores the answers. Run it after
// changing a prompt; never in the gate (it costs model calls and takes minutes). Each question
// passes when its query's rows (all of them, not just the 200 a page shows) contain every
// expected name (in any cell), reach a row count, or answer with a count at least as big.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';
import type { AskSchema, Message, Resolved } from '../src/domain/ask.js';
import { rankTitles, shardFor, titleOfRow, type TitleRow } from '../src/domain/titles.js';
import { ask, type AskDeps } from '../src/islands/ask.js';
import { plainValue, type QueryResult } from '../src/islands/duckdb.js';

interface Case {
  readonly question: string;
  readonly includes?: readonly string[];
  readonly atLeast?: number;
  readonly countAtLeast?: number;
  /** Names that must be among the first 10 rows the page shows: the best known come first. */
  readonly top10?: readonly string[];
}

const env = new URL('../.env', import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);
const { ASK_ORIGIN, ASK_KEY, ASK_MODEL } = process.env;
if (!ASK_ORIGIN || !ASK_KEY) {
  console.error('ask:eval needs ASK_ORIGIN and ASK_KEY (in .env).');
  process.exit(1);
}
const dist = fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(dist + path, 'utf8'));

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();
await conn.run(`ATTACH '${dist}data/archive.duckdb' AS a (READ_ONLY)`);
await conn.run('USE a');
const articles = Number(
  (await conn.runAndReadAll('SELECT count(*) FROM archive')).getRows()[0]?.[0],
);
if (articles < 100_000) {
  console.error(
    `${dist} holds ${String(articles)} articles: build the full site first (pnpm build).`,
  );
  process.exit(1);
}

const index = read('search-titles/index.json') as { split: string[]; keys: string[] };
const split = new Set(index.split);
const keys = new Set(index.keys);

const chat = async (messages: Message[], schema?: object): Promise<string> => {
  const response = await fetch(new URL('/v1/chat/completions', ASK_ORIGIN), {
    method: 'POST',
    headers: { authorization: `Bearer ${ASK_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ASK_MODEL ?? 'Qwen3.8-27B',
      messages,
      temperature: 0,
      ...(schema === undefined
        ? {}
        : { response_format: { type: 'json_schema', json_schema: schema } }),
    }),
  });
  if (!response.ok) throw new Error(`model: ${String(response.status)}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? '';
};

const deps: AskDeps = {
  chat,
  // The summary isn't scored: one call, not streamed.
  stream: async (messages, onText) => {
    const text = await chat(messages);
    onText(text);
    return text;
  },
  resolve: (names) =>
    Promise.resolve(
      names.map((asked): Resolved => {
        const file = shardFor(asked, split);
        if (file === undefined || !keys.has(file.replace(/\.json$/, '')))
          return { asked, titles: [] };
        const rows = read(`search-titles/${file}`) as TitleRow[];
        const titles = rankTitles(asked, rows)
          .slice(0, 2)
          .map((r) => ({ title: titleOfRow(r), section: r[2] }));
        return { asked, titles };
      }),
    ),
  query: async (sql): Promise<QueryResult> => {
    const started = performance.now();
    const result = await conn.runAndReadAll(sql);
    return {
      columns: result.columnNames(),
      rows: result.getRows().map((row) => row.map(plainValue)),
      truncated: false,
      ms: performance.now() - started,
    };
  },
  schema: () => Promise.resolve(read('data/ask-schema.json') as AskSchema),
};

/** Why an answer misses its case, or undefined when it passes. */
function miss(c: Case, result: QueryResult): string | undefined {
  const cells = new Set(result.rows.flat().map((v) => String(v)));
  const missing = (c.includes ?? []).filter((name) => !cells.has(name));
  if (missing.length > 0) return `missing ${missing.join(', ')}`;
  if (c.atLeast !== undefined && result.rows.length < c.atLeast)
    return `${String(result.rows.length)} rows, wanted at least ${String(c.atLeast)}`;
  if (c.countAtLeast !== undefined) {
    const n = Number(result.rows[0]?.[0]);
    if (!(n >= c.countAtLeast))
      return `count ${String(n)}, wanted at least ${String(c.countAtLeast)}`;
  }
  return undefined;
}

const cases = JSON.parse(
  readFileSync(new URL('../test/fixtures/ask-eval.json', import.meta.url), 'utf8'),
) as Case[];
let passed = 0;
const started = performance.now();
for (const c of cases) {
  const t = performance.now();
  let outcome: string | undefined;
  try {
    const answer = await ask({ question: c.question, history: [] }, deps, () => undefined);
    // Scored on the query's full result: the page shows the first 200 rows, but whether the
    // query is right doesn't depend on where a name falls alphabetically.
    outcome = miss(c, await deps.query(answer.sql));
    const first = new Set(
      answer.result.rows
        .slice(0, 10)
        .flat()
        .map((v) => String(v)),
    );
    const buried = (c.top10 ?? []).filter((name) => !first.has(name));
    if (outcome === undefined && buried.length > 0)
      outcome = `not in the first 10: ${buried.join(', ')}`;
    if (outcome !== undefined) outcome += `\n      ${answer.sql.replace(/\s+/g, ' ')}`;
  } catch (error) {
    outcome = `no answer (${error instanceof Error ? error.message : String(error)})`;
  }
  const seconds = ((performance.now() - t) / 1000).toFixed(1);
  if (outcome === undefined) passed += 1;
  console.log(
    `${outcome === undefined ? 'pass' : 'MISS'}  ${c.question}  (${seconds}s)${outcome === undefined ? '' : `\n      ${outcome}`}`,
  );
}
const minutes = ((performance.now() - started) / 60_000).toFixed(1);
console.log(
  `\nask:eval: ${String(passed)}/${String(cases.length)} answered as expected, in ${minutes} min`,
);
conn.closeSync();
db.closeSync();
