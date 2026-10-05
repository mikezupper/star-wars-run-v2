// `pnpm invariants` (part of `pnpm check`): the knowledge base stays navigable.
// - Every relative Markdown link in the repo's own docs resolves to a file.
// - Every design doc and product spec is listed in its folder's index.md.
// - AGENTS.md stays a map (short), not a manual.
// Failures print what to fix, because agents read them.
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENTS_MAX_LINES = 120;
// Copied from gyral.dev: their links are site paths, not repo paths (see its README.md).
const VENDORED = join('docs', 'references', 'gyral');

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function markdownFiles() {
  const files = ['AGENTS.md', 'ARCHITECTURE.md', 'README.md', 'CLAUDE.md'].map((f) =>
    join(ROOT, f),
  );
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.md')) files.push(path);
    }
  };
  await walk(join(ROOT, 'docs'));
  return files.filter(
    (f) => !relative(ROOT, f).startsWith(VENDORED) || f.endsWith(join(VENDORED, 'README.md')),
  );
}

const problems = [];

for (const file of await markdownFiles()) {
  const text = await readFile(file, 'utf8');
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = join(dirname(file), target.split('#')[0]);
    if (!(await exists(path))) {
      problems.push(
        `${relative(ROOT, file)}: link to "${target}" points at nothing. Fix the path or remove the link.`,
      );
    }
  }
}

for (const folder of ['docs/design-docs', 'docs/product-specs']) {
  const index = await readFile(join(ROOT, folder, 'index.md'), 'utf8');
  for (const name of await readdir(join(ROOT, folder))) {
    if (name === 'index.md' || !name.endsWith('.md')) continue;
    if (!index.includes(`](${name})`)) {
      problems.push(`${folder}/${name} is not listed in ${folder}/index.md. Add a row for it.`);
    }
  }
}

const agentsLines = (await readFile(join(ROOT, 'AGENTS.md'), 'utf8')).split('\n').length;
if (agentsLines > AGENTS_MAX_LINES) {
  problems.push(
    `AGENTS.md has ${String(agentsLines)} lines (limit ${String(AGENTS_MAX_LINES)}). It is a map: move detail into docs/ and link to it.`,
  );
}

if (problems.length > 0) {
  console.error(`check-docs: ${String(problems.length)} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('check-docs: ok');
