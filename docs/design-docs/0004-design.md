# ADR 0004 — Design: semantic HTML, modern CSS, accessible in light and dark

Status: **accepted** (2026-10-05). Implementation: `swr-3mo.7` (theme), `swr-3mo.11` (checks).

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

## Consequences

- No CSS or JavaScript framework to upgrade. Older browsers get a plainer page, not a
  broken one.
- Theme work and copy work (`swr-3mo.8`) are separate beads but share the site's voice; see
  [0005-writing.md](0005-writing.md).
