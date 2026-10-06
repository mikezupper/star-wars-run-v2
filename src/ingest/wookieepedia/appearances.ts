// An article's Appearances section (swr-7f1.13): the works its subject appears in, replacing
// swapi.info's film links (ADR 0008). The section is a list, often wrapped in {{ScrollBox}}, so it
// is read line by line: each `*` line is one work, `===` subheadings mark non-canon blocks. Each
// line is parsed on its own to find the work (its first link, or a citation template's title)
// and the markers after it ({{1st}}, {{Mo}}, {{Flash}}…). Titles are resolved later
// (links.ts), so a line keeps every candidate title in order.
import Parser from 'wikiparser-node';
import { decodeEntities } from './wikitext.js';

/** A work before link resolution: what to show, and the titles that might be its article. */
export interface ParsedAppearance {
  readonly text: string;
  readonly candidates: readonly string[];
  readonly markers: readonly string[];
  readonly noncanon?: true;
}

interface Node {
  readonly type: string;
  readonly name?: string;
  readonly data?: string;
  readonly childNodes: readonly Node[];
}

/** {{Film|IV}} and {{Film|4}} → the film's article. */
const FILMS: Readonly<Record<string, string>> = {
  I: 'Star Wars: Episode I The Phantom Menace',
  II: 'Star Wars: Episode II Attack of the Clones',
  III: 'Star Wars: Episode III Revenge of the Sith',
  IV: 'Star Wars: Episode IV A New Hope',
  V: 'Star Wars: Episode V The Empire Strikes Back',
  VI: 'Star Wars: Episode VI Return of the Jedi',
  VII: 'Star Wars: Episode VII The Force Awakens',
  VIII: 'Star Wars: Episode VIII The Last Jedi',
  IX: 'Star Wars: Episode IX The Rise of Skywalker',
};
const ARABIC = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Templates that take only an episode numeral: {{Film|IV}}, {{VaderImmortal|II}}. */
const NUMBERED: Readonly<Record<string, (numeral: string) => string | undefined>> = {
  film: (n) => FILMS[n],
  vaderimmortal: (n) =>
    ['I', 'II', 'III'].includes(n) ? `Vader Immortal – Episode ${n}` : undefined,
};

/** Marker templates: how the subject appears. Stored as lower-case codes. */
export const MARKERS = new Set([
  '1st',
  '1stm',
  '1stp',
  '1stid',
  'mo',
  'imo',
  'flash',
  'hologram',
  'po',
  'voice',
  'vision',
  'ghost',
  'ret',
  'un',
  'nc',
  'co',
  'cutscene',
  'unborn',
  'del',
  'codex',
  'mentioned',
]);

/**
 * Named template parameters that may name the work, best first (`int` is the article a citation
 * links to). After them come the positional ones, minus issue numbers, URL paths and video IDs:
 * {{JournalCite|11|Spare Parts (short story)}}, {{HoloNetNewsWeb|50|news/1344_1.html|Senator
 * Moe Killed in Blast}}, {{YouTube|f2VmOqjV_7Q|Family Reunion – and Farewell}}.
 */
const TITLE_PARAMS = ['int', 'story', 'title', 'episode', 'book', 'comic', 'game', 'text', 'name'];

const notATitle = (value: string): boolean =>
  /^\d+$/.test(value) ||
  /\/|\.html?$/.test(value) ||
  (/^[\w-]{11}$/.test(value) && /[\d_]/.test(value));

/** "Destiny (The Clone Wars)" → "Destiny": a template's title is an article name, not a label. */
const undisambiguate = (title: string): string => title.replace(/\s+\([^()]*\)$/, '');

const templateName = (node: Node): string => (node.name ?? '').replace(/^Template:/, '').trim();

function params(node: Node): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of node.childNodes.filter((c) => c.type === 'parameter')) {
    const value = p.childNodes.find((c) => c.type === 'parameter-value');
    if (value !== undefined) out.set((p.name ?? '').trim(), plain(value.childNodes).trim());
  }
  return out;
}

