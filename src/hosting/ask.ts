// The same-origin route for Ask the archive (swr-ei6.1): the browser posts chat completions to
// /api/ask/chat/completions, and the server forwards them to the model's OpenAI-compatible
// endpoint with the key from its environment. The key never reaches the browser, the CSP keeps
// connect-src 'self', and CORS never comes into it. Caddy does this in production (see
// caddyfile() in headers.ts); the dev and preview servers call proxyAsk().

/** The one path the browser may post to. */
export const ASK_PATH = '/api/ask/chat/completions';
/** Where it goes on the endpoint (OpenAI-compatible APIs all use it). */
export const UPSTREAM_PATH = '/v1/chat/completions';
/** A question with its context is a few KB; anything far bigger isn't from the island. */
export const MAX_BODY_BYTES = 64 * 1024;

/** The environment the route reads: the endpoint's origin and its key. */
export interface AskEnv {
  readonly ASK_ORIGIN?: string | undefined;
  readonly ASK_KEY?: string | undefined;
}

const json = (status: number, message: string): Response =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Forwards one chat completion request, streaming the answer back. */
export async function proxyAsk(
  request: Request,
  env: AskEnv,
  fetchUpstream: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, 'Only POST is allowed.');
  if (!env.ASK_ORIGIN || !env.ASK_KEY) return json(503, 'Ask the archive is not configured.');
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return json(413, 'The request is too large.');
  const upstream = await fetchUpstream(new URL(UPSTREAM_PATH, env.ASK_ORIGIN), {
    method: 'POST',
    // Only these: whatever else the browser sent, its Authorization above all, stays here.
    headers: {
      'content-type': 'application/json',
      accept: request.headers.get('accept') ?? 'application/json',
      authorization: `Bearer ${env.ASK_KEY}`,
    },
    body,
    signal: request.signal,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
