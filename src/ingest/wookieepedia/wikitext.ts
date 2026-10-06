// Wookieepedia wikitext → clean article data (docs/design-docs/0007-wookieepedia.md).
// Parses one article's opening (everything before its first section heading) with
// wikiparser-node and keeps what the site shows: the era, the infobox's kind and fields, and
// the lead paragraphs. Every value is "rich text": plain text runs and links to other
// articles by title. Citations, comments, files, categories and layout templates are
// dropped. Raw wikitext never comes out: a template this code doesn't know degrades to the
// plain text of its first positional argument.
import Parser from 'wikiparser-node';

/** A run of text, or a run of text linking to another article by its title. */
export type Run = { readonly text: string } | { readonly text: string; readonly link: string };

/** Text with links. */
export type Rich = readonly Run[];

/** One infobox field: one item, or several when the source lists them. */
export interface Field {
  readonly name: string;
  readonly items: readonly Rich[];
}

export interface ParsedArticle {
  readonly era: 'canon' | 'legends';
  /** The infobox template's name, e.g. `Character`, `CelestialBody`; absent without one. */
  readonly kind?: string;
  readonly fields: readonly Field[];
  /** The paragraphs before the first heading. */
  readonly lead: readonly Rich[];
}

/** The slice of wikiparser-node's syntax tree this module reads. */
interface Node {
  readonly type: string;
  readonly name?: string;
  readonly data?: string;
  readonly innerText?: string;
  readonly childNodes: readonly Node[];
}

/** Top-of-article templates that are layout, not an infobox, even with named parameters. */
const NOT_INFOBOX = new Set([
  'Top',
  'Quote',
  'Dialogue',
  'Dablink',
  'Youmay',
  'Otheruses',
  'Eras',
  'Title',
  'Interlang',
  'Update',
  'Cleanup',
  'Stub',
  'MultipleIssues',
  'Citation',
  'Rhere',
  'Redirect',
]);

/** Infobox fields that hold images or presentation, not facts. */
const SKIP_FIELD = /^(?:name|type|image\d*|option\d*|imagebg|caption\d*|width)$/;

/** A separator inside rich text: a new list item, or a line break. */
const BREAK = '\u0000';

const templateName = (node: Node): string => (node.name ?? '').replace(/^Template:/, '').trim();

const children = (node: Node, type: string): Node[] =>
  node.childNodes.filter((c) => c.type === type);

/** A template's parameters: positional ones keyed '1', '2'…, named ones by name. */
function parameters(node: Node): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const p of children(node, 'parameter')) {
    const value = p.childNodes.find((c) => c.type === 'parameter-value');
    if (value !== undefined) out.set((p.name ?? '').trim(), value);
  }
  return out;
}

/** `Polis_Massa` → `Polis Massa`; MediaWiki titles start with a capital letter. */
export const normaliseTitle = (target: string): string => {
  const title = target.replace(/_/g, ' ').split('#')[0]?.trim() ?? '';
  return title.charAt(0).toUpperCase() + title.slice(1);
};

/** `de:Luke`, `w:c:…`, `Wookieepedia:…`: not an article. Titles like `Star Wars: Episode IV` are. */
const NAMESPACED = /^[A-Za-z][\w-]*:(?!\s)/;

