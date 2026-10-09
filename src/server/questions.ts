// The question log (ADR 0010): one row per question asked on Explore, so the prompts can be
// improved from what people ask. Written by the API itself, to its own DuckDB file on a volume,
// in a DuckDB instance separate from the archive's, which visitors' SQL can't reach. Nothing
// identifies the visitor: no IP, no user ID, no cookie. Mine it with the DuckDB CLI; ATTACH
// archive.duckdb too, to join questions to the articles they matched.
//
// DuckDB lets one process at a time open a file, even to read it. So the log holds its file only
// while it writes a row: the CLI can open it whenever the API isn't mid-write, and a write that
// finds the CLI holding it waits and tries again.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  BOOLEAN,
  DOUBLE,
  DuckDBInstance,
  type DuckDBConnection,
  INTEGER,
  LIST,
  listValue,
  VARCHAR,
} from '@duckdb/node-api';

/** The parameters' types, given: an empty list of names has none of its own to infer. */
const TYPES = [VARCHAR, VARCHAR, LIST(VARCHAR), VARCHAR, INTEGER, DOUBLE, VARCHAR, BOOLEAN];

/** How a question ended. */
export type Outcome = 'answered' | 'empty' | 'unanswerable' | 'unavailable' | 'slow';

export interface QuestionRecord {
  readonly question: string;
  readonly outcome: Outcome;
  /** The names the model found in the question, as asked. */
  readonly names: readonly string[];
  /** The query that ran, if one did. */
  readonly sql: string | null;
  readonly rows: number | null;
  readonly seconds: number;
  readonly model: string;
  /** Whether it followed earlier questions in the conversation. */
  readonly followUp: boolean;
}

export const QUESTIONS_TABLE = `
CREATE SEQUENCE IF NOT EXISTS question_id;
CREATE TABLE IF NOT EXISTS questions (
  id BIGINT PRIMARY KEY DEFAULT nextval('question_id'),
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  question VARCHAR NOT NULL,
  outcome VARCHAR NOT NULL,
  names VARCHAR[] NOT NULL,
  sql VARCHAR,
  rows INTEGER,
  seconds DOUBLE NOT NULL,
  model VARCHAR NOT NULL,
  follow_up BOOLEAN NOT NULL
)`;

export interface QuestionLog {
  readonly add: (record: QuestionRecord) => Promise<void>;
  /** Resolves when every row added so far is written. */
  readonly close: () => Promise<void>;
}

/** How long a write waits, in all, for someone else to let go of the file. */
const LOCK_WAIT_MS = 30_000;
const LOCK_RETRY_MS = 250;

const isLockConflict = (e: unknown): boolean =>
  e instanceof Error && e.message.includes('Could not set lock');

/** Runs `use` on the log's file, opened for this call only. */
async function withFile(
  file: string,
  use: (run: DuckDBConnection['run']) => Promise<unknown>,
): Promise<void> {
  for (let waited = 0; ; waited += LOCK_RETRY_MS) {
    let instance: DuckDBInstance;
    try {
      instance = await DuckDBInstance.create(file);
    } catch (e) {
      if (!isLockConflict(e) || waited >= LOCK_WAIT_MS) throw e;
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      continue;
    }
    const connection = await instance.connect();
    try {
      await use((...args) => connection.run(...args));
      return;
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }
}

/** Creates the log at `file` if it isn't there; rows are written one at a time, in order. */
export async function openQuestionLog(file: string): Promise<QuestionLog> {
  mkdirSync(dirname(file), { recursive: true });
  await withFile(file, (run) => run(QUESTIONS_TABLE));
  let pending: Promise<void> = Promise.resolve();
  return {
    add: (r) => {
      const write = pending.then(() =>
        withFile(file, (run) =>
          run(
            `INSERT INTO questions (question, outcome, names, sql, rows, seconds, model, follow_up)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              r.question,
              r.outcome,
              listValue([...r.names]),
              r.sql,
              r.rows,
              Math.round(r.seconds * 10) / 10,
              r.model,
              r.followUp,
            ],
            TYPES,
          ),
        ),
      );
      // One failed write mustn't stop the ones after it; its caller still sees the error.
      pending = write.catch(() => undefined);
      return write;
    },
    close: () => pending,
  };
}

/**
 * Copies the log into `dir` as questions-<time>.duckdb and keeps the newest `keep` copies; returns
 * the copy's path. Safe while the API runs: it takes the file as a write does (waiting for one in
 * progress), checkpoints so the file holds every row, and copies it before letting go. Run in the
 * container as `node api.mjs backup` (deploy/backup.sh).
 */
export async function backupQuestionLog(
  file: string,
  dir: string,
  keep: number,
  now: Date = new Date(),
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, `questions-${now.toISOString().replace(/[:.]/g, '-')}.duckdb`);
  await withFile(file, async (run) => {
    await run('CHECKPOINT');
    copyFileSync(file, copy);
  });
  const copies = readdirSync(dir)
    .filter((name) => /^questions-.*\.duckdb$/.test(name))
    .sort()
    .reverse();
  for (const old of copies.slice(Math.max(1, keep))) rmSync(join(dir, old));
  return copy;
}
