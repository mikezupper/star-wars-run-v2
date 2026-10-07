// The question log (ADR 0010): one row per question asked on Explore, so the prompts can be
// improved from what people ask. Written by the API itself, to its own DuckDB file on a volume,
// in a DuckDB instance separate from the archive's, which visitors' SQL can't reach. Nothing
// identifies the visitor: no IP, no user ID, no cookie. Mine it with the DuckDB CLI; ATTACH
// archive.duckdb too, to join questions to the articles they matched.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  BOOLEAN,
  DOUBLE,
  DuckDBInstance,
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
  readonly close: () => void;
}

/** Opens (or creates) the log at `file`; ':memory:' for tests. */
export async function openQuestionLog(file: string): Promise<QuestionLog> {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const instance = await DuckDBInstance.create(file);
  const connection = await instance.connect();
  await connection.run(QUESTIONS_TABLE);
  return {
    add: async (r) => {
      await connection.run(
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
      );
    },
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
