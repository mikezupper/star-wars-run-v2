// The archive database on the server (ADR 0010): the build's archive.duckdb, opened read-only
// in a DuckDB instance locked down before any visitor's SQL reaches it. No file system, no
// network, no extensions, and a locked configuration so a query can't undo any of it; a memory
// cap; and each query on its own connection, interrupted at its time limit. Ask's queries and
// the SQL editor's both run here. A result with a `path` column also gets `pair`, the subject's
// canon path, so Explore can fold canon and Legends twins into one row (swr-cd6).
import { DuckDBInstance } from '@duckdb/node-api';
import { plainValue, type QueryResult } from '../domain/query.js';

/** The lock-down: everything a visitor's SQL could use to leave the database. */
export const LOCKED = {
  access_mode: 'READ_ONLY',
  enable_external_access: 'false',
  autoinstall_known_extensions: 'false',
  autoload_known_extensions: 'false',
  max_memory: '1GB',
  threads: '2',
  // Last: no SET after this, by anyone.
  lock_configuration: 'true',
} as const;

/** A query that runs longer than this is interrupted. */
export const QUERY_TIME_LIMIT_MS = 10_000;

export class QueryTimeout extends Error {
  constructor() {
    super(
      `The query took longer than ${String(QUERY_TIME_LIMIT_MS / 1000)} seconds and was stopped.`,
    );
  }
}

export interface Archive {
  /** Runs SQL (already checked: one SELECT, capped); up to `maxRows` rows come back. */
  readonly query: (sql: string, maxRows: number) => Promise<QueryResult>;
  readonly close: () => void;
}

export async function openArchive(
  file: string,
  timeLimitMs = QUERY_TIME_LIMIT_MS,
): Promise<Archive> {
  const instance = await DuckDBInstance.create(file, LOCKED);
  const pairs = await subjectPairs(instance);
  return {
    query: async (sql, maxRows) => withPairs(await run(instance, sql, maxRows, timeLimitMs), pairs),
    close: () => {
      instance.closeSync();
    },
  };
}

/** Path → its subject's canon path, from the archive table; empty for a database without it. */
async function subjectPairs(instance: DuckDBInstance): Promise<ReadonlyMap<string, string>> {
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll('SELECT path, pair FROM archive');
    return new Map(reader.getRows().map(([path, pair]) => [String(path), String(pair)]));
  } catch {
    return new Map(); // built before the pair column: results go without it
  } finally {
    connection.closeSync();
  }
}

/** Adds `pair` beside `path`, unless the query chose its own. */
export function withPairs(result: QueryResult, pairs: ReadonlyMap<string, string>): QueryResult {
  const at = result.columns.indexOf('path');
  if (at < 0 || pairs.size === 0 || result.columns.includes('pair')) return result;
  return {
    ...result,
    columns: [...result.columns, 'pair'],
    extra: ['pair'],
    rows: result.rows.map((row) => {
      const path = row[at];
      return [...row, typeof path === 'string' ? (pairs.get(path) ?? path) : null];
    }),
  };
}

/** One query on its own connection, interrupted at the time limit. */
async function run(
  instance: DuckDBInstance,
  sql: string,
  maxRows: number,
  timeLimitMs: number,
): Promise<QueryResult> {
  const connection = await instance.connect();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    connection.interrupt();
  }, timeLimitMs);
  const started = performance.now();
  try {
    const reader = await connection.runAndReadAll(sql);
    const rows = reader.getRows();
    return {
      columns: reader.columnNames(),
      rows: rows.slice(0, maxRows).map((row) => row.map(plainValue)),
      truncated: rows.length > maxRows,
      ms: performance.now() - started,
    };
  } catch (cause) {
    throw state.timedOut ? new QueryTimeout() : cause;
  } finally {
    clearTimeout(timer);
    connection.closeSync();
  }
}
