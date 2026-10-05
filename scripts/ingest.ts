/// <reference types="node" />
// `pnpm ingest`: fetch swapi.info, parse and check it, and rewrite data/. The only command
// that touches the network (docs/design-docs/0002-data.md). Commit the data/ diff it leaves.
import { KINDS } from '../src/domain/records.js';
import { DATA_DIR } from '../src/data/load.js';
import { fetchSwapi, writeSnapshot } from '../src/ingest/snapshot.js';
import { fromSwapi } from '../src/ingest/swapi.js';

const data = fromSwapi(await fetchSwapi());
await writeSnapshot(DATA_DIR, data);
console.log(
  `wrote ${DATA_DIR}: ${KINDS.map((kind) => `${String(data[kind].length)} ${kind}`).join(', ')}`,
);
