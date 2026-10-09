import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelError, modelClient } from '../../src/server/model.js';

const settings = { origin: 'https://model.example', key: 'k', model: 'm', retryMs: 0 };
const answer = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { 'content-type': 'application/json' },
  });

/** A fake fetch that answers with each of `replies` in turn, and counts its calls. */
function replies(...rs: (Response | Error)[]) {
  const fetch = vi.fn(() => {
    const next = rs.shift();
    if (next === undefined) throw new Error('more calls than replies');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const chat = (signal?: AbortSignal) =>
  modelClient(settings, signal).chat([{ role: 'user', content: 'hi' }]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the model client', () => {
  it('tries once more after a 503, a 429 or no answer, and answers', async () => {
    for (const first of [
      new Response('busy', { status: 503 }),
      new Response('slow down', { status: 429 }),
      new TypeError('fetch failed'),
    ]) {
      const fetch = replies(first, answer('ok'));
      expect(await chat()).toBe('ok');
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });

  it("doesn't retry a request the service refused, and says why", async () => {
    const fetch = replies(new Response('bad key', { status: 401, statusText: 'Unauthorized' }));
    const error = await chat().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).status).toBe(401);
    expect((error as Error).message).toBe('model: HTTP 401 Unauthorized: bad key');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after the one retry, naming both failures', async () => {
    const fetch = replies(new TypeError('fetch failed'), new Response('down', { status: 502 }));
    const message = await chat().catch((e: unknown) => (e as Error).message);
    expect(message).toBe(
      'model: HTTP 502: down (after a retry; first: model: no answer from https://model.example: fetch failed)',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("names the network's reason when there's no answer", async () => {
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    replies(refused, refused);
    await expect(chat()).rejects.toThrow(
      'no answer from https://model.example: fetch failed (ECONNREFUSED)',
    );
  });

  it("doesn't wait for a Retry-After longer than a question can take", async () => {
    const fetch = replies(new Response('later', { status: 503, headers: { 'retry-after': '60' } }));
    await expect(chat()).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a question that was stopped", async () => {
    const stop = new AbortController();
    stop.abort('slow');
    const fetch = replies(new DOMException('aborted', 'AbortError'));
    await expect(chat(stop.signal)).rejects.toThrow('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
