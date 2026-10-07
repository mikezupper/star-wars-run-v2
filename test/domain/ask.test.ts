import { plainValue } from '../../src/domain/query.js';
import { describe, expect, it } from 'vitest';
import {
  asPlan,
  asQuery,
  askPath,
  askSchema,
  checkSql,
  deltaText,
  readSse,
  looksLikeQuestion,
  MAX_ROWS,
  parseJson,
  planMessages,
  sqlMessages,
  summaryMessages,
} from '../../src/domain/ask.js';
import { exploreRows } from '../../src/domain/rows.js';
import { fixtureSiteData } from '../fixtures/archive.js';

const { archive, articles } = fixtureSiteData();

describe('checking the SQL a model writes', () => {
  it('runs one SELECT or WITH, capped one row past MAX_ROWS', () => {
    expect(checkSql('SELECT 1;')).toEqual({
      sql: `SELECT * FROM (SELECT 1) AS answer LIMIT ${String(MAX_ROWS + 1)}`,
    });
    expect(checkSql('  with x as (select 1) select * from x')).toHaveProperty('sql');
  });

  it('refuses anything else, a second statement, or unbalanced parentheses', () => {
    expect(checkSql('DROP TABLE archive')).toHaveProperty('error');
    expect(checkSql('SELECT 1; DELETE FROM facts')).toEqual({
      error: 'Only one statement is allowed.',
    });
    expect(checkSql('SELECT (1')).toEqual({ error: 'The parentheses are unbalanced.' });
    expect(checkSql('SELECT 1)')).toEqual({ error: 'The parentheses are unbalanced.' });
  });

  it('ignores semicolons and parentheses inside quoted text', () => {
    expect(checkSql("SELECT 'a;b(' AS x")).toHaveProperty('sql');
    expect(checkSql("SELECT 'it''s (' AS x")).toHaveProperty('sql');
  });
});

describe('reading structured answers', () => {
  it('finds the JSON in a reply, fenced or not, and checks its shape', () => {
    expect(asPlan('{"names":["Yoda", 3, " "]}')).toEqual({ names: ['Yoda'] });
    expect(asPlan('{"names":"Yoda"}')).toBeUndefined();
    expect(asQuery('{"sql":"SELECT 1"}')).toEqual({ sql: 'SELECT 1', looksFor: '' });
    expect(asQuery('{"sql":1}')).toBeUndefined();
    expect(parseJson('Sure!\n```json\n{"sql":"SELECT 1"}\n```')).toEqual({ sql: 'SELECT 1' });
    expect(parseJson('no json here')).toBeUndefined();
    expect(parseJson('{broken')).toBeUndefined();
  });
});

describe('what the model is told', () => {
  const schema = askSchema(
    exploreRows(archive, articles).archive,
    exploreRows(archive, articles).facts,
  );

  it('lists each section’s commonest kinds and fields, from the data', () => {
    expect(schema.kinds.characters).toContain('Character');
    expect(schema.fields.characters).toContain('homeworld');
    expect(schema.fields.characters?.length).toBeLessThanOrEqual(30);
  });

  it('asks for the names in a question, with earlier questions as context', () => {
    const [system, user] = planMessages('Who trained him?', [
      { question: 'Who is Luke?', sql: 'x' },
    ]);
    expect(system?.role).toBe('system');
    expect(user?.content).toContain('Earlier questions: Who is Luke?');
    expect(user?.content).toContain('Question: Who trained him?');
  });

  it('gives the SQL step the tables, the resolved titles, the history and a failed attempt', () => {
    const messages = sqlMessages(
      'Who comes from Tatooine?',
      [
        { asked: 'Tatooine', titles: [{ title: 'Tatooine', section: 'planets' }] },
        { asked: 'Nowhere', titles: [] },
      ],
      schema,
      [{ question: 'Who is Luke?', sql: 'SELECT 1' }],
      { sql: 'SELECT (', error: 'The parentheses are unbalanced.' },
    );
    const text = messages.map((m) => m.content).join('\n');
    expect(text).toContain('facts(title, field, item, text, link)');
    expect(text).toContain('Tatooine → "Tatooine" (planets)');
    expect(text).toContain("Nowhere → no article found (don't filter on it by title)");
    expect(text).toContain('Question: Who is Luke?');
    expect(messages.at(-1)?.content).toContain(
      'That query failed: The parentheses are unbalanced.',
    );
  });

  it('summarizes from the rows only, without paths, and says when there were more', () => {
    const [, user] = summaryMessages(
      'How many?',
      ['name', 'path', 'count'],
      [['Luke', '/characters/luke/', 3n]],
      true,
    );
    expect(user?.content).toContain('Rows: more than 1.');
    expect(user?.content).toContain('{"name":"Luke","count":3}');
    expect(user?.content).not.toContain('/characters/luke/');
    const [system, withQuery] = summaryMessages(
      'Who is Han Solo\u2019s wife?',
      ['name'],
      [],
      false,
      'SELECT … partners',
    );
    expect(withQuery?.content).toContain('Query: SELECT … partners');
    expect(system?.content).toContain('count names, not rows');
  });
});

describe('handing a search to Ask', () => {
  it('spots questions, not names', () => {
    for (const q of [
      'Who trained Obi-Wan?',
      'which films is Boba Fett in',
      'how many Jedi',
      'Luke vs Vader?',
    ])
      expect(looksLikeQuestion(q), q).toBe(true);
    for (const q of ['Tatooine', 'Who', 'Luke Skywalker', 'Millennium Falcon', 'Sky-dreadnaught'])
      expect(looksLikeQuestion(q), q).toBe(false);
  });

  it('links to Explore with the question', () => {
    expect(askPath(' Who is Yoda? ')).toBe('/explore/?ask=Who%20is%20Yoda%3F');
  });
});

describe('reading a streamed summary', () => {
  const chunk = (text: string) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`;

  it('returns whole events and keeps a partial one for the next chunk', () => {
    const { data, rest } = readSse(`${chunk('Five ')}${chunk('Wookiees')}data: {"cho`);
    expect(data.map(deltaText)).toEqual(['Five ', 'Wookiees']);
    expect(rest).toBe('data: {"cho');
  });

  it('skips [DONE], blank lines and chunks without text', () => {
    const { data } = readSse(
      `: keep-alive\n\ndata: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n`,
    );
    expect(data.map(deltaText)).toEqual(['']);
    expect(deltaText('not json')).toBe('');
    expect(deltaText('{"choices":[]}')).toBe('');
  });
});

describe('plain values from DuckDB', () => {
  it('turns counts, objects and missing values into JSON', () => {
    expect(plainValue(5n)).toBe(5);
    expect(plainValue(2n ** 70n)).toBe((2n ** 70n).toString());
    expect(plainValue(undefined)).toBeNull();
    expect(plainValue({ a: 1 })).toBe('{"a":1}');
    expect(plainValue(true)).toBe(true);
    expect(plainValue({ items: [1n, 'a'] })).toBe('{"items":[1,"a"]}');
  });
});
