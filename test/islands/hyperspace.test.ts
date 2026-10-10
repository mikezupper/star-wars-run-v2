import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  arriveHyperspace,
  departHyperspace,
  installHyperspaceSettings,
  isHyperspaceClick,
  readHyperspacePreference,
  starPosition,
} from '../../src/hyperspace.js';

const HOME = 'https://starwars.run/';
const ARTICLE = `${HOME}characters/luke-skywalker/`;
const KEY = 'swr-hyperspace-to';

afterEach(() => vi.unstubAllGlobals());

function setup({ motion = true, support = true, url = ARTICLE } = {}) {
  const storage = new Map<string, string>();
  const store = {
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
  };
  const preference = {
    matches: motion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const root = { dataset: {} as Record<string, string> };
  const nodes: {
    className: string;
    style: { setProperty: ReturnType<typeof vi.fn> };
    children: unknown[];
    setAttribute: ReturnType<typeof vi.fn>;
    append: (child: unknown) => void;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  const listen = vi.fn();
  const unlisten = vi.fn();
  vi.stubGlobal('location', { origin: 'https://starwars.run', href: url });
  vi.stubGlobal('sessionStorage', store);
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal('CSS', { supports: () => support });
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
  vi.stubGlobal('document', {
    documentElement: root,
    querySelector: () => null,
    body: { append: vi.fn() },
    addEventListener: listen,
    removeEventListener: unlisten,
    createElement: () => {
      const node = {
        className: '',
        style: { setProperty: vi.fn() },
        children: [] as unknown[],
        setAttribute: vi.fn(),
        append(child: unknown) {
          this.children.push(child);
        },
        remove: vi.fn(),
      };
      nodes.push(node);
      return node;
    },
  });
  installHyperspaceSettings();
  let finish: () => void = () => undefined;
  const skipTransition = vi.fn();
  const transition = {
    finished: new Promise<void>((resolve) => (finish = resolve)),
    skipTransition,
  } as unknown as ViewTransition;
  const swap = (to: string | null = ARTICLE, animated = true) =>
    ({
      activation: to === null ? null : { entry: { url: to } },
      viewTransition: animated ? transition : null,
    }) as unknown as PageSwapEvent;
  const reveal = (animated = true) =>
    ({ viewTransition: animated ? transition : null }) as unknown as PageRevealEvent;
  return {
    storage,
    store,
    root,
    nodes,
    preference,
    listen,
    unlisten,
    transition,
    skipTransition,
    finish,
    swap,
    reveal,
  };
}

describe('hyperspace is an enhancement to ordinary random-link navigation', () => {
  it('accepts a primary click or Enter and leaves modified clicks, downloads and other targets alone', () => {
    setup();
    const link = (href = `${HOME}random/`, target = '', download = false) =>
      ({ href, target, hasAttribute: () => download }) as unknown as HTMLAnchorElement;
    const click = (init: object = {}) => ({ button: 0, ...init }) as MouseEvent;
    expect(isHyperspaceClick(click(), link())).toBe(true);
    expect(isHyperspaceClick(click(), link(`${HOME}random/`, '_self'))).toBe(true);
    for (const init of [
      { button: 1 },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { defaultPrevented: true },
    ])
      expect(isHyperspaceClick(click(init), link())).toBe(false);
    expect(isHyperspaceClick(click(), null)).toBe(false);
    expect(isHyperspaceClick(click(), link(ARTICLE))).toBe(false);
    expect(isHyperspaceClick(click(), link('https://example.org/random/'))).toBe(false);
    expect(isHyperspaceClick(click(), link(`${HOME}random/`, '_blank'))).toBe(false);
    expect(isHyperspaceClick(click(), link(`${HOME}random/`, '', true))).toBe(false);
  });

  it('scatters repeatable points with outward trails on any viewport', () => {
    const star = starPosition(23, 360, 800);
    expect(starPosition(23, 360, 800)).toEqual(star);
    expect(starPosition(23, 720, 1600).x).toBe(star.x * 2);
    expect(starPosition(23, 720, 1600).y).toBe(star.y * 2);
    expect(Math.hypot(star.x, star.y)).toBeGreaterThan(0);
    expect(star.angle).toBe(Math.atan2(star.y, star.x));
    expect(star.length).toBeGreaterThan(35);
  });

  it('marks the final redirected destination and cleans up the old page for back/forward cache', async () => {
    const s = setup();
    expect(departHyperspace(s.swap(), true)).toBe(true);
    expect(s.storage.get(KEY)).toBe(ARTICLE);
    expect(s.nodes[0]?.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    expect(s.nodes[0]?.children).toHaveLength(90);
    expect(s.root.dataset['hyperspace']).toBe('');
    s.finish();
    await vi.waitFor(() => {
      expect(s.root.dataset['hyperspace']).toBeUndefined();
    });
    expect(s.nodes[0]?.remove).toHaveBeenCalled();
  });

  it('navigates normally without motion, support, a click, a transition or destination', () => {
    for (const options of [{ motion: false }, { support: false }]) {
      const s = setup(options);
      expect(departHyperspace(s.swap(), true)).toBe(false);
      expect(s.nodes).toHaveLength(0);
    }
    const s = setup();
    expect(departHyperspace(s.swap(), false)).toBe(false);
    expect(departHyperspace(s.swap(ARTICLE, false), true)).toBe(false);
    expect(departHyperspace(s.swap(null), true)).toBe(false);
  });

  it('skips the effect when the browser refuses storage', () => {
    const s = setup();
    s.store.setItem.mockImplementation(() => {
      throw new Error('refused');
    });
    expect(departHyperspace(s.swap(), true)).toBe(false);
    s.store.getItem.mockImplementation(() => {
      throw new Error('refused');
    });
    expect(() => {
      arriveHyperspace(s.reveal());
    }).not.toThrow();
    expect(s.nodes).toHaveLength(0);
  });

  it('consumes the marker once, keeps live star snapshots until finished, and supports Escape', async () => {
    const s = setup();
    s.storage.set(KEY, ARTICLE);
    arriveHyperspace(s.reveal());
    expect(s.storage.has(KEY)).toBe(false);
    expect(s.nodes[0]?.remove).not.toHaveBeenCalled();
    const skip = s.listen.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    skip({ key: 'a' } as KeyboardEvent);
    expect(s.skipTransition).not.toHaveBeenCalled();
    skip({ key: 'Escape' } as KeyboardEvent);
    expect(s.skipTransition).toHaveBeenCalledOnce();
    s.preference.matches = false;
    const reduce = s.preference.addEventListener.mock.calls[0]?.[1] as () => void;
    reduce();
    expect(s.skipTransition).toHaveBeenCalledTimes(2);
    s.finish();
    await vi.waitFor(() => {
      expect(s.nodes[0]?.remove).toHaveBeenCalled();
    });
    expect(s.root.dataset['hyperspace']).toBeUndefined();
    expect(s.unlisten).toHaveBeenCalledWith('keydown', skip);
    expect(s.preference.removeEventListener).toHaveBeenCalledWith('change', reduce);
  });

  it('consumes failed, unrelated and reduced-motion arrivals without showing stars', () => {
    const s = setup();
    arriveHyperspace(s.reveal());
    s.storage.set(KEY, HOME);
    arriveHyperspace(s.reveal());
    expect(s.storage.has(KEY)).toBe(false);
    s.storage.set(KEY, ARTICLE);
    arriveHyperspace(s.reveal(false));
    expect(s.storage.has(KEY)).toBe(false);
    expect(s.nodes).toHaveLength(0);
    const reduced = setup({ motion: false });
    reduced.storage.set(KEY, ARTICLE);
    arriveHyperspace(reduced.reveal());
    expect(reduced.nodes).toHaveLength(0);
  });
});

describe('the remembered hyperspace checkbox', () => {
  const setting = () => {
    const checkbox = { checked: true, disabled: false, addEventListener: vi.fn() };
    const note = { hidden: true };
    const panel = {
      hidden: true,
      querySelector: (selector: string) => (selector === 'input' ? checkbox : note),
    };
    Object.assign(document, { querySelector: () => panel });
    const listen = vi.fn();
    Object.assign(window, { addEventListener: listen });
    return { checkbox, note, panel, listen };
  };

  it('defaults to on, remembers opting out, and restores the default when enabled again', () => {
    const s = setup();
    expect(readHyperspacePreference(s.store)).toBe(true);
    s.storage.set('swr-hyperspace', 'off');
    const control = setting();
    installHyperspaceSettings();
    expect(control.panel.hidden).toBe(false);
    expect(control.checkbox.checked).toBe(false);
    expect(departHyperspace(s.swap(), true)).toBe(false);
    const change = control.checkbox.addEventListener.mock.calls[0]?.[1] as () => void;
    control.checkbox.checked = true;
    change();
    expect(s.storage.has('swr-hyperspace')).toBe(false);
    control.checkbox.checked = false;
    change();
    expect(s.storage.get('swr-hyperspace')).toBe('off');
  });

  it('honors system reduced motion without overwriting the visitor preference', () => {
    const s = setup({ motion: false });
    const control = setting();
    installHyperspaceSettings();
    expect(control.checkbox.checked).toBe(false);
    expect(control.checkbox.disabled).toBe(true);
    expect(control.note.hidden).toBe(false);
    s.preference.matches = true;
    const sync = s.preference.addEventListener.mock.calls[0]?.[1] as () => void;
    sync();
    expect(control.checkbox.checked).toBe(true);
    expect(control.checkbox.disabled).toBe(false);
    expect(control.note.hidden).toBe(true);
    expect(s.storage.has('swr-hyperspace')).toBe(false);
  });

  it('reflects changes made in another tab and leaves unrelated storage events alone', () => {
    const s = setup();
    const control = setting();
    installHyperspaceSettings();
    const changed = control.listen.mock.calls[0]?.[1] as (event: StorageEvent) => void;
    s.storage.set('swr-hyperspace', 'off');
    changed({ key: 'unrelated' } as StorageEvent);
    expect(control.checkbox.checked).toBe(true);
    changed({ key: 'swr-hyperspace' } as StorageEvent);
    expect(control.checkbox.checked).toBe(false);
    s.storage.clear();
    changed({ key: null } as StorageEvent);
    expect(control.checkbox.checked).toBe(true);
  });

  it('keeps a same-page opt-out when storage refuses writes and hides unsupported controls', () => {
    const s = setup();
    const control = setting();
    s.store.getItem.mockImplementation(() => {
      throw new Error('refused');
    });
    expect(readHyperspacePreference(s.store)).toBe(true);
    expect(readHyperspacePreference(null)).toBe(true);
    installHyperspaceSettings();
    s.store.setItem.mockImplementation(() => {
      throw new Error('refused');
    });
    control.checkbox.checked = false;
    const change = control.checkbox.addEventListener.mock.calls[0]?.[1] as () => void;
    change();
    expect(departHyperspace(s.swap(), true)).toBe(false);
    setup({ support: false });
    const unsupported = setting();
    installHyperspaceSettings();
    expect(unsupported.panel.hidden).toBe(true);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('refused');
      },
    });
    expect(() => {
      installHyperspaceSettings();
    }).not.toThrow();
  });
});
