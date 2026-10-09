/// <reference types="node" />
// `pnpm ask:eval`: asks the questions in test/fixtures/ask-eval.json through the real Ask the
// archive pipeline (src/domain/ask-pipeline.ts) with the API's own server modules, against the
// real model (ASK_* in .env) and the full build's data (dist/ and dist-api/, or DIST_DIR), and
// scores the answers. Run it after
// changing a prompt; never in the gate (it costs model calls and takes minutes). Each question
// passes when its query's rows (all of them, not just the 200 a page shows) contain every
// expected name (in any cell), reach a row count, or answer with a count at least as big.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AskSchema } from '../src/domain/ask.js';
import { MAX_ROWS } from '../src/domain/ask.js';
import { ask, type AskDeps } from '../src/domain/ask-pipeline.js';
import type { QueryResult } from '../src/domain/query.js';
import { openArchive } from '../src/server/archive.js';
import { modelClient } from '../src/server/model.js';
import { openPages } from '../src/server/pages.js';

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
const dist = process.env['DIST_DIR'] ?? 'dist';
const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const archive = await openArchive(at(`${dist}-api/archive.duckdb`));
const articles = Number((await archive.query('SELECT count(*) FROM archive', 1)).rows[0]?.[0]);
if (articles < 100_000) {
  console.error(
    `${dist}-api holds ${String(articles)} articles: build the full site first (pnpm build).`,
  );
  process.exit(1);
}
const model = modelClient({ origin: ASK_ORIGIN, key: ASK_KEY, model: ASK_MODEL ?? 'Qwen3.8-27B' });
const schema = JSON.parse(readFileSync(at(`${dist}-api/ask-schema.json`), 'utf8')) as AskSchema;
const deps: AskDeps = {
  chat: model.chat,
  // The summary isn't scored: one call, not streamed.
  stream: async (messages, onText) => {
    const text = await model.chat(messages);
    onText(text);
    return text;
  },
  resolve: openPages(at(`${dist}-api/pages.sqlite`)).search.resolve,
  query: (sql) => archive.query(sql, MAX_ROWS + 1),
  schema: () => Promise.resolve(schema),
};
/** The query uncapped: whether it's right doesn't depend on the page's 200 rows. */
const uncapped = (sql: string): Promise<QueryResult> => archive.query(sql, 1_000_000);

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
    outcome = miss(c, await uncapped(answer.sql));
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
archive.close();
