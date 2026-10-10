import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { styleHashes } from '@gyral/ssr';
import {
  CACHE,
  cacheControl,
  caddyfile,
  CSP,
  headersFor,
  SPECULATION_RULES,
} from '../../src/hosting/headers.js';
import { THEME_SCRIPT } from '../../src/domain/theme.js';
import { SCRIPT_HASHES, STYLE_HASHES } from '../../src/hosting/csp-hashes.js';
import '../../src/islands/explore.js';

describe('cache policy', () => {
  it('caches hashed assets for a year and rechecks the service worker every time', () => {
    expect(cacheControl('/assets/site-abc.css', 200)).toBe(CACHE.assets);
    expect(cacheControl('/api/search', 200)).toBe(CACHE.pages);
    expect(cacheControl('/api/preview', 200)).toBe(CACHE.pages);
    expect(cacheControl('/api/preview', 404)).toBe(CACHE.notFound);
    expect(cacheControl('/api/ask', 200)).toBe(CACHE.api);
    expect(cacheControl('/icons/icon-192.png', 200)).toBe(CACHE.icons);
    expect(cacheControl('/sw.js', 200)).toBe(CACHE.serviceWorker);
  });

  it('lets Cloudflare hold pages longer than browsers do', () => {
    expect(cacheControl('/people/luke-skywalker/', 200)).toBe(CACHE.pages);
    expect(cacheControl('/sitemap.xml', 200)).toBe(CACHE.pages);
    expect(CACHE.pages).toMatch(/max-age=300, s-maxage=604800, .*stale-if-error=604800/);
  });

  it('keeps 404s short, whatever the path', () => {
    expect(cacheControl('/assets/gone.js', 404)).toBe(CACHE.notFound);
  });

  it('adds the security headers to every response', () => {
    const headers = headersFor('/', 200);
    expect(headers['Content-Security-Policy']).toBe(CSP);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(CSP).toMatch(/script-src 'self' 'sha256-[^';]+'; /);
    expect(CSP).not.toContain('wasm');
    expect(CSP).not.toContain("'unsafe-eval'");
  });
});

describe('the script policy', () => {
  it('allows the theme script by its hash, and no other inline script', () => {
    // Fails when the theme script changes: run \`pnpm caddyfile\` and commit both files.
    const hash = `'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`;
    expect(SCRIPT_HASHES).toEqual([hash]);
    expect(CSP).toContain(hash);
    expect(CSP).not.toContain("'unsafe-inline'");
  });
});

describe('hover-to-fetch', () => {
  it('points every response at the rules file, which exists and fetches only pages', async () => {
    expect(headersFor('/', 200)['Speculation-Rules']).toBe('"/speculation-rules.json"');
    expect(headersFor('/no-such-page/', 404)['Speculation-Rules']).toBeDefined();
    const rules = JSON.parse(await readFile(`public${SPECULATION_RULES.path}`, 'utf8')) as {
      prefetch: { eagerness: string; where: unknown }[];
    };
    expect(rules.prefetch[0]?.eagerness).toBe('moderate');
    expect(JSON.stringify(rules.prefetch[0]?.where)).toContain('{"not":{"href_matches":"/api/*"}}');
  });

  it('serves the rules file with the MIME type browsers require, in production too', () => {
    expect(SPECULATION_RULES.type).toBe('application/speculationrules+json');
    expect(caddyfile()).toContain(
      'header /speculation-rules.json >Content-Type "application/speculationrules+json"',
    );
    expect(caddyfile().match(/Speculation-Rules/g)).toHaveLength(2); // the main route and the 404
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
