# Offline and install (PWA)

Bead: `swr-3mo.9`. Hosting and cache headers: [0003-hosting.md](../design-docs/0003-hosting.md).

## Behavior

- The site can be installed to a phone or desktop home screen, with its own name, icons
  and theme color.
- On the first online visit, a service worker stores the site shell, the stylesheet and the
  search engine. At 227,000 articles the search index is 130 MB, too much to download up
  front, so its parts are stored as searches use them.
- Each article a visitor opens is stored as they open it.
- Offline: stored pages open normally, and a search works if the same words were searched
  online before. Search for any word offline comes with a title index (`swr-7f1.8`). A page that was never stored
  shows an offline page that says so, in the site's voice, and links to pages that are
  available.
- After a deploy, the visitor gets the new version on their next navigation, without
  clearing anything by hand.

## Acceptance criteria

- Lighthouse reports the site installable.
- With the network off in DevTools: a visited article loads, a search made online before
  returns results, and an unvisited article shows the offline page.
- `sw.js` is served with `Cache-Control: no-cache`.
