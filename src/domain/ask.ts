// Ask the archive (swr-ei6): a plain-English question becomes one read-only SQL query over
// Explore's tables, and its rows become a short answer. An OpenAI-compatible model does the
// language; everything it's given and everything it returns passes through here. Pure: the
// server pipeline (src/domain/ask-pipeline.ts) does the calls, name lookups and query.
//
// The steps: plan (which names does the question mention?), resolve (SQLite search turns
// "the rebels" into "Alliance to Restore the Republic"), write SQL (with those exact titles),
// check and run it, summarize the rows.
import type { ArchiveRow, FactRow } from './rows.js';
import { SECTIONS, type Section } from './sections.js';
import { summaryInformation } from './ask-summary.js';

/** A chat message, as the OpenAI chat API takes it. */
export interface Message {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * What each section holds, most common first, written by the build from the data
 * (dist-api/ask-schema.json): its infobox kinds (archive.kind) and its facts' fields.
 */
export interface AskSchema {
  readonly kinds: Readonly<Partial<Record<Section, readonly string[]>>>;
  readonly fields: Readonly<Partial<Record<Section, readonly string[]>>>;
}

/**
 * Whether a search reads like a question for Ask the archive rather than a name: it starts with
 * a question word, or ends with "?". The search page then offers to ask it (swr-ei6.4).
 */
export const looksLikeQuestion = (text: string): boolean => {
  const t = text.trim();
  return (
    t.split(/\s+/).length >= 2 &&
    (t.endsWith('?') ||
      /^(who|whom|whose|which|what|when|where|why|how|list|show|name|is|are|was|were|did|does|do|can)\b/i.test(
        t,
      ))
  );
};

/** Ask the archive's page, asking `question` on arrival. */
export const askPath = (question: string): string =>
  `/explore/?ask=${encodeURIComponent(question.trim())}`;

/** How many kinds and fields per section the model is told about. */
export const SCHEMA_TOP = 30;

/** Each section's commonest kinds and facts' fields, counted by article, from Explore's rows. */
export function askSchema(
  archive: readonly ArchiveRow[],
  facts: readonly FactRow[],
  top = SCHEMA_TOP,
): AskSchema {
  const sectionOf = new Map(archive.map((r) => [r.title, r.section as Section]));
  const kinds = new Map<Section, Map<string, number>>();
  const fields = new Map<Section, Map<string, Set<string>>>();
  for (const r of archive) {
    if (r.kind === null) continue;
    const counts = kinds.get(r.section as Section) ?? new Map<string, number>();
    counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    kinds.set(r.section as Section, counts);
  }
  for (const f of facts) {
    const section = sectionOf.get(f.title);
    if (section === undefined) continue;
    const byField = fields.get(section) ?? new Map<string, Set<string>>();
    byField.set(f.field, (byField.get(f.field) ?? new Set()).add(f.title));
    fields.set(section, byField);
  }
  const best = (counts: Iterable<[string, number]>) =>
    [...counts]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, top)
      .map(([name]) => name);
  const ordered = <T>(m: Map<Section, T>, f: (v: T) => string[]) =>
    Object.fromEntries(SECTIONS.filter((s) => m.has(s)).map((s) => [s, f(m.get(s) as T)]));
  return {
    kinds: ordered(kinds, (c) => best(c)),
    fields: ordered(fields, (c) => best([...c].map(([k, v]) => [k, v.size]))),
  };
}

/** A name from the question, matched to the archive's titles (best first; none if no match). */
export interface Resolved {
  readonly asked: string;
  readonly titles: readonly { readonly title: string; readonly section: Section }[];
}

/** An earlier question in the conversation, for follow-ups ("only canon"). */
export interface Turn {
  readonly question: string;
  readonly sql: string;
  readonly looksFor?: string;
}

/** What `plan` returns. */
export interface Plan {
  readonly names: readonly string[];
}

/** What `writeSql` returns. */
export interface Query {
  readonly sql: string;
  /** What the query looks for, in a few plain words ("Wookiees in the Rebel Alliance"). */
  readonly looksFor: string;
}

/** JSON schemas for structured output (`response_format: json_schema`). */
export const PLAN_SCHEMA = {
  name: 'plan',
  strict: true,
  schema: {
    type: 'object',
    properties: { names: { type: 'array', items: { type: 'string' } } },
    required: ['names'],
    additionalProperties: false,
  },
} as const;

