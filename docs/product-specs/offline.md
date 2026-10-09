# Offline and install (PWA)

Bead: `swr-3mo.9`. Hosting and cache headers: [0003-hosting.md](../design-docs/0003-hosting.md).

## Behavior

- The site can be installed to a phone or desktop home screen, with its own name, icons
  and theme color.
- On the first online visit, a service worker stores the site shell and the stylesheet.
- Each article a visitor opens is stored as they open it.
- Offline: stored pages open normally. Search needs the server (ADR 0011), so a new search
  offline shows the offline page. A page that was never stored
  shows an offline page that says so, in the site's voice, and links to pages that are
  available.
- After a deploy, the visitor gets the new version on their next navigation, without
  clearing anything by hand.

## Acceptance criteria

- Lighthouse reports the site installable.
- With the network off in DevTools: a visited article loads, and an unvisited article or a
  new search shows the offline page.
- `sw.js` is served with `Cache-Control: no-cache`.
