import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupQuestionLog, openQuestionLog } from '../../src/server/questions.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swr-questions-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const record = (question: string) => ({
  question,
  outcome: 'answered' as const,
  names: [],
  sql: null,
  rows: null,
  seconds: 1,
  model: 'test',
  followUp: false,
});

const questionsIn = async (file: string): Promise<string[]> => {
  const instance = await DuckDBInstance.create(file, { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const result = await connection.runAndReadAll('SELECT question FROM questions ORDER BY id');
    return result.getRowObjects().map((row) => String(row['question']));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
};

describe('backupQuestionLog', () => {
  it('copies every row while the log stays open, and the log keeps writing', async () => {
    const file = join(dir, 'questions.duckdb');
    const log = await openQuestionLog(file);
    await log.add(record('Who comes from Tatooine?'));
    const copy = await backupQuestionLog(file, join(dir, 'backups'), 14);
    await log.add(record('How tall is Chewbacca?'));
    await log.close();
    expect(await questionsIn(copy)).toEqual(['Who comes from Tatooine?']);
    expect(await questionsIn(file)).toEqual(['Who comes from Tatooine?', 'How tall is Chewbacca?']);
  });

  it('keeps the newest copies only', async () => {
    const file = join(dir, 'questions.duckdb');
    await (await openQuestionLog(file)).close();
    const backups = join(dir, 'backups');
    for (const day of [1, 2, 3, 4]) {
      await backupQuestionLog(file, backups, 2, new Date(Date.UTC(2026, 9, day)));
    }
    expect((await readdir(backups)).sort()).toEqual([
      'questions-2026-10-03T00-00-00-000Z.duckdb',
      'questions-2026-10-04T00-00-00-000Z.duckdb',
    ]);
  });
});
