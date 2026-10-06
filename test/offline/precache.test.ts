import { describe, expect, it } from 'vitest';
import { precacheEntries } from '../../src/offline/precache.js';

const files = [
  'index.html',
  'offline/index.html',
  'search/index.html',
  'people/index.html',
  'people/luke-skywalker/index.html',
  '404.html',
  'sitemap.xml',
  'sw.js',
  'assets/site-abc123.css',
  'assets/page-def456.js',
  'pagefind/pagefind.js',
  'pagefind/fragment/en_1.pf_fragment',
  'pagefind/index/en_2.pf_index',
  'pagefind/filter/en_3.pf_filter',
  'pagefind/wasm.en.pagefind',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/favicon.ico',
].map((path) => ({ path, content: `contents of ${path}` }));

const entries = precacheEntries(files, (content) => `hash(${String(content)})`);
const urls = entries.map((e) => e.url);

describe('precache entries', () => {
  it('include the shell pages, hashed assets, Pagefind\u2019s runtime and app files', () => {
    expect(urls).toEqual([
      '/',
      '/assets/page-def456.js',
      '/assets/site-abc123.css',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
      '/offline/',
      '/pagefind/filter/en_3.pf_filter',
      '/pagefind/pagefind.js',
      '/pagefind/wasm.en.pagefind',
      '/people/',
      '/search/',
    ]);
  });

  it('leave out article pages and index chunks (cached on use), and files never served', () => {
    for (const url of [
      '/people/luke-skywalker/',
      '/pagefind/fragment/en_1.pf_fragment',
      '/pagefind/index/en_2.pf_index',
      '/404.html',
      '/sitemap.xml',
      '/sw.js',
    ]) {
      expect(urls).not.toContain(url);
    }
  });

  it('revision content by hash, except files whose names already carry one', () => {
    expect(entries.find((e) => e.url === '/assets/site-abc123.css')?.revision).toBeNull();
    expect(entries.find((e) => e.url === '/people/')?.revision).toBe(
      'hash(contents of people/index.html)',
    );
  });
});
