import { describe, expect, it } from 'vitest';
import { articlePreview, previewPath } from '../../src/domain/preview.js';
import { buildArchive } from '../../src/domain/archive.js';
import type { ArticleRecord } from '../../src/domain/article.js';

const article: ArticleRecord = {
  title: 'Luke Skywalker/Legends',
  era: 'legends',
  kind: 'Character',
  lead: [
    [
      { text: 'Luke came from ' },
      { text: 'Tatooine', link: 'Tatooine' },
      { text: '. He became a Jedi.' },
    ],
  ],
  fields: [
    { name: 'empty', items: [] },
    ...['homeworld', 'species', 'affiliation', 'occupation'].map((name) => ({
      name,
      items: [[{ text: 'Fact' }]],
    })),
  ],
};
const entry = buildArchive([article]).byTitle.get(article.title);
if (entry === undefined) throw new Error('Missing fixture entry');

describe('article previews', () => {
  it('accepts only local canonical article links', () => {
    expect(previewPath('/characters/luke/', 'https://starwars.run')).toBe('/characters/luke/');
    for (const path of [
      'https://example.com/characters/luke/',
      '/characters/',
      '/characters/letters/l/',
      '/api/preview',
      '/characters/luke/?q=x',
      '/characters/luke/#facts',
      'http://[',
    ])
      expect(previewPath(path, 'https://starwars.run'), path).toBeUndefined();
  });
  it('gives plain text from the first sentence and at most three populated facts', () => {
    expect(articlePreview(entry, article)).toEqual({
      name: 'Luke Skywalker',
      path: entry.path,
      section: 'characters',
      era: 'legends',
      lead: 'Luke came from Tatooine.',
      facts: ['homeworld', 'species', 'affiliation'].map((name) => ({ name, value: 'Fact' })),
    });
  });
  it('bounds long prose and facts, and handles an absent lead', () => {
    const preview = articlePreview(entry, {
      ...article,
      lead: [[{ text: 'word '.repeat(100) + '.' }]],
      fields: [
        { name: 'fact', items: [[{ text: 'x'.repeat(300) }], [{ text: 'Y' }], [{ text: 'Z' }]] },
      ],
    });
    expect(preview.lead.length).toBeLessThanOrEqual(321);
    expect(preview.lead).toMatch(/…$/);
    expect(preview.facts[0]?.value).toHaveLength(160);
    expect(articlePreview(entry, { ...article, lead: [] }).lead).toBe('');
    expect(articlePreview(entry, { ...article, lead: [[{ text: 'No punctuation' }]] }).lead).toBe(
      'No punctuation',
    );
  });
});
