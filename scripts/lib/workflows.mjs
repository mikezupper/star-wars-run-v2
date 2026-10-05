// The workflow guard's logic (scripts/check-workflows.mjs), separate so it can be tested.
// CI here runs locally only (docs/design-docs/0006-workflow.md): a workflow may be triggered
// by `workflow_dispatch` and nothing else, so it can never spend GitHub Actions minutes.

/**
 * The trigger names of a workflow's `on:` key, in any of YAML's three spellings:
 * `on: push`, `on: [push, workflow_dispatch]`, or a mapping with one trigger per line.
 */
export function workflowTriggers(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => /^['"]?on['"]?\s*:/.test(line));
  if (at === -1) return [];
  const inline = lines[at]
    .replace(/^['"]?on['"]?\s*:/, '')
    .replace(/#.*$/, '')
    .trim();
  if (inline.startsWith('[')) {
    return inline
      .slice(1, inline.indexOf(']'))
      .split(',')
      .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  if (inline !== '') return [inline.replace(/^['"]|['"]$/g, '')];
  // Mapping or list form: the triggers are the lines at the first child's indentation.
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\S/.test(line)) break;
    if (line.trim() !== '' && !line.trim().startsWith('#')) body.push(line);
  }
  const indent = /^ */.exec(body[0] ?? '')?.[0].length ?? 0;
  return body
    .filter((line) => /^ */.exec(line)?.[0].length === indent)
    .map((line) => /^\s*(?:- )?([A-Za-z_]+)/.exec(line)?.[1])
    .filter(Boolean);
}

/** One message per forbidden trigger, saying how to fix it. */
export function checkWorkflow(file, text) {
  return workflowTriggers(text)
    .filter((t) => t !== 'workflow_dispatch')
    .map(
      (t) =>
        `${file}: trigger "${t}" would run on GitHub-hosted runners and spend Actions minutes. ` +
        'Use only "workflow_dispatch", and run it locally with "pnpm ci:local" ' +
        '(docs/design-docs/0006-workflow.md).',
    );
}