/** What a run of nodes shows: text, link labels, nothing for markup. */
function plain(nodes: readonly Node[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.data ?? '';
      if (n.type === 'link') {
        const label = n.childNodes.find((c) => c.type === 'link-text');
        const target = n.childNodes.find((c) => c.type === 'link-target');
        return plain((label ?? target)?.childNodes ?? []).split('#')[0] ?? '';
      }
      if (n.type === 'quote' || n.type === 'comment' || n.type === 'ext' || n.type === 'template')
        return '';
      return plain(n.childNodes);
    })
    .join('');
}

const linkTarget = (node: Node): string => {
  const target = node.childNodes.find((c) => c.type === 'link-target');
  return (
    plain(target?.childNodes ?? [])
      .split('#')[0]
      ?.trim() ?? ''
  );
};

/** One `*` line → the work it names, or `undefined` when it names none. */
export function parseAppearanceLine(line: string, noncanon: boolean): ParsedAppearance | undefined {
  const root = Parser.parse(line.replace(/^\*+\s*/, '')) as unknown as Node;
  const nodes = root.childNodes;
  const markers = nodes
    .filter((n) => n.type === 'template' && MARKERS.has(templateName(n).toLowerCase()))
    .map((n) => templateName(n).toLowerCase());
  // The work is the first link or non-marker template; quote marks and spaces don't count.
  const head = nodes.find(
    (n) =>
      (n.type === 'link' && !/^(File|Image|Category):/i.test(linkTarget(n))) ||
      (n.type === 'template' && !MARKERS.has(templateName(n).toLowerCase())),
  );
  if (head === undefined) return undefined;
  let text: string;
  let candidates: string[];
  if (head.type === 'link') {
    candidates = [linkTarget(head)];
    text = plain([head]).trim();
  } else {
    const name = templateName(head);
    const p = params(head);
    const numbered = NUMBERED[name.toLowerCase()];
    if (numbered !== undefined) {
      const code = (p.get('1') ?? '').toUpperCase();
      const work = numbered(code) ?? numbered(ARABIC[Number(code)] ?? '');
      candidates = work === undefined ? [] : [work];
      text = work ?? '';
    } else {
      const positional = [...p]
        .filter(([k, v]) => /^\d+$/.test(k) && !notATitle(v))
        .map(([, v]) => v);
      candidates = [...TITLE_PARAMS.map((k) => p.get(k) ?? ''), ...positional].filter(
        (v) => v !== '',
      );
      text = undisambiguate(candidates[0] ?? '');
    }
  }
  text = decodeEntities(text).replace(/\s+/g, ' ').trim();
  candidates = candidates.map(decodeEntities);
  if (text === '' && candidates.length === 0) return undefined;
  return { text, candidates, markers, ...(noncanon ? { noncanon: true as const } : {}) };
}

/** The Appearances section's raw text, or '' when the article has none. */
export function appearancesSection(wikitext: string): string {
  const match = /^==\s*Appearances\s*==\s*$([\s\S]*?)(?=^==[^=]|(?![\s\S]))/m.exec(wikitext);
  return match?.[1] ?? '';
}

/** Every work in the article's Appearances section, in order. */
export function parseAppearances(wikitext: string): readonly ParsedAppearance[] {
  const out: ParsedAppearance[] = [];
  let noncanon = false;
  for (const line of appearancesSection(wikitext).split('\n')) {
    const heading = /^===+\s*(.*?)\s*===+\s*$/.exec(line);
    if (heading !== null) {
      noncanon = /non-?canon|out of universe/i.test(heading[1] ?? '');
      continue;
    }
    if (!line.startsWith('*')) continue;
    const appearance = parseAppearanceLine(line, noncanon);
    if (appearance !== undefined) out.push(appearance);
  }
  return out;
}
