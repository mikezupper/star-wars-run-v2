import { describe, expect, it, vi } from 'vitest';
import { ASK_PATH, MAX_BODY_BYTES, proxyAsk } from '../../src/hosting/ask.js';
import { CACHE, cacheControl, caddyfile } from '../../src/hosting/headers.js';

const env = { ASK_ORIGIN: 'https://model.example', ASK_KEY: 'server-key' };
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(`https://starwars.run${ASK_PATH}`, { method: 'POST', body, headers });

describe('the /api/ask route', () => {
  it('forwards the body with the server’s key, never the browser’s', async () => {
    const upstream = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{"choices":[]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const res = await proxyAsk(
      post('{"model":"m"}', { authorization: 'Bearer stolen', cookie: 'a=b' }),
      env,
      upstream,
    );
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect((url as URL).href).toBe('https://model.example/v1/chat/completions');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer server-key');
    expect(headers.get('cookie')).toBeNull();
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"model":"m"}');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('{"choices":[]}');
  });

  it('passes the endpoint’s errors through', async () => {
    const upstream = () => Promise.resolve(new Response('nope', { status: 401 }));
    expect((await proxyAsk(post('{}'), env, upstream as typeof fetch)).status).toBe(401);
  });

  it('refuses other methods, oversized bodies, and works only when configured', async () => {
    const never = vi.fn();
    const get = new Request(`https://starwars.run${ASK_PATH}`);
    expect((await proxyAsk(get, env, never as typeof fetch)).status).toBe(405);
    const big = post('x'.repeat(MAX_BODY_BYTES + 1));
    expect((await proxyAsk(big, env, never as typeof fetch)).status).toBe(413);
    const res = await proxyAsk(post('{}'), { ASK_ORIGIN: env.ASK_ORIGIN }, never as typeof fetch);
    expect(res.status).toBe(503);
    expect(never).not.toHaveBeenCalled();
  });

  it('is never cached, and Caddy proxies it with the key from its environment', () => {
    expect(cacheControl(ASK_PATH, 200)).toBe(CACHE.api);
    expect(caddyfile()).toContain('header_up Authorization "Bearer {$ASK_KEY}"');
    expect(caddyfile()).toContain(`path ${ASK_PATH}`);
  });
});
