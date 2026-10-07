/// <reference types="node" />
// Writes Explore's tables (src/domain/rows.ts) to archive.duckdb, for the API (ADR 0010), which
// opens it read-only on the server. It's written beside the public site, not in it.
// Rows go through a temporary JSON Lines file so column types come from an explicit schema.
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
  NUMBER_COLUMNS,
  type AppearanceRow,
  type ArchiveRow,
  type FactRow,
} from '../src/domain/rows.js';

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
  // In chunks: the full archive's appearances, as one string, would pass V8's string limit.
  const file = await open(source, 'w');
  try {
    for (let i = 0; i < rows.length; i += 10_000) {
      await file.write(
        rows
          .slice(i, i + 10_000)
          .map((r) => `${JSON.stringify(r)}\n`)
          .join(''),
      );
    }
  } finally {
    await file.close();
  }
  const spec = `{${Object.entries(columns)
    .map(([column, type]) => `${sqlString(column)}: ${sqlString(type)}`)
    .join(', ')}}`;
  await connection.run(
    `CREATE TABLE explore.${name} AS SELECT * FROM read_json(${sqlString(source)}, format = 'newline_delimited', columns = ${spec}) ORDER BY ${order}`,
  );
}

export async function buildDatabase(
  outDir: string,
  tables: {
    readonly archive: readonly ArchiveRow[];
    readonly facts: readonly FactRow[];
    readonly appearances: readonly AppearanceRow[];
  },
): Promise<void> {
  const out = join(outDir, 'archive.duckdb');
  await mkdir(outDir, { recursive: true });
  await rm(out, { force: true });
  const tmp = await mkdtemp(join(tmpdir(), 'swr-explore-'));
  const db = await DuckDBInstance.create(':memory:', { threads: '1' });
  const connection = await db.connect();
  try {
    await connection.run(`ATTACH ${sqlString(out)} AS explore`);
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
        links: 'INTEGER',
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
    await createTable(
      connection,
      tmp,
      'appearances',
      tables.appearances,
      {
        title: 'VARCHAR',
        item: 'INTEGER',
        text: 'VARCHAR',
        link: 'VARCHAR',
        markers: 'VARCHAR',
        noncanon: 'BOOLEAN',
      },
      'title, item',
    );
    await connection.run('CHECKPOINT explore');
    await connection.run('DETACH explore');
  } finally {
    connection.closeSync();
    db.closeSync();
    await rm(tmp, { recursive: true, force: true });
  }
}
