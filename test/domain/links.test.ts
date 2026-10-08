import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '../../src/domain/article.js';
import { linkGraph, outgoing } from '../../src/domain/links.js';
import { inboundLinks } from '../../src/domain/titles.js';

/** An article whose lead links to each of `targets`. */
const article = (title: string, ...targets: string[]): ArticleRecord => ({
  title,
  era: 'canon',
  fields: [],
  lead: [targets.map((t) => ({ text: t, link: t }))],
});

describe('the link graph', () => {
  // Luke is linked from four articles, Leia from two, Han from one.
  const articles = [
    article('Luke'),
    article('Leia', 'Luke'),
    article('Han', 'Luke', 'Leia'),
    article('Chewbacca', 'Luke', 'Han', 'Leia'),
    article('Yoda', 'Luke', 'Yoda'),
  ];
  const graph = linkGraph(articles);

  it('counts each article’s inbound links once per linker, never from itself', () => {
    expect(graph.counts.get('Luke')).toBe(4);
    expect(graph.counts.get('Leia')).toBe(2);
    expect(graph.counts.get('Yoda')).toBeUndefined();
    expect(graph.counts).toEqual(inboundLinks(articles));
    expect(outgoing(articles[4] as ArticleRecord)).toEqual(new Set(['Luke']));
  });

  it('lists each article’s linkers best known first, ties in title order', () => {
    // Leia (2) and Han (1) beat Chewbacca and Yoda (0), who tie and go by title.
    expect(graph.linkedFrom.get('Luke')).toEqual(['Leia', 'Han', 'Chewbacca', 'Yoda']);
  });

  it('keeps only the best `limit` linkers', () => {
    expect(linkGraph(articles, 2).linkedFrom.get('Luke')).toEqual(['Leia', 'Han']);
  });

  it('finds links in facts and appearances too', () => {
    const work = {
      ...article('A New Hope'),
      fields: [{ name: 'Director', items: [[{ text: 'George Lucas', link: 'George Lucas' }]] }],
      appearances: [
        { text: 'Luke', link: 'Luke', markers: [] },
        { text: 'Nobody', markers: [] },
      ],
    };
    expect(outgoing(work)).toEqual(new Set(['George Lucas', 'Luke']));
  });
});
