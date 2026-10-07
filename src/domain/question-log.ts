// The question log (swr-ca3.3): every question asked on Explore, one row each, so the prompts
// can be improved from what people really ask. The island posts a record to /api/ask/log when a
// question ends; a small service writes it to SQLite (src/server/question-log.ts). Nothing
// identifies who asked: no IP, no user ID, no cookie. This module is the record's shape and
// limits, shared by the service, the dev and preview servers, and the island.

/** Where the island posts records. */
export const QUESTIONS_PATH = '/api/ask/log';
/** A record is a few hundred bytes; anything far bigger isn't from the island. */
export const MAX_RECORD_BYTES = 16 * 1024;

/** How a question ended. */
export const OUTCOMES = ['answered', 'empty', 'unanswerable', 'unavailable', 'slow'] as const;
export type Outcome = (typeof OUTCOMES)[number];

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
  /** Whether it followed earlier questions (a follow-up, or a new question after them). */
  readonly followUp: boolean;
}

const LIMITS = { question: 500, name: 100, names: 10, sql: 4000, model: 100 } as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined;
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

/** A record from a request body, trimmed to its limits; undefined if it isn't one. */
export function parseQuestionRecord(body: unknown): QuestionRecord | undefined {
  if (!isRecord(body)) return undefined;
  const question = text(body['question'], LIMITS.question);
  const outcome = OUTCOMES.find((o) => o === body['outcome']);
  const seconds = body['seconds'];
  if (question === undefined || outcome === undefined) return undefined;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const names = Array.isArray(body['names']) ? body['names'] : [];
  return {
    question,
    outcome,
    names: names
      .map((n) => text(n, LIMITS.name))
      .filter((n): n is string => n !== undefined)
      .slice(0, LIMITS.names),
    sql: text(body['sql'], LIMITS.sql) ?? null,
    rows: count(body['rows']),
    seconds: Math.round(seconds * 10) / 10,
    model: text(body['model'], LIMITS.model) ?? 'unknown',
    followUp: body['followUp'] === true,
  };
}

/** The table, created on first use. asked_at is UTC, to the millisecond. */
export const QUESTIONS_TABLE = `CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  question TEXT NOT NULL,
  outcome TEXT NOT NULL,
  names TEXT NOT NULL,
  sql TEXT,
  rows INTEGER,
  seconds REAL NOT NULL,
  model TEXT NOT NULL,
  follow_up INTEGER NOT NULL
)`;
