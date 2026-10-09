// The model, from the server (ADR 0010): an OpenAI-compatible chat endpoint, called with the key
// from the API's environment. The browser never reaches it. JSON answers for the plan and the
// SQL; a stream for the summary. A call that fails the way a busy or restarting service does
// (no answer, 429, 5xx) is tried once more after a short wait; the error says why it failed, so
// the server's log does too (swr-ddp).
import type { Message } from '../domain/ask.js';
import { deltaText, readSse } from '../domain/ask.js';

export interface ModelSettings {
  /** The endpoint's origin; the path is /v1/chat/completions. */
  readonly origin: string;
  readonly key: string;
  readonly model: string;
  /** How long to wait before the one retry; tests set 0. */
  readonly retryMs?: number;
}

/** The wait before a retry, unless the service asks for a longer one it's worth waiting for. */
export const RETRY_MS = 1_000;
/** A Retry-After longer than this isn't waited for: the question would take too long. */
const MAX_RETRY_AFTER_MS = 5_000;

/** Why a call to the model failed: the HTTP status, if there was an answer, and what it said. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ModelError';
  }
}

/** Worth trying again: no answer at all, too many requests, or the service's own failure. */
const transient = (error: ModelError): boolean =>
  error.status === undefined || error.status === 429 || error.status >= 500;

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Retry-After in milliseconds, when it's a number of seconds; else undefined. */
const retryAfterMs = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

export interface Model {
  readonly chat: (messages: Message[], schema?: object) => Promise<string>;
  readonly stream: (messages: Message[], onText: (text: string) => void) => Promise<string>;
}

export function modelClient(settings: ModelSettings, signal?: AbortSignal): Model {
  /** One call: the answer, or a ModelError saying why there isn't one. */
  const once = async (
    body: object,
  ): Promise<{ response: Response } | { error: ModelError; after?: number }> => {
    let response: Response;
    try {
      response = await fetch(new URL('/v1/chat/completions', settings.origin), {
        method: 'POST',
        headers: { authorization: `Bearer ${settings.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: settings.model, temperature: 0, ...body }),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (cause) {
      // Stopped on purpose (the time limit, or the visitor left): not the model's failure.
      if (signal?.aborted === true) throw cause;
      // fetch's own message is "fetch failed"; the network's reason (ECONNREFUSED, a DNS
      // failure, a reset) is its cause.
      const inner =
        cause instanceof Error
          ? (cause.cause as { code?: string; message?: string } | undefined)
          : undefined;
      const why = `${cause instanceof Error ? cause.message : String(cause)}${inner?.code !== undefined ? ` (${inner.code})` : inner?.message !== undefined ? ` (${inner.message})` : ''}`;
      return {
        error: new ModelError(`model: no answer from ${settings.origin}: ${why}`, undefined, {
          cause,
        }),
      };
    }
    if (response.ok) return { response };
    const text = (await response.text().catch(() => '')).trim().slice(0, 200);
    const after = retryAfterMs(response);
    return {
      error: new ModelError(
        `model: HTTP ${String(response.status)}${response.statusText === '' ? '' : ` ${response.statusText}`}${text === '' ? '' : `: ${text}`}`,
        response.status,
      ),
      ...(after === undefined ? {} : { after }),
    };
  };
  const complete = async (body: object): Promise<Response> => {
    const first = await once(body);
    if ('response' in first) return first.response;
    if (!transient(first.error) || (first.after ?? 0) > MAX_RETRY_AFTER_MS) throw first.error;
    await wait(Math.max(settings.retryMs ?? RETRY_MS, first.after ?? 0), signal);
    const second = await once(body);
    if ('response' in second) return second.response;
    throw new ModelError(
      `${second.error.message} (after a retry; first: ${first.error.message})`,
      second.error.status,
      {
        cause: second.error.cause ?? first.error,
      },
    );
  };
  return {
    chat: async (messages, schema) => {
      const response = await complete({
        messages,
        ...(schema === undefined
          ? {}
          : { response_format: { type: 'json_schema', json_schema: schema } }),
      });
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? '';
    },
    stream: async (messages, onText) => {
      const response = await complete({ messages, stream: true });
      if (response.body === null) return '';
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const { data, rest } = readSse(buffer + value);
        buffer = rest;
        for (const payload of data) text += deltaText(payload);
        onText(text);
      }
      return text;
    },
  };
}
