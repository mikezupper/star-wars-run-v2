import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  MAX_RECORD_BYTES,
  parseQuestionRecord,
  QUESTIONS_PATH,
} from '../../src/domain/question-log.js';
import { handleQuestionLog, openQuestionLog } from '../../src/server/question-log.js';

const valid = {
  question: '  Which Wookiees fought for the Rebel Alliance?  ',
  outcome: 'answered',
  names: ['Wookiees', 3, '', 'Rebel Alliance'],
  sql: 'SELECT 1',
  rows: 5,
  seconds: 7.43,
  model: 'Qwen3.8-27B',
  followUp: true,
  ip: '203.0.113.9',
};

describe('a question record', () => {
  it('keeps only what the log stores, trimmed and capped', () => {
    expect(parseQuestionRecord(valid)).toEqual({
      question: 'Which Wookiees fought for the Rebel Alliance?',
      outcome: 'answered',
      names: ['Wookiees', 'Rebel Alliance'],
      sql: 'SELECT 1',
      rows: 5,
      seconds: 7.4,
      model: 'Qwen3.8-27B',
      followUp: true,
    });
    expect(parseQuestionRecord({ ...valid, question: 'x'.repeat(900) })?.question).toHaveLength(
      500,
    );
    expect(parseQuestionRecord({ ...valid, names: Array(30).fill('n') })?.names).toHaveLength(10);
    expect(
      parseQuestionRecord({ ...valid, sql: undefined, rows: -1, model: undefined }),
    ).toMatchObject({
      sql: null,
      rows: null,
      model: 'unknown',
    });
  });

  it('refuses a body that isn’t a record', () => {
    expect(parseQuestionRecord(null)).toBeUndefined();
    expect(parseQuestionRecord({ ...valid, question: ' ' })).toBeUndefined();
    expect(parseQuestionRecord({ ...valid, outcome: 'great' })).toBeUndefined();
    expect(parseQuestionRecord({ ...valid, seconds: -1 })).toBeUndefined();
  });
});

describe('the question log service', () => {
  const post = (body: string, method = 'POST') =>
    new Request(
      `http://localhost${QUESTIONS_PATH}`,
      method === 'POST' ? { method, body } : { method },
    );

  it('writes one row per record, and nothing else', async () => {
    const log = openQuestionLog(':memory:');
    const rows: unknown[] = [];
    const counting = { add: (r: unknown) => rows.push(r), close: log.close };
    expect((await handleQuestionLog(post(JSON.stringify(valid)), counting)).status).toBe(204);
    expect((await handleQuestionLog(post('not json'), counting)).status).toBe(400);
    expect((await handleQuestionLog(post('{"outcome":"answered"}'), counting)).status).toBe(400);
    expect((await handleQuestionLog(post('x'.repeat(MAX_RECORD_BYTES + 1)), counting)).status).toBe(
      413,
    );
    expect((await handleQuestionLog(post('', 'GET'), counting)).status).toBe(405);
    expect(rows).toHaveLength(1);
    log.close();
  });

  it('stores a record in SQLite, creating the file and table', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-questions-'));
    const file = join(dir, 'nested', 'questions.db');
    const log = openQuestionLog(file);
    const res = await handleQuestionLog(post(JSON.stringify(valid)), log);
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    log.close();
    const db = new DatabaseSync(file);
    expect(
      db.prepare('SELECT question, outcome, names, rows, follow_up FROM questions').all(),
    ).toEqual([
      {
        question: 'Which Wookiees fought for the Rebel Alliance?',
        outcome: 'answered',
        names: '["Wookiees","Rebel Alliance"]',
        rows: 5,
        follow_up: 1,
      },
    ]);
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
});
