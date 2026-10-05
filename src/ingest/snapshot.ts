// Fetching from swapi.info and writing the snapshot to data/. The network and the disk stay
// here so fromSwapi() remains a pure function the tests can call directly.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KINDS, type Dataset } from '../domain/records.js';
import { fileFor, META_FILE, SNAPSHOT_VERSION, type SnapshotMeta } from '../domain/snapshot.js';
import { SWAPI_BASE, type RawCollections } from './swapi.js';

/** Fetches all six collections. `fetchJson` is injectable for tests. */
export async function fetchSwapi(
  fetchJson: (url: string) => Promise<unknown> = getJson,
): Promise<RawCollections> {
  const entries = await Promise.all(
    KINDS.map(async (kind) => [kind, await fetchJson(new URL(kind, SWAPI_BASE).href)] as const),
  );
  return Object.fromEntries(entries) as RawCollections;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`GET ${url}: ${String(response.status)} ${response.statusText}`);
  return response.json();
}

/**
 * The snapshot as file name → contents. Stable output: the same data always produces the
 * same bytes, so a diff in data/ means the source changed.
 */
export function snapshotFiles(data: Dataset): ReadonlyMap<string, string> {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const meta: SnapshotMeta = { version: SNAPSHOT_VERSION, sources: [SWAPI_BASE] };
  return new Map([
    [META_FILE, json(meta)],
    ...KINDS.map((kind) => [fileFor(kind), json(data[kind])] as const),
  ]);
}

export async function writeSnapshot(dir: string, data: Dataset): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [name, contents] of snapshotFiles(data)) {
    await writeFile(join(dir, name), contents);
  }
}
