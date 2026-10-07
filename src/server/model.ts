// The model, from the server (ADR 0010): an OpenAI-compatible chat endpoint, called with the key
// from the API's environment. The browser never reaches it. JSON answers for the plan and the
// SQL; a stream for the summary.
import type { Message } from '../domain/ask.js';
import { deltaText, readSse } from '../domain/ask.js';

export interface ModelSettings {
  /** The endpoint's origin; the path is /v1/chat/completions. */
  readonly origin: string;
  readonly key: string;
  readonly model: string;
}

export interface Model {
  readonly chat: (messages: Message[], schema?: object) => Promise<string>;
  readonly stream: (messages: Message[], onText: (text: string) => void) => Promise<string>;
}

export function modelClient(settings: ModelSettings, signal?: AbortSignal): Model {
  const complete = async (body: object): Promise<Response> => {
    const response = await fetch(new URL('/v1/chat/completions', settings.origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${settings.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.model, temperature: 0, ...body }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw new Error(`model: ${String(response.status)}`);
    return response;
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