export const QUERY_SCHEMA = {
  name: 'query',
  strict: true,
  schema: {
    type: 'object',
    properties: { sql: { type: 'string' }, looksFor: { type: 'string' } },
    required: ['sql', 'looksFor'],
    additionalProperties: false,
  },
} as const;

/** The most rows an answer lists; one more is fetched to know whether there were more. */
export const MAX_ROWS = 200;

const PLAN_SYSTEM = `You read questions about Star Wars for a search engine over Wookieepedia.
List every proper name in the question: characters, species, planets, organizations, ships,
vehicles, events, films, books, series. Write each the way the question does, or its usual full
name if the question abbreviates it ("the rebels" → "Rebel Alliance", "ESB" → "The Empire
Strikes Back"). Leave out generic words (Jedi as a role is a name: include it). Answer in JSON.`;

export function planMessages(question: string, history: readonly Turn[] = []): Message[] {
  const context =
    history.length === 0
      ? ''
      : `Earlier questions: ${history.map((t) => t.question).join(' / ')}\n`;
  return [
    { role: 'system', content: PLAN_SYSTEM },
    { role: 'user', content: `${context}Question: ${question}` },
  ];
}

const TABLES = `Tables (DuckDB SQL):
- archive(title, name, path, section, kind, era, links, height_m, mass_kg, length_m, wingspan_m,
  depth_m, diameter_km, population, crew, passengers, cost_credits, max_speed_kph, mglt,
  hyperdrive_class, day_hours, year_days). One row per article. title is the exact article
  title ("Luke Skywalker/Legends" for the Legends article); name is the display name; path is
  its page; kind is its infobox type (Droid, Movie, Battle…: see "Kinds"); era is 'canon' or
  'legends'; links is how many articles link to it (how well known it is); the number columns
  are NULL when unknown (metric units).
- facts(title, field, item, text, link). One row per infobox value: field is the infobox field
  (species, affiliation, homeworld…), item its position from 0, text the value as written,
  link the exact title of the article it links to (NULL if none).
- appearances(title, item, text, link, markers, noncanon). For a work (section 'media'): who
  and what appears in it (link = the character's title). For anything else: the works it
  appears in (link = the work's title). markers: comma-separated codes such as 1st (first
  appearance), mo (mentioned only), flash (flashback). noncanon: boolean.
Sections: ${SECTIONS.join(', ')}.`;

const RULES = `Rules:
- Write exactly one SELECT (or WITH … SELECT). No other statements, no semicolons.
- When listing articles, the first three columns are a.name, a.path and a.era, from archive
  a, then whatever answers the question (a number, the fact's text).
- Match names only through the exact titles given under "Names", comparing with = or IN on
  facts.link, appearances.link or archive.title. Never compare names with LIKE.
- For each condition on a fact, use EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND
  f.field = '…' AND f.link IN ('…', '…')), so an article with many values counts once. When a
  name has two titles (canon and Legends), put both in one IN list: never join EXISTS with OR.
- An article's own facts (Anakin's children, the Falcon's owners): FROM facts f JOIN archive a
  ON a.title = f.link WHERE f.title IN (…) AND f.field = '…'.
- Kinds of thing (droids, films, battles) are archive.kind values, not facts.
- "Who…" asks about people: list characters (a.section = 'characters') unless the question
  names something else (ships, planets).
- Works by a person (written, drawn, directed, published by): media whose author, writer,
  artist, director or publisher fact links to that person.
- Include canon and Legends unless the question names one (era = 'canon' / 'legends').
- To count, return one column named count. For "tallest", "biggest" and the like, skip NULLs
  and ORDER BY the number DESC. Otherwise ORDER BY a.links DESC, a.name (best known first).
- No LIMIT unless the question asks for a number of results ("the 10 biggest", "the most").
- Earlier questions in the conversation matter only for a follow-up ("only canon", "and their
  homeworlds?"). A question that stands on its own starts fresh: drop the earlier conditions.
- Keep parentheses balanced; prefer IN lists over nested OR.`;