/** Rich text plus BREAK markers, from a list of syntax nodes. */
function runs(nodes: readonly Node[]): Run[] {
  const out: Run[] = [];
  const text = (t: string) => out.push({ text: t });
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        text((node.data ?? '').replace(/\n\*+/g, BREAK).replace(/^\*+/, BREAK));
        break;
      case 'link': {
        const target = node.childNodes.find((c) => c.type === 'link-target');
        const raw = target === undefined ? '' : plain(target.childNodes);
        const label = node.childNodes.find((c) => c.type === 'link-text');
        const shown = label === undefined ? (raw.split('#')[0] ?? raw) : plain(label.childNodes);
        if (NAMESPACED.test(raw)) {
          if (label !== undefined) text(shown);
        } else {
          out.push({ text: shown, link: normaliseTitle(raw) });
        }
        break;
      }
      case 'template':
        out.push(...template(node));
        break;
      case 'ext':
        // <ref> citations go; other tags (<nowiki>, <small>…) keep their text.
        if ((node.name ?? '') !== 'ref' && (node.name ?? '') !== 'references') {
          text(plain(children(node, `ext-inner`).flatMap((c) => c.childNodes)));
        }
        break;
      case 'html':
        if ((node.name ?? '') === 'br') text(BREAK);
        break;
      case 'list':
        text(BREAK);
        break;
      case 'ext-link':
        out.push(...runs(children(node, 'ext-link-text').flatMap((c) => c.childNodes)));
        break;
      case 'comment':
      case 'file':
      case 'category':
      case 'quote':
      case 'heading':
        break;
      default:
        out.push(...runs(node.childNodes));
    }
  }
  return out;
}

/** Plain text only, links reduced to what they show. */
const plain = (nodes: readonly Node[]): string =>
  runs(nodes)
    .map((r) => r.text)
    .join('');

/** Known inline templates; anything else shows its first positional argument. */
function template(node: Node): Run[] {
  const params = parameters(node);
  const first = params.get('1');
  switch (templateName(node)) {
    case 'C':
      return first === undefined ? [] : [{ text: ' (' }, ...runs(first.childNodes), { text: ')' }];
    default:
      return first === undefined ? [] : runs(first.childNodes);
  }
}

/** The named HTML entities Wookieepedia uses in prose and infoboxes; numeric ones are decoded too. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  dagger: '†',
  Dagger: '‡',
  times: '×',
  minus: '−',
  deg: '°',
  middot: '·',
  shy: '',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
};

/** Text, not markup: the page renderer escapes it again. Unknown named entities stay as written. */
export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code =
        name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name] ?? whole;
  });

/**
 * Merge adjacent plain runs, fold link trails (`[[meter]]s` shows "meters", all linked),
 * collapse whitespace across run boundaries, and trim the ends.
 */
function tidy(input: readonly Run[]): Rich {
  const merged: Run[] = [];
  for (const run of input) {
    let text = decodeEntities(run.text);
    const last = merged.at(-1);
    if (last !== undefined && 'link' in last && !('link' in run)) {
      const trail = /^[a-z]+/.exec(text)?.[0] ?? '';
      if (trail !== '') {
        merged[merged.length - 1] = { text: last.text + trail, link: last.link };
        text = text.slice(trail.length);
      }
    }
    const prev = merged.at(-1);
    if (prev !== undefined && !('link' in prev) && !('link' in run)) {
      merged[merged.length - 1] = { text: prev.text + text };
    } else if (text !== '') {
      merged.push('link' in run ? { text, link: run.link } : { text });
    }
  }
  // One space at most between words, including where a run ends and the next begins.
  for (let i = 0; i < merged.length; i++) {
    const run = merged[i];
    if (run === undefined) continue;
    let text = run.text.replace(/\s+/g, ' ');
    if (i > 0 && text.startsWith(' ') && /\s$/.test(merged[i - 1]?.text ?? ''))
      text = text.slice(1);
    merged[i] = 'link' in run ? { text, link: run.link } : { text };
  }
  const first = merged[0];
  if (first !== undefined && !('link' in first)) merged[0] = { text: first.text.trimStart() };
  const end = merged.length - 1;
  const lastRun = merged[end];
  if (lastRun !== undefined && !('link' in lastRun)) {
    // A citation removed from "Blond (1 BBY),<ref>…</ref>" leaves the comma behind.
    merged[end] = { text: lastRun.text.trimEnd().replace(/[,;]$/, '') };
  }
  return merged.filter((r) => r.text !== '' || 'link' in r);
}

