// The question log's writer (swr-ca3.3): one SQLite row per question asked on Explore, with
// Node's built-in node:sqlite (no dependencies). Production runs it as its own small service
// (scripts/question-log.ts, in the questions container); the dev and preview servers call it
// directly. The record's shape and limits are in src/domain/question-log.ts.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_RECORD_BYTES,
  parseQuestionRecord,
  QUESTIONS_TABLE,
  type QuestionRecord,
} from '../domain/question-log.js';

export interface QuestionLog {
  readonly add: (record: QuestionRecord) => void;
  readonly close: () => void;
}

/** Opens (or creates) the log at `file`; ':memory:' for tests. */
export function openQuestionLog(file: string): QuestionLog {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(QUESTIONS_TABLE);
  const insert = db.prepare(
    `INSERT INTO questions (question, outcome, names, sql, rows, seconds, model, follow_up)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return {
    add: (r) => {
      insert.run(
        r.question,
        r.outcome,
        JSON.stringify(r.names),
        r.sql,
        r.rows,
        r.seconds,
        r.model,
        r.followUp ? 1 : 0,
      );
    },
    close: () => {
      db.close();
    },
  };
}

const status = (code: number): Response =>
  new Response(null, { status: code, headers: { 'cache-control': 'no-store' } });

/** One POST to /api/ask/log: 204 when recorded, 400 for a body that isn't a record. */
export async function handleQuestionLog(request: Request, log: QuestionLog): Promise<Response> {
  if (request.method !== 'POST') return status(405);
  const body = await request.text();
  if (body.length > MAX_RECORD_BYTES) return status(413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return status(400);
  }
  const record = parseQuestionRecord(parsed);
  if (record === undefined) return status(400);
  log.add(record);
  return status(204);
}
