# ADR 0004 — Design: semantic HTML, modern CSS, accessible in light and dark

Status: **accepted** (2026-10-05; the look revised 2026-10-08). Implementation: `swr-3mo.7` (theme), `swr-3mo.11` (checks).

## Context

The Cycle.js version used Materialize CSS 1.0.0 from 2018 and needed a `MutationObserver`
just to start its side navigation. The rebuild has no CSS framework.

## Decision

- **Markup:** semantic HTML first (`semantic-html` skill). Headings in order, landmarks,
  real links for navigation, `<dl>` for a record's fields.
- **CSS:** one stylesheet, `src/styles/site.css`, written with the `modern-css` skill:
  cascade layers, design tokens in `oklch()`, `light-dark()` for both color schemes,
  container queries for components. Stylelint enforces the Baseline floor
  ([0001-stack.md](0001-stack.md)).
- **Mood:** Star Wars in feel, but **no trademarked logos, fonts or artwork**.
- **Accessibility is a gate, not a goal:** axe passes in light and dark on every page type,
  and nothing scrolls horizontally at 360 px wide. `pnpm smoke` checks both on every page in
  light mode and on a sample of each template in dark mode, as part of `pnpm check`.

## The look (2026-10-08, `swr-sgf.1`)

The first look (cream and gold in light, a starfield in dark, the system font) was clean but read
like a formatted wiki. The owner compared three directions on a mockup canvas and chose two of
them, one per color scheme, on a shared core:

- **Light is "Datapad":** bold and editorial. Archivo condensed at heavy weights for headings,
  2 px black rules, square corners, an orange accent, and an offset orange shadow on cards. Links
  in prose keep the body color with an orange underline, so a paragraph that links every noun
  still reads as text.
- **Dark is "Holotable":** Chakra Petch for headings, a near-black ground with a faint starfield,
  cyan as the accent and gold for Ask, cards with a thin cyan edge, a glow and faint scan lines,
  softened corners (6 px, cards 10 px).
- **Shared, so it stays one site:** the layout and type scale; Atkinson Hyperlegible for all
  body text; JetBrains Mono for labels, badges and numbers; uppercase headings; the
  `STARWARS.RUN` name with its accent dot; Canon and Legends as a color pair used the same way
  everywhere (blue and orange in light, cyan and amber in dark), always with a text label.
- **Theme:** follows `prefers-color-scheme`, with a toggle (in the header on desktop, in the menu
  on a phone) whose choice is kept in the browser and applied before the first paint by a small
  inline script allowed by its CSP hash. Pages stay identical for every visitor, so Cloudflare
  caches one copy.
- **Fonts are served from the site** (`font-src 'self'`), all under the SIL Open Font License; a
  page downloads only the faces its scheme uses.
- **Layout:** a one-row header (name, search, Ask, Sections, theme); on an article, a title block
  with its kind and badges, key facts directly under the title on a phone, "Appears in" and a
  "Linked from" list; on a section, "Best known" as a numbered ranking before the A to Z index,
  kinds, and a Canon/Legends filter; search as a palette with suggestions as you type.

Colors are tokens on `:root` switched with `light-dark()`; the non-color differences (heading
face, corners, borders, shadows) are a second set of custom properties set once per scheme.
Contrast is checked for both: axe in the smoke test, as before.

## Consequences

- No CSS or JavaScript framework to upgrade. Older browsers get a plainer page, not a
  broken one.
- Theme work and copy work (`swr-3mo.8`) are separate beads but share the site's voice; see
  [0005-writing.md](0005-writing.md).