/** Split rich text at BREAK markers into list items, dropping empty ones. */
function items(input: readonly Run[]): Rich[] {
  const groups: Run[][] = [[]];
  for (const run of input) {
    const parts = run.text.split(BREAK);
    parts.forEach((part, i) => {
      if (i > 0) groups.push([]);
      groups.at(-1)?.push('link' in run ? { text: part, link: run.link } : { text: part });
    });
  }
  return groups.map(tidy).filter((g) => g.some((r) => r.text.trim() !== ''));
}

const namedCount = (node: Node): number =>
  [...parameters(node).keys()].filter((k) => !/^\d+$/.test(k)).length;

/**
 * The infobox: of the top-level templates that aren't layout or maintenance banners, the one
 * with the most named fields (at least two). Banners such as `MultipleIssues` also take named
 * parameters and can come first.
 */
const infobox = (top: readonly Node[]): Node | undefined =>
  top
    .filter((n) => n.type === 'template' && !NOT_INFOBOX.has(templateName(n)) && namedCount(n) >= 2)
    .reduce<Node | undefined>(
      (best, n) => (best === undefined || namedCount(n) > namedCount(best) ? n : best),
      undefined,
    );

/** The lead: top-level lines before the first heading, minus lines that hold only templates. */
function lead(top: readonly Node[]): Rich[] {
  const lines: Node[][] = [[]];
  for (const node of top) {
    if (node.type === 'heading') break;
    if (node.type === 'text') {
      const parts = (node.data ?? '').split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part !== '') lines.at(-1)?.push({ type: 'text', data: part, childNodes: [] });
      });
    } else {
      lines.at(-1)?.push(node);
    }
  }
  const prose = (line: Node[]) =>
    line.some(
      (n) =>
        n.type === 'link' ||
        (n.type === 'text' && (n.data ?? '').trim() !== '') ||
        n.type === 'quote',
    );
  const paragraphs: Rich[] = [];
  let current: Run[] = [];
  for (const line of lines) {
    if (line.length === 0 || !prose(line)) {
      if (current.length > 0) paragraphs.push(tidy(current));
      current = [];
    } else {
      current.push(...(current.length > 0 ? [{ text: ' ' }] : []), ...runs(line));
    }
  }
  if (current.length > 0) paragraphs.push(tidy(current));
  return paragraphs
    .map((p) => p.map((r) => ('link' in r ? r : { text: r.text.replaceAll(BREAK, ' ') })))
    .filter((p) => p.length > 0);
}

/** Cut wikitext at its first section heading: everything this module reads comes before. */
export const opening = (wikitext: string): string => {
  const heading = /^==[^=].*==\s*$/m.exec(wikitext);
  return heading === null ? wikitext : wikitext.slice(0, heading.index);
};

/**
 * `title` decides the era along with `{{Top}}`: Legends articles carry its `leg` flag, except
 * those whose title ends in `/Legends` (the canon article has the plain title), which may not.
 */
export function parseArticle(title: string, wikitext: string): ParsedArticle {
  const root = Parser.parse(opening(wikitext)) as unknown as Node;
  const top = root.childNodes;
  const topTemplate = top.find((n) => n.type === 'template' && templateName(n) === 'Top');
  const flags =
    topTemplate === undefined
      ? []
      : [...parameters(topTemplate).values()].map((v) => plain(v.childNodes).trim());
  const box = infobox(top);
  const fields: Field[] = [];
  if (box !== undefined) {
    for (const [name, value] of parameters(box)) {
      if (/^\d+$/.test(name) || SKIP_FIELD.test(name)) continue;
      const list = items(runs(value.childNodes));
      if (list.length > 0) fields.push({ name, items: list });
    }
  }
  return {
    era: flags.includes('leg') || title.endsWith('/Legends') ? 'legends' : 'canon',
    ...(box === undefined ? {} : { kind: templateName(box) }),
    fields,
    lead: lead(top.filter((n) => n !== box)),
  };
}
