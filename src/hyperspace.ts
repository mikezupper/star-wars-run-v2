// Random-article jumps use the browser's cross-document transition. Each star has the same
// name on both pages: the browser stretches its two-pixel snapshot into an outward light trail.
// There is no navigation interception, animation loop, image download or client-side router.
const DESTINATION = 'swr-hyperspace-to';
const MOTION = '(prefers-reduced-motion: no-preference)';
const COUNT = 90;
const PREFERENCE = 'swr-hyperspace';
let enabled = true;

const preferenceStore = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** Store only opting out; an absent preference leaves the effect enabled. */
export function readHyperspacePreference(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(PREFERENCE) !== 'off';
  } catch {
    return true;
  }
}

/** The native checkbox remembers the visitor's choice; reduced motion always takes priority. */
export function installHyperspaceSettings(): void {
  enabled = readHyperspacePreference(preferenceStore());
  const setting = document.querySelector<HTMLElement>('[data-hyperspace-setting]');
  const checkbox = setting?.querySelector<HTMLInputElement>('input');
  if (!setting || !checkbox || !CSS.supports('view-transition-class', 'hyperspace-star')) return;
  const note = setting.querySelector<HTMLElement>('small');
  const motion = matchMedia(MOTION);
  const sync = () => {
    checkbox.checked = enabled && motion.matches;
    checkbox.disabled = !motion.matches;
    if (note) note.hidden = motion.matches;
  };
  sync();
  setting.hidden = false;
  checkbox.addEventListener('change', () => {
    enabled = checkbox.checked;
    try {
      const storage = preferenceStore();
      if (enabled) storage?.removeItem(PREFERENCE);
      else storage?.setItem(PREFERENCE, 'off');
    } catch {
      // Storage can be unavailable: the choice still applies on this page.
    }
    sync();
  });
  motion.addEventListener('change', sync);
  window.addEventListener('storage', (event) => {
    if (event.key !== PREFERENCE && event.key !== null) return;
    enabled = readHyperspacePreference(preferenceStore());
    sync();
  });
}

/** Only an ordinary click (including Enter) on our random link starts a jump. */
export function isHyperspaceClick(event: MouseEvent, link: HTMLAnchorElement | null): boolean {
  if (
    link === null ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    link.hasAttribute('download') ||
    (link.target !== '' && link.target !== '_self')
  )
    return false;
  const url = new URL(link.href);
  return url.origin === location.origin && url.pathname === '/random/';
}

/** Stable points shared by the two documents, scattered across an elliptical starfield. */
export function starPosition(index: number, width: number, height: number) {
  const angle = index * 2.399963229728653;
  const radius = Math.sqrt(((index * 37) % COUNT) / COUNT) * 0.9 + 0.08;
  const x = Math.cos(angle) * width * 0.5 * radius;
  const y = Math.sin(angle) * height * 0.5 * radius;
  return { x, y, angle: Math.atan2(y, x), length: 35 + radius * 180 };
}

const supported = () =>
  enabled && matchMedia(MOTION).matches && CSS.supports('view-transition-class', 'hyperspace-star');

function field(arriving: boolean): HTMLElement {
  const stars = document.createElement('div');
  stars.className = 'hyperspace-field';
  stars.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < COUNT; i++) {
    const star = document.createElement('i');
    const point = starPosition(i, window.innerWidth, window.innerHeight);
    star.className = 'hyperspace-star';
    star.style.setProperty('view-transition-name', `hyperspace-star-${i}`);
    star.style.setProperty('--star-x', `${point.x * (arriving ? 1.8 : 1)}px`);
    star.style.setProperty('--star-y', `${point.y * (arriving ? 1.8 : 1)}px`);
    star.style.setProperty('--star-angle', `${point.angle}rad`);
    star.style.setProperty('--star-length', `${arriving ? point.length : 2}px`);
    stars.append(star);
  }
  document.body.append(stars);
  document.documentElement.dataset['hyperspace'] = '';
  return stars;
}

function cleanup(stars: HTMLElement, transition: ViewTransition, arriving: boolean): void {
  const motion = matchMedia(MOTION);
  const skip = (event: KeyboardEvent) => {
    if (event.key === 'Escape') transition.skipTransition();
  };
  const reduce = () => {
    if (!motion.matches) transition.skipTransition();
  };
  if (arriving) {
    document.addEventListener('keydown', skip);
    motion.addEventListener('change', reduce);
  }
  const restore = () => {
    stars.remove();
    delete document.documentElement.dataset['hyperspace'];
    document.removeEventListener('keydown', skip);
    motion.removeEventListener('change', reduce);
  };
  transition.finished.then(restore, restore);
}

/** pageswap gives the final article URL, after /random/'s redirect. Storage refusal skips it. */
export function departHyperspace(event: PageSwapEvent, clicked: boolean): boolean {
  const to = event.activation?.entry.url;
  if (!clicked || !event.viewTransition || to == null || !supported()) return false;
  try {
    sessionStorage.setItem(DESTINATION, to);
  } catch {
    return false;
  }
  cleanup(field(false), event.viewTransition, false);
  return true;
}

/** Consume the destination once, including aborted transitions and back/forward restores. */
export function arriveHyperspace(event: PageRevealEvent): void {
  let to: string | null;
  try {
    to = sessionStorage.getItem(DESTINATION);
    sessionStorage.removeItem(DESTINATION);
  } catch {
    return;
  }
  if (to !== location.href || !event.viewTransition || !supported()) return;
  cleanup(field(true), event.viewTransition, true);
}