const EXAMPLE = `Example. Question: "Which Wookiees fought for the Rebel Alliance?"
Names: Wookiee → "Wookiee" (species); Rebel Alliance → "Alliance to Restore the Republic" (organizations).
SQL: SELECT a.name, a.path, a.era FROM archive a WHERE a.section = 'characters'
AND EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND f.field = 'species' AND f.link = 'Wookiee')
AND EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND f.field = 'affiliation' AND f.link = 'Alliance to Restore the Republic')
ORDER BY a.links DESC, a.name

Example. Question: "Who are Anakin Skywalker's children?"
Names: Anakin Skywalker → "Anakin Skywalker" (characters) or "Anakin Skywalker/Legends" (characters).
SQL: SELECT a.name, a.path, a.era FROM facts f JOIN archive a ON a.title = f.link
WHERE f.title IN ('Anakin Skywalker', 'Anakin Skywalker/Legends') AND f.field = 'children'
ORDER BY a.links DESC, a.name

Example. Question: "Which droids appear in A New Hope?"
Names: A New Hope → "Star Wars: Episode IV A New Hope" (media).
SQL: SELECT DISTINCT a.name, a.path, a.era FROM appearances ap JOIN archive a ON a.title = ap.link
WHERE ap.title = 'Star Wars: Episode IV A New Hope' AND a.kind = 'Droid' AND NOT ap.noncanon
ORDER BY a.links DESC, a.name

Example. Question: "Which TV episodes does Ahsoka Tano appear in?"
Names: Ahsoka Tano → "Ahsoka Tano" (characters) or "Ahsoka Tano/Legends" (characters).
SQL: SELECT DISTINCT a.name, a.path, a.era FROM appearances ap JOIN archive a ON a.title = ap.link
WHERE ap.title IN ('Ahsoka Tano', 'Ahsoka Tano/Legends') AND a.kind = 'TelevisionEpisode'
ORDER BY a.links DESC, a.name

Example. Question: "Which starships did Sienar Fleet Systems make?"
Names: Sienar Fleet Systems → "Sienar Fleet Systems" (organizations).
SQL: SELECT a.name, a.path, a.era FROM archive a WHERE a.section = 'starships'
AND EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND f.field = 'manufacturer'
AND f.link IN ('Sienar Fleet Systems'))
ORDER BY a.links DESC, a.name

The direction matters. facts.title is the article the fact is on; facts.link is what it points
at. "Sienar's ships" are ships whose manufacturer fact points at Sienar, not Sienar's own facts;
"Anakin's children" are Anakin's own children fact. Likewise appearances.title is the article
whose list it is, appearances.link the entry in that list.`;

const bySection = (lists: AskSchema['fields']): string =>
  Object.entries(lists)
    .map(([section, names]) => `- ${section}: ${names.join(', ')}`)
    .join('\n');

const nameList = (resolved: readonly Resolved[]): string =>
  resolved.length === 0
    ? 'none'
    : resolved
        .map((r) =>
          r.titles.length === 0
            ? `${r.asked} → no article found (don't filter on it by title)`
            : `${r.asked} → ${r.titles.map((t) => `"${t.title}" (${t.section})`).join(' or ')}`,
        )
        .join('\n');

export function sqlMessages(
  question: string,
  resolved: readonly Resolved[],
  schema: AskSchema,
  history: readonly Turn[] = [],
  failed?: { readonly sql: string; readonly error: string },
): Message[] {
  const earlier = history.flatMap((t): Message[] => [
    { role: 'user', content: `Question: ${t.question}` },
    { role: 'assistant', content: JSON.stringify({ sql: t.sql, looksFor: t.looksFor ?? '' }) },
  ]);
  const retry: Message[] =
    failed === undefined
      ? []
      : [
          { role: 'assistant', content: JSON.stringify({ sql: failed.sql, looksFor: '' }) },
          { role: 'user', content: `That query failed: ${failed.error}\nWrite a corrected query.` },
        ];
  return [
    {
      role: 'system',
      content: `You turn questions about Star Wars into one SQL query over this archive of Wookieepedia.\n\n${TABLES}\n\nKinds per section:\n${bySection(schema.kinds)}\n\nCommon fields per section:\n${bySection(schema.fields)}\n\n${RULES}\n\n${EXAMPLE}\n\nAnswer in JSON: sql, and looksFor: a few plain words saying what the query looks for, as a reader would put it ("Obi-Wan Kenobi's masters"), never naming fields or tables, never empty.`,
    },
    ...earlier,
    { role: 'user', content: `Question: ${question}\nNames:\n${nameList(resolved)}` },
    ...retry,
  ];
}

