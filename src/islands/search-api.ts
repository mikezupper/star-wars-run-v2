// One lane per search control: a new edit cancels the debounce and any older request.
import { command, defineDriver, type Command } from '@gyral/core';
import type { Results } from '../domain/search.js';
import type { Section } from '../domain/sections.js';

export interface Lookup {
  readonly query: string;
  readonly section: Section | undefined;
}

export const searchDriver = defineDriver<Lookup, Results>({
  name: 'search-suggestions',
  concurrency: 'switch',
  run: async ({ query, section }, { signal }) => {
    if (query === '') return { query, results: [] };
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, 150);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    });
    signal.throwIfAborted();
    const params = new URLSearchParams({ q: query });
    if (section !== undefined) params.set('section', section);
    const response = await fetch(`/api/search?${params.toString()}`, { signal });
    if (!response.ok) throw new Error('Search unavailable');
    return (await response.json()) as Results;
  },
});

export const lookup = <M>(
  input: Lookup,
  found: (results: Results) => M,
  failed: () => M,
): Command<M> => command(searchDriver, input, { onSuccess: found, onFailure: failed });
