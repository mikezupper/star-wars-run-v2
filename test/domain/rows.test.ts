import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDatabase } from '../../scripts/build-database.js';
import { exploreRows, NUMBER_COLUMNS } from '../../src/domain/rows.js';
import { fixtureSiteData } from '../fixtures/archive.js';

const { archive, articles } = fixtureSiteData();
const rows = exploreRows(archive, articles);
const dirs: string[] = [];
afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe('Explore rows', () => {
  it('have one archive row per article, with its page, kind, era and every number column', () => {
    expect(rows.archive).toHaveLength(articles.size);
    const luke = rows.archive.find((r) => r.title === 'Luke Skywalker');
    expect(luke).toMatchObject({
      name: 'Luke Skywalker',
      path: '/characters/luke-skywalker/',
      section: 'characters',
      kind: 'Character',
      era: 'canon',
      height_m: 1.72,
      mass_kg: 73,
    });
    for (const column of NUMBER_COLUMNS) expect(luke).toHaveProperty(column);
    expect(rows.archive.find((r) => r.title === 'Luke Skywalker/Legends')?.name).toBe(
      'Luke Skywalker',
    );
  });

  it('have one fact row per infobox value, with the first article it links to', () => {
    expect(rows.facts).toContainEqual({
      title: 'Luke Skywalker',
      field: 'homeworld',
      item: 0,
      text: 'Tatooine',
      link: 'Tatooine',
    });
    const hair = rows.facts.filter((f) => f.title === 'Luke Skywalker' && f.field === 'hair');
    expect(hair.map((f) => f.item)).toEqual([0, 1, 2]);
  });
});

describe('the Explore database', () => {
  it('holds both tables, queryable the way the page queries them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swr-db-'));
    dirs.push(dir);
    await buildDatabase(dir, rows);
    const db = await DuckDBInstance.create(':memory:');
    const c = await db.connect();
    await c.run(`ATTACH '${join(dir, 'data', 'archive.duckdb')}' AS a (READ_ONLY)`);
    await c.run('USE a');
    const tatooine = await c.runAndReadAll(
      "SELECT a.name FROM facts f JOIN archive a USING (title) WHERE f.field = 'homeworld' AND f.link = 'Tatooine' ORDER BY 1",
    );
    expect(tatooine.getRows().flat()).toContain('Luke Skywalker');
    const tallest = await c.runAndReadAll(
      'SELECT name, height_m FROM archive ORDER BY height_m DESC NULLS LAST LIMIT 1',
    );
    expect(tallest.getRows()[0]?.[1]).toBeGreaterThan(1);
    c.closeSync();
    db.closeSync();
  });
});
