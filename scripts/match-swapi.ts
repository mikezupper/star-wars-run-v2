/// <reference types="node" />
// `pnpm match:swapi`: matches every swapi.info record to a Wookieepedia article and reports the
// ones that don't match (swr-7f1.5). Needs the snapshot: `pnpm ingest:wookieepedia` first.
import { loadDataset } from '../src/data/load.js';
import { loadWookieepediaIndex } from '../src/data/wookieepedia.js';
import { matchSwapi, sharedTitles } from '../src/domain/merge.js';

const matches = matchSwapi(await loadDataset(), await loadWookieepediaIndex());
const unmatched = matches.filter((m) => !('title' in m));
console.log(`matched ${String(matches.length - unmatched.length)} of ${String(matches.length)}`);
for (const m of unmatched) {
  const candidate = 'candidate' in m ? ` → ${m.candidate}` : '';
  console.log(`  ${m.kind}/${m.slug} "${m.name}": ${'problem' in m ? m.problem : ''}${candidate}`);
}
for (const [title, records] of sharedTitles(matches)) {
  console.log(`  shared: "${title}" ← ${records.join(', ')}`);
}
