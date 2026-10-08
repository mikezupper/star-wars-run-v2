// src/page.ts in Node, with just enough of a DOM stubbed to drive it.
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
  await import('../../src/page.js');
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

describe('service worker registration', () => {
  it('registers /sw.js in production builds only', async () => {
    const register = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    await setup(null);
    expect(register).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubEnv('PROD', true);
    await setup(null);
    expect(register).toHaveBeenCalledWith('/sw.js');
    vi.unstubAllEnvs();
  });
});

describe('view transitions: the followed link becomes the next heading', () => {
  /** A link or heading with just the parts page.ts touches. */
  const element = (href: string, top: number) => {
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    return {
      href,
      style,
      getBoundingClientRect: () => ({ top, bottom: top + 20 }),
      closest: vi.fn(),
    };
  };
  const swap = (url: string | null, transition = true) => {
    let done: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (done = resolve));
    return {
      event: {
        activation: url === null ? null : { entry: { url } },
        viewTransition: transition ? { finished } : null,
      } as unknown as PageSwapEvent,
      done,
    };
  };
  const LUKE = 'https://starwars.run/characters/luke-skywalker/';

  async function load(links: ReturnType<typeof element>[], heading = element('', 0)) {
    class FakeNode {
      readonly nodeType = 1;
    }
    vi.stubGlobal('Element', FakeNode);
    vi.stubGlobal('window', { innerHeight: 800 });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      querySelectorAll: () => links,
      querySelector: () => heading,
    });
    return { page: await import('../../src/page.js'), heading, FakeNode };
  }

  it('picks the link to the new page that is on screen', async () => {
    const { page } = await load([]);
    const above = element(LUKE, -100);
    const other = element('https://starwars.run/planets/tatooine/', 100);
    const seen = element(LUKE, 300);
    expect(page.followedLink(LUKE, [above, other, seen], 800)).toBe(seen);
    expect(page.followedLink(LUKE, [above, element(LUKE, 900)], 800)).toBeUndefined();
  });

  it('names the link for the transition, and gives the heading’s name back afterwards', async () => {
    const link = element(LUKE, 200);
    const { page, heading } = await load([link]);
    const { event, done } = swap(LUKE);
    page.nameFollowedLink(event);
    expect(heading.style.setProperty).toHaveBeenCalledWith('view-transition-name', 'none');
    expect(link.style.setProperty).toHaveBeenCalledWith('view-transition-name', 'page-title');
    done();
    await vi.waitFor(() => {
      expect(link.style.removeProperty).toHaveBeenCalledWith('view-transition-name');
      expect(heading.style.removeProperty).toHaveBeenCalledWith('view-transition-name');
    });
  });

  it('prefers the link that was clicked over another to the same page', async () => {
    const first = element(LUKE, 100);
    const clicked = element(LUKE, 400);
    const { page, FakeNode } = await load([first, clicked]);
    const target = Object.assign(new FakeNode(), { closest: () => clicked });
    page.rememberClick({ target } as unknown as Event);
    page.nameFollowedLink(swap(LUKE).event);
    expect(clicked.style.setProperty).toHaveBeenCalledWith('view-transition-name', 'page-title');
    expect(first.style.setProperty).not.toHaveBeenCalled();
  });

  it('leaves the headings to morph when no link was followed, or there is no transition', async () => {
    const link = element(LUKE, 200);
    const { page, heading } = await load([link]);
    page.rememberClick({ target: null } as unknown as Event);
    page.nameFollowedLink(swap('https://starwars.run/planets/hoth/').event);
    page.nameFollowedLink(swap(LUKE, false).event);
    page.nameFollowedLink(swap(null).event);
    expect(link.style.setProperty).not.toHaveBeenCalled();
    expect(heading.style.setProperty).not.toHaveBeenCalled();
  });

  it('listens for page swaps only where the browser has them', async () => {
    const listen = vi.fn();
    vi.stubGlobal('window', { onpageswap: null, addEventListener: listen });
    vi.stubGlobal('document', { addEventListener: vi.fn(), querySelector: () => null });
    await import('../../src/page.js');
    expect(listen).toHaveBeenCalledWith('pageswap', expect.any(Function));
  });
});
