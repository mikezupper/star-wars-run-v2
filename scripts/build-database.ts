/// <reference types="node" />
// Writes the Explore page's tables (src/domain/rows.ts) to dist/data/archive.duckdb. The browser
// attaches the file read-only with DuckDB-WASM and reads only the blocks a query needs, over HTTP
// range requests. A native DuckDB file, not Parquet: reading Parquet makes DuckDB-WASM download
// its parquet extension from extensions.duckdb.org, which the CSP (rightly) blocks.
// Rows go through a temporary JSON Lines file so column types come from an explicit schema.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { NUMBER_COLUMNS, type ArchiveRow, type FactRow } from '../src/domain/rows.js';

/** The browser's DuckDB (1.5.4 in duckdb-wasm 1.33) must read what Node's (1.5.6) writes. */
const STORAGE_VERSION = 'v1.2.0';

const sqlString = (s: string): string => `'${s.replaceAll("'", "''")}'`;

async function createTable(
  connection: DuckDBConnection,
  tmp: string,
  name: string,
  rows: readonly object[],
  columns: Readonly<Record<string, string>>,
  order: string,
): Promise<void> {
  const source = join(tmp, `${name}.jsonl`);
  await writeFile(source, rows.map((r) => JSON.stringify(r)).join('\n'));
  const spec = `{${Object.entries(columns)
    .map(([column, type]) => `${sqlString(column)}: ${sqlString(type)}`)
    .join(', ')}}`;
  await connection.run(
    `CREATE TABLE explore.${name} AS SELECT * FROM read_json(${sqlString(source)}, format = 'newline_delimited', columns = ${spec}) ORDER BY ${order}`,
  );
}

export async function buildDatabase(
  dist: string,
  tables: { readonly archive: readonly ArchiveRow[]; readonly facts: readonly FactRow[] },
): Promise<void> {
  const out = join(dist, 'data', 'archive.duckdb');
  await mkdir(join(dist, 'data'), { recursive: true });
  await rm(out, { force: true });
  const tmp = await mkdtemp(join(tmpdir(), 'swr-explore-'));
  const db = await DuckDBInstance.create(':memory:', { threads: '1' });
  const connection = await db.connect();
  try {
    await connection.run(
      `ATTACH ${sqlString(out)} AS explore (STORAGE_VERSION '${STORAGE_VERSION}')`,
    );
    await createTable(
      connection,
      tmp,
      'archive',
      tables.archive,
      {
        title: 'VARCHAR',
        name: 'VARCHAR',
        path: 'VARCHAR',
        section: 'VARCHAR',
        kind: 'VARCHAR',
        era: 'VARCHAR',
        ...Object.fromEntries(NUMBER_COLUMNS.map((c) => [c, 'DOUBLE'])),
      },
      'title',
    );
    await createTable(
      connection,
      tmp,
      'facts',
      tables.facts,
      { title: 'VARCHAR', field: 'VARCHAR', item: 'INTEGER', text: 'VARCHAR', link: 'VARCHAR' },
      'title, field, item',
    );
    await connection.run('CHECKPOINT explore');
    await connection.run('DETACH explore');
  } finally {
    connection.closeSync();
    db.closeSync();
    await rm(tmp, { recursive: true, force: true });
  }
}
