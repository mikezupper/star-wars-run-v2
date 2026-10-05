import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toSlug } from '../../src/domain/slug.js';

describe('toSlug', () => {
  it.each([
    ['Luke Skywalker', 'luke-skywalker'],
    ['C-3PO', 'c-3po'],
    ['Padmé Amidala', 'padme-amidala'],
    ['Yavin IV', 'yavin-iv'],
    ['  Jabba Desilijic Tiure ', 'jabba-desilijic-tiure'],
    ['A/SF-01 B-wing', 'a-sf-01-b-wing'],
  ])('%j → %j', (name, slug) => {
    expect(toSlug(name)).toBe(slug);
  });

  it('throws when nothing usable is left', () => {
    expect(() => toSlug('***')).toThrow(/no slug/);
  });

  it('always yields a clean URL segment, and slugging a slug changes nothing', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => /[a-z0-9]/i.test(s)),
        (name) => {
          const slug = toSlug(name);
          expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
          expect(toSlug(slug)).toBe(slug);
        },
      ),
    );
  });
});
