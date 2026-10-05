// Checks the committed data/ itself, so a hand edit or a stale snapshot fails `pnpm check`
// without needing the network.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, loadDataset } from '../../src/data/load.js';
import { snapshotFiles } from '../../src/ingest/snapshot.js';
import { KINDS, type Kind } from '../../src/domain/records.js';
import { oneWayLinks } from '../../src/ingest/swapi.js';

const data = await loadDataset();

/** Each link field and the kind its slugs must name. */
const LINK_FIELDS: Readonly<Record<Kind, Readonly<Record<string, Kind>>>> = {
  films: {
    characters: 'people',
    planets: 'planets',
    species: 'species',
    vehicles: 'vehicles',
    starships: 'starships',
  },
  people: {
    homeworld: 'planets',
    films: 'films',
    species: 'species',
    vehicles: 'vehicles',
    starships: 'starships',
  },
  planets: { residents: 'people', films: 'films' },
  species: { homeworld: 'planets', people: 'people', films: 'films' },
  vehicles: { pilots: 'people', films: 'films' },
  starships: { pilots: 'people', films: 'films' },
};

describe('the committed snapshot in data/', () => {
  it('is byte-for-byte what `pnpm ingest` writes (no hand edits, no reformatting)', async () => {
    for (const [name, contents] of snapshotFiles(data)) {
      expect(await readFile(join(DATA_DIR, name), 'utf8'), name).toBe(contents);
    }
  });

  it('has every kind, non-empty', () => {
    for (const kind of KINDS) expect(data[kind].length).toBeGreaterThan(0);
  });

  it('has unique, clean slugs within each kind', () => {
    for (const kind of KINDS) {
      const slugs = data[kind].map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('has only links that resolve to a record of the right kind', () => {
    const exists = new Set(KINDS.flatMap((kind) => data[kind].map((r) => `${kind}/${r.slug}`)));
    const dangling: string[] = [];
    for (const kind of KINDS) {
      for (const record of data[kind]) {
        for (const [field, target] of Object.entries(LINK_FIELDS[kind])) {
          const value: unknown = (record as unknown as Record<string, unknown>)[field];
          const slugs = value === undefined ? [] : Array.isArray(value) ? value : [value];
          for (const slug of slugs as string[]) {
            if (!exists.has(`${target}/${slug}`))
              dangling.push(`${kind}/${record.slug}.${field} → ${target}/${slug}`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('has links in both directions', () => {
    expect(oneWayLinks(data)).toEqual([]);
  });

  it('links Luke and Tatooine both ways', () => {
    const luke = data.people.find((p) => p.slug === 'luke-skywalker');
    const tatooine = data.planets.find((p) => p.slug === 'tatooine');
    expect(luke?.homeworld).toBe('tatooine');
    expect(tatooine?.residents).toContain('luke-skywalker');
  });

  it('has no "unknown" placeholder records', () => {
    for (const kind of KINDS)
      expect(data[kind].map((r) => r.name.toLowerCase())).not.toContain('unknown');
  });
});
