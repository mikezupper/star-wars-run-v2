// Names to titles on the server (Ask, ADR 0010): the search title index the build writes
// (search-titles/, src/domain/titles.ts), read from disk and kept in memory once read.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Resolved } from '../domain/ask.js';
import { rankTitles, shardFor, titleOfRow, type TitleRow } from '../domain/titles.js';

/** How many titles a name may resolve to (canon and Legends, usually). */
const NAME_TITLES = 2;

export function titleResolver(dir: string): (names: readonly string[]) => Promise<Resolved[]> {
  const read = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(join(dir, file), 'utf8')) as unknown;
  let index: Promise<{ split: Set<string>; keys: Set<string> }> | undefined;
  const shards = new Map<string, Promise<TitleRow[]>>();
  return (names) => {
    index ??= read('index.json').then((i) => {
      const { split, keys } = i as { split: string[]; keys: string[] };
      return { split: new Set(split), keys: new Set(keys) };
    });
    return Promise.all(
      names.map(async (asked): Promise<Resolved> => {
        const { split, keys } = await (index as NonNullable<typeof index>);
        const file = shardFor(asked, split);
        if (file === undefined || !keys.has(file.replace(/\.json$/, '')))
          return { asked, titles: [] };
        let rows = shards.get(file);
        if (rows === undefined) {
          rows = read(file) as Promise<TitleRow[]>;
          shards.set(file, rows);
        }
        const titles = rankTitles(asked, await rows)
          .slice(0, NAME_TITLES)
          .map((r) => ({ title: titleOfRow(r), section: r[2] }));
        return { asked, titles };
      }),
    );
  };
}
