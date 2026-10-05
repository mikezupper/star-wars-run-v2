// src/shortcuts.ts in Node, with just enough of a DOM stubbed to drive its one listener.
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeElement {
  constructor(
    readonly tagName: string,
    readonly isContentEditable = false,
  ) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup(box: { focus: () => void; select: () => void } | null) {
  let listener: ((event: unknown) => void) | undefined;
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('document', {
    addEventListener: (_type: string, fn: (event: unknown) => void) => (listener = fn),
    querySelector: (selector: string) => (selector === '#site-search-q' ? box : null),
  });
  await import('../../src/shortcuts.js');
  return (key: string, init: object = {}) => {
    const event = { key, target: new FakeElement('BODY'), preventDefault: vi.fn(), ...init };
    listener?.(event);
    return event.preventDefault;
  };
}

describe('search shortcut', () => {
  it('focuses the header search box on / and Ctrl/⌘+K', async () => {
    const box = { focus: vi.fn(), select: vi.fn() };
    const press = await setup(box);
    expect(press('/')).toHaveBeenCalled();
    expect(press('k', { ctrlKey: true })).toHaveBeenCalled();
    expect(press('K', { metaKey: true })).toHaveBeenCalled();
    expect(box.focus).toHaveBeenCalledTimes(3);
  });

  it('leaves other keys, typing in a field, and modified keys alone', async () => {
    const box = { focus: vi.fn(), select: vi.fn() };
    const press = await setup(box);
    press('a');
    press('k');
    press('/', { target: new FakeElement('INPUT') });
    press('/', { target: new FakeElement('DIV', true) });
    press('/', { altKey: true });
    press('/', { defaultPrevented: true });
    expect(box.focus).not.toHaveBeenCalled();
  });

  it('does nothing when the page has no search box', async () => {
    const press = await setup(null);
    expect(press('/')).not.toHaveBeenCalled();
  });
});