/**
 * The query, checked and capped: one SELECT or WITH, at most MAX_ROWS rows. The database is
 * read-only anyway; this keeps a confused answer from running something pointless or huge.
 */
export function checkSql(
  sql: string,
  limit = MAX_ROWS + 1,
): { readonly sql: string } | { readonly error: string } {
  const body = sql.trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(body))
    return { error: 'The query must start with SELECT or WITH.' };
  // Quoted text can hold anything; look at the rest.
  const bare = body.replace(/'(?:[^']|'')*'/g, "''");
  if (bare.includes(';')) return { error: 'Only one statement is allowed.' };
  let depth = 0;
  for (const ch of bare) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (depth < 0) break;
  }
  if (depth !== 0) return { error: 'The parentheses are unbalanced.' };
  return { sql: `SELECT * FROM (${body}) AS answer LIMIT ${String(limit)}` };
}

const SUMMARY_SYSTEM = `You answer questions about Star Wars from a database query
over Wookieepedia. The supplied data is the answer: say what it shows. A value is the answer even when
it reads oddly ("Yoda's species" is the name of Yoda's species).
Write one or two short, plain sentences. Use only the supplied answer data: never add facts,
names or numbers that aren't in it. Name at most three example subjects.
For kind=subjects, state the supplied count and mention only the supplied examples, if useful.
The count already agrees with the table's canon/Legends grouping: never count the examples
as the total. If countIsLowerBound is true, say "at least"; never claim an exact total or
"more than" that number. If the count is zero, say nothing matched.
For kind=values, answer using the actual values (including counts, measurements and categories).
Never replace an aggregate value with the number of rows. If values is empty, say nothing matched.
If truncated is true, make clear the answer is incomplete.
The query shows which fact matched. When that fact's word is broader than the question's (the
question says "wife", the query matched "partners"), use the fact's word: "Han Solo's
partners", not "his wives".
No lists, no markdown. Say what the answer is, not where it came from: never begin with "The
query", "The rows" or "The results".`;

export function summaryMessages(
  question: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  truncated: boolean,
  sql = '',
): Message[] {
  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    {
      role: 'user',
      content: `Question: ${question}\n${sql === '' ? '' : `Query: ${sql}\n`}Answer data:\n${JSON.stringify(summaryInformation(columns, rows, truncated))}`,
    },
  ];
}

/** Finds the JSON in a reply; models sometimes wrap it in prose or a code fence. */
export function parseJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(content.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A plan, if the reply is one: names as strings (anything else is dropped). */
export function asPlan(content: string): Plan | undefined {
  const v = parseJson(content);
  if (!isRecord(v) || !Array.isArray(v['names'])) return undefined;
  return { names: v['names'].filter((n): n is string => typeof n === 'string' && n.trim() !== '') };
}

/** A query, if the reply is one: SQL as a string, and what it looks for. */
export function asQuery(content: string): Query | undefined {
  const v = parseJson(content);
  if (!isRecord(v) || typeof v['sql'] !== 'string') return undefined;
  return { sql: v['sql'], looksFor: typeof v['looksFor'] === 'string' ? v['looksFor'] : '' };
}

/**
 * Server-sent events from a streamed completion: the complete `data:` payloads in `buffer`, and
 * what's left over for the next chunk. `[DONE]` ends the stream and isn't returned.
 */
export function readSse(buffer: string): { readonly data: string[]; readonly rest: string } {
  const events = buffer.split(/\r?\n\r?\n/);
  const rest = events.pop() ?? '';
  const data = events
    .flatMap((event) => event.split(/\r?\n/))
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((payload) => payload !== '' && payload !== '[DONE]');
  return { data, rest };
}

/** The text a streamed chunk adds, or '' for a chunk without any (or one that won't parse). */
export function deltaText(payload: string): string {
  const v = parseJson(payload);
  if (!isRecord(v) || !Array.isArray(v['choices'])) return '';
  const first: unknown = v['choices'][0];
  if (!isRecord(first) || !isRecord(first['delta'])) return '';
  const content = first['delta']['content'];
  return typeof content === 'string' ? content : '';
}
