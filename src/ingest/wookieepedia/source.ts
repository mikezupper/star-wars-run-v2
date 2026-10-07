// Where the Wookieepedia dump is, and getting the snapshot ready before a build (swr-7f1.12).
// The snapshot is rebuilt from the dump on every machine and never stored (ADR 0007), so
// `pnpm build`, the Docker build and local CI all start here: an ingest that's a no-op when
// the snapshot already matches the dump. Nothing here downloads anything.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingest } from './ingest.js';
import type { Meta } from './snapshot.js';

/** The environment variable naming the dump; unset, it's DUMP_FILE in ~/Downloads. */
export const DUMP_ENV = 'WOOKIEEPEDIA_DUMP';
/** The environment variable capping ingest workers (each needs about 0.5 GB). */
export const WORKERS_ENV = 'WOOKIEEPEDIA_WORKERS';
export const DUMP_FILE = 'starwars_pages_current.xml.7z';
/** Where Fandom lists Wookieepedia's database dumps. */
export const DUMP_SOURCE = 'https://starwars.fandom.com/wiki/Special:Statistics';

type Env = Readonly<Record<string, string | undefined>>;

export const dumpPath = (env: Env, home: string): string =>
  env[DUMP_ENV] !== undefined && env[DUMP_ENV] !== ''
    ? env[DUMP_ENV]
    : join(home, 'Downloads', DUMP_FILE);

/** Worker count from the environment, when it's a whole number. */
export const workersFrom = (env: Env): number | undefined => {
  const n = Number(env[WORKERS_ENV]);
  return env[WORKERS_ENV] !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
};

/** What to do when there's no dump: where to get it and where to put it. */
export const missingDump = (path: string): string =>
  [
    `No Wookieepedia dump at ${path}.`,
    `Download ${DUMP_FILE} from the database dumps listed at ${DUMP_SOURCE},`,
    `then put it there or set ${DUMP_ENV} to its path. The first build ingests it (about 6.5 minutes).`,
  ].join('\n');

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Brings the snapshot in `out` up to date with the dump, building it when it's missing or
 * stale. Without the dump, an existing snapshot is used as is (with a warning): a machine that
 * ingested once can still build. Without either, this throws `missingDump`.
 */
export async function prepareSnapshot(options: {
  readonly dump: string;
  readonly out: string;
  readonly workers?: number;
  readonly log: (message: string) => void;
}): Promise<Meta> {
  if (await exists(options.dump)) {
    return ingest({
      dump: options.dump,
      out: options.out,
      log: options.log,
      ...(options.workers === undefined ? {} : { workers: options.workers }),
    });
  }
  const metaFile = join(options.out, 'meta.json');
  if (!(await exists(metaFile))) {
    throw new Error(
      `Can't build: no snapshot in ${options.out}, and no dump to make one from.\n${missingDump(options.dump)}`,
    );
  }
  const meta = JSON.parse(await readFile(metaFile, 'utf8')) as Meta;
  options.log(
    `No dump at ${options.dump}: building from the existing snapshot (dump of ${meta.source.latestRevision}), which may be stale.`,
  );
  return meta;
}
