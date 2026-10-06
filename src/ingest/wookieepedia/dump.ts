// Reading Fandom's XML dump (docs/design-docs/0007-wookieepedia.md): the .7z is decompressed
// by the 7-Zip binary that ships in the `7zip-bin` package (no system install needed) and
// streamed through a SAX parser, one page at a time, so the 2 GB of XML never sits in memory.
import { spawn } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { SaxesParser } from 'saxes';

/** One `<page>` of the dump, as the ingest needs it. */
export interface DumpPage {
  readonly title: string;
  /** MediaWiki namespace: 0 is articles. */
  readonly ns: number;
  /** The redirect's target title, when the page is a redirect. */
  readonly redirect?: string;
  readonly text: string;
  /** The current revision's time, ISO 8601. */
  readonly timestamp: string;
}

/** Pages from a dump's XML, in file order. */
export async function* readPages(xml: AsyncIterable<string | Buffer>): AsyncGenerator<DumpPage> {
  const parser = new SaxesParser();
  const ready: DumpPage[] = [];
  let failure: Error | undefined;
  let path: string[] = [];
  let page:
    { title: string; ns: number; redirect?: string; text: string; timestamp: string } | undefined;
  let buffer = '';

  parser.on('error', (error) => {
    failure = error;
  });
  parser.on('opentag', (tag) => {
    path.push(tag.name);
    if (tag.name === 'page') page = { title: '', ns: -1, text: '', timestamp: '' };
    if (tag.name === 'redirect' && page !== undefined) {
      const target = tag.attributes['title'];
      if (typeof target === 'string') page.redirect = target;
    }
    buffer = '';
  });
  parser.on('text', (text) => {
    buffer += text;
  });
  parser.on('closetag', (tag) => {
    const parent = path.at(-2);
    if (page !== undefined) {
      if (tag.name === 'title' && parent === 'page') page.title = buffer;
      if (tag.name === 'ns' && parent === 'page') page.ns = Number(buffer);
      if (tag.name === 'text' && parent === 'revision') page.text = buffer;
      if (tag.name === 'timestamp' && parent === 'revision') page.timestamp = buffer;
      if (tag.name === 'page') {
        ready.push(page);
        page = undefined;
      }
    }
    path = path.slice(0, -1);
    buffer = '';
  });

  for await (const chunk of xml) {
    parser.write(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    if (failure !== undefined) throw failure;
    yield* ready.splice(0);
  }
  parser.close();
  if (failure !== undefined) throw failure;
  yield* ready.splice(0);
}

/** The 7-Zip binary from `7zip-bin`. pnpm skips its install script, so make sure it can run. */
async function sevenZip(): Promise<string> {
  const { path7za } = createRequire(import.meta.url)('7zip-bin') as { path7za: string };
  await chmod(path7za, 0o755);
  return path7za;
}

/** The XML inside a `.7z` dump, streamed: 7-Zip writes it to stdout. */
export async function openDump(path: string): Promise<{ xml: Readable; done: Promise<void> }> {
  const child = spawn(await sevenZip(), ['x', '-so', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`7-Zip could not read ${path} (exit ${String(code)}): ${errors.trim()}`));
    });
  });
  child.stdout.setEncoding('utf8');
  return { xml: child.stdout, done };
}
