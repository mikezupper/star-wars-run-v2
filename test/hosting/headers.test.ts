import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { styleHashes } from '@gyral/core/server';
import { CACHE, cacheControl, caddyfile, CSP, headersFor } from '../../src/hosting/headers.js';
import { STYLE_HASHES } from '../../src/hosting/style-hashes.js';
import '../../src/islands/explore.js';
import '../../src/islands/site-search.js';

describe('cache policy', () => {
  it('caches hashed assets for a year and rechecks the service worker every time', () => {
    expect(cacheControl('/assets/site-abc.css', 200)).toBe(CACHE.assets);
    expect(cacheControl('/pagefind/fragment/en_1a2b.pf_fragment', 200)).toBe(CACHE.assets);
    expect(cacheControl('/pagefind/pagefind-entry.json', 200)).toBe(CACHE.pages);
    expect(cacheControl('/icons/icon-192.png', 200)).toBe(CACHE.icons);
    expect(cacheControl('/sw.js', 200)).toBe(CACHE.serviceWorker);
  });

  it('lets Cloudflare hold pages longer than browsers do', () => {
    expect(cacheControl('/people/luke-skywalker/', 200)).toBe(CACHE.pages);
    expect(cacheControl('/pagefind/pagefind.js', 200)).toBe(CACHE.pages);
    expect(CACHE.pages).toMatch(/max-age=300, s-maxage=3600/);
  });

  it('keeps 404s short, whatever the path', () => {
    expect(cacheControl('/assets/gone.js', 404)).toBe(CACHE.notFound);
  });

  it('adds the security headers to every response', () => {
    const headers = headersFor('/', 200);
    expect(headers['Content-Security-Policy']).toBe(CSP);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(CSP).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(CSP).not.toContain("'unsafe-eval'");
  });
});

describe('the style policy', () => {
  it('allows exactly the islands\u2019 styles by hash, and no other inline style', async () => {
    // Fails when an island's CSS changes: run \`pnpm caddyfile\` and commit both files.
    expect(STYLE_HASHES).toEqual([...(await styleHashes())].sort());
    expect(CSP).toContain(`style-src 'self' ${STYLE_HASHES.join(' ')};`);
    expect(CSP).not.toContain('unsafe-inline');
  });
});

describe('Caddyfile', () => {
  it('is what `pnpm caddyfile` generates (run it after changing the policy)', async () => {
    const committed = await readFile(new URL('../../Caddyfile', import.meta.url), 'utf8');
    expect(committed).toBe(caddyfile());
  });

  it('carries every cache rule and the CSP', () => {
    const config = caddyfile();
    for (const value of Object.values(CACHE)) expect(config).toContain(`"${value}"`);
    expect(config).toContain(`Content-Security-Policy "${CSP}"`);
  });
});
