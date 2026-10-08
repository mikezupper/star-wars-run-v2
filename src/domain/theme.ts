// The theme choice (docs/design-docs/0004-design.md, "The look"): the site follows the system's
// color scheme unless the visitor picks the other one with the toggle, and the pick is kept in
// the browser. Pages are the same for everyone (Cloudflare caches one copy); the choice is applied
// in the browser, before the first paint, by THEME_SCRIPT.

export type Theme = 'light' | 'dark';

/** Where the browser keeps the visitor's pick (localStorage). */
export const THEME_KEY = 'swr-theme';

/** The browser chrome's color for each theme (<meta name="theme-color">). */
export const THEME_COLOR: Readonly<Record<Theme, string>> = { light: '#fafaf7', dark: '#060a13' };

/**
 * Inlined in every page's <head>, before the stylesheet, so a saved pick is on the root element
 * before anything is painted. The CSP allows exactly this text by its hash (`pnpm caddyfile`).
 */
export const THEME_SCRIPT = `try{const t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;

export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';
