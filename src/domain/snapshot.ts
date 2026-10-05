// The snapshot layout in data/, shared by the writer (src/ingest) and the reader (src/data).
import type { Kind } from './records.js';

/** Bump when the record shape changes, and re-run `pnpm ingest`. */
export const SNAPSHOT_VERSION = 1;

export interface SnapshotMeta {
  readonly version: number;
  /** Where the records came from, e.g. `https://swapi.info/api/`. */
  readonly sources: readonly string[];
}

export const META_FILE = 'meta.json';

/** One JSON array per kind: `people.json`. */
export const fileFor = (kind: Kind): string => `${kind}.json`;
