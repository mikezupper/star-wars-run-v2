// The archive database on the server (ADR 0010): the build's archive.duckdb, opened read-only
// in a DuckDB instance locked down before any visitor's SQL reaches it. No file system, no
// network, no extensions, and a locked configuration so a query can't undo any of it; a memory
// cap; and each query on its own connection, interrupted at its time limit. Ask's queries and
// the SQL editor's both run here.
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
  return {
    query: async (sql, maxRows) => {
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
    },
    close: () => {
      instance.closeSync();
    },
  };
}
