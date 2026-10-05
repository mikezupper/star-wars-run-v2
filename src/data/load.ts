// Reads the committed snapshot in data/. The files are this repo's own ingest output, already
// parsed and checked, so they're trusted as domain records; only the version is checked.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, type Dataset } from '../domain/records.js';
import { fileFor, META_FILE, SNAPSHOT_VERSION, type SnapshotMeta } from '../domain/snapshot.js';

/** The repo's data/ directory. */
export const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, 'utf8')) as unknown;

export async function loadDataset(dir: string = DATA_DIR): Promise<Dataset> {
  const meta = (await readJson(join(dir, META_FILE))) as SnapshotMeta;
  if (meta.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `data/ holds snapshot version ${String(meta.version)}, but the code expects ${String(SNAPSHOT_VERSION)}. Run \`pnpm ingest\`.`,
    );
  }
  const entries = await Promise.all(
    KINDS.map(async (kind) => [kind, await readJson(join(dir, fileFor(kind)))] as const),
  );
  return Object.fromEntries(entries) as unknown as Dataset;
}
