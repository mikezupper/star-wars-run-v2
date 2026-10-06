// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports `lit`
// (docs/references/gyral/server-rendering.md, "Production checklist").
import '@gyral/ssr/hydrate';
import './islands/site-search.js';
import './islands/explore.js';
