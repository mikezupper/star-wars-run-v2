// The Explore page's query driver (swr-7f1.7): DuckDB-WASM, loaded the first time a query runs,
// attaching the archive's database (written by scripts/build-database.ts) read-only and reading
// only the blocks a query needs, over HTTP range requests. Everything is self-hosted under
// /duckdb/ and /data/: the CSP allows only this origin.
import { command, defineDriver, type Command } from '@gyral/core';

/** One query's answer, ready for the view: column names and rows of plain values. */
export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
  /** True when there were more rows than MAX_ROWS. */
  readonly truncated: boolean;
  readonly ms: number;
}

export const MAX_ROWS = 500;

/** Shown when the engine's worker or WebAssembly can't be loaded (offline, blocked, missing). */
export const ENGINE_UNAVAILABLE =
  'the query engine could not be loaded. Check your connection and try again.';

/** The engine and tables, as loaded paths; `origin` makes them absolute for DuckDB's fetches. */
export const ENGINE = {
  wasm: '/duckdb/duckdb-eh.wasm',
  worker: '/duckdb/duckdb-browser-eh.worker.js',
  database: '/data/archive.duckdb',
} as const;

interface Connection {
  query(sql: string): Promise<{
    readonly schema: { readonly fields: readonly { readonly name: string }[] };
    readonly numRows: number;
    toArray(): readonly { toJSON(): Record<string, unknown> }[];
  }>;
}

/** Plain JSON values: DuckDB returns counts as BigInt and dates as objects. */
export const plainValue = (v: unknown): string | number | boolean | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
};

let connected: Promise<Connection> | undefined;

/** Starts DuckDB once and attaches the archive, so queries name `archive` and `facts` directly. */
const connect = (origin: string): Promise<Connection> => {
  connected ??= (async () => {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const worker = new Worker(ENGINE.worker);
    // DuckDB doesn't report a worker that fails to load: without this, the page would wait forever.
    const workerFailed = new Promise<never>((_, reject) => {
      worker.addEventListener(
        'error',
        () => {
          reject(new Error(ENGINE_UNAVAILABLE));
        },
        { once: true },
      );
    });
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await Promise.race([db.instantiate(new URL(ENGINE.wasm, origin).href), workerFailed]);
    await db.registerFileURL(
      'archive.duckdb',
      new URL(ENGINE.database, origin).href,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    const conn = (await db.connect()) as unknown as Connection;
    await conn.query("ATTACH 'archive.duckdb' AS archive_db (READ_ONLY)");
    await conn.query('USE archive_db');
    return conn;
  })();
  connected.catch(() => {
    connected = undefined; // a failed start may succeed on the next try (a flaky network)
  });
  return connected;
};

/** Runs SQL against the archive (starting DuckDB the first time): up to MAX_ROWS plain rows. */
export async function queryRows(sql: string): Promise<QueryResult> {
  const conn = await connect(window.location.origin);
  const started = performance.now();
  const table = await conn.query(sql);
  const columns = table.schema.fields.map((f) => f.name);
  const rows = table
    .toArray()
    .slice(0, MAX_ROWS)
    .map((row) => {
      const json = row.toJSON();
      return columns.map((c) => plainValue(json[c]));
    });
  return { columns, rows, truncated: table.numRows > MAX_ROWS, ms: performance.now() - started };
}

const duckdbDriver = defineDriver<string, QueryResult, string>({
  name: 'duckdb',
  concurrency: 'switch',
  run: queryRows,
  toError: (cause) => (cause instanceof Error ? cause.message : String(cause)),
});

/** Runs SQL against the archive; a newer query cancels the one in flight. */
export const runQuery = <M>(
  sql: string,
  done: (result: QueryResult) => M,
  failed: (reason: string) => M,
): Command<M> => command(duckdbDriver, sql, { onSuccess: done, onFailure: failed });

/** For tests: `@gyral/testing` matches commands to drivers by name. */
export const drivers = { duckdb: duckdbDriver } as const;
