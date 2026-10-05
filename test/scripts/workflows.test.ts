import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without type declarations.
import { checkWorkflow, workflowTriggers } from '../../scripts/lib/workflows.mjs';

const triggers = workflowTriggers as (text: string) => string[];
const check = checkWorkflow as (file: string, text: string) => string[];

describe('workflow triggers', () => {
  it('reads every spelling of `on:`', () => {
    expect(triggers('name: ci\non: push\njobs: {}')).toEqual(['push']);
    expect(triggers("on: [push, 'workflow_dispatch']")).toEqual(['push', 'workflow_dispatch']);
    expect(
      triggers('"on":\n  workflow_dispatch:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n'),
    ).toEqual(['workflow_dispatch', 'schedule']);
    expect(triggers('on:\n  - pull_request\n  - workflow_dispatch\n')).toEqual([
      'pull_request',
      'workflow_dispatch',
    ]);
    expect(triggers('name: no triggers\n')).toEqual([]);
  });

  it('accepts workflow_dispatch alone and explains every other trigger', () => {
    expect(check('ci.yml', 'on:\n  workflow_dispatch:\n')).toEqual([]);
    const errors = check('ci.yml', 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/trigger "push" .*"pnpm ci:local"/);
  });
});
