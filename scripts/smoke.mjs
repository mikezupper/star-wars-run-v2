// `pnpm smoke` (part of `pnpm check`, after `pnpm build`): opens the built site in Chromium
// through the preview server and checks every page in the sitemap (or, with SMOKE_PAGES=N, a
// sample of N: see samplePaths), /search/ and the 404 page:
// - status 200 (404 for the 404 page), and no console errors or page errors;
// - axe finds no violations: every page in light; in dark, home, every list page, the first
//   two articles of each section, search and 404 (articles share one template and one set of
//   color tokens, so a sample covers the dark palette);
// - no horizontal overflow at phone width (360px);
// - every internal link resolves;
// - search (docs/product-specs/search.md): the header form and keyboard shortcuts reach search,
//   each query finds its expected pages in the top five, the section filter filters, and the
//   results render without JavaScript; /api/search returns the same ranked, cached matches;
// - offline (docs/product-specs/offline.md): the manifest is valid with 192px and 512px icons;
//   once the service worker controls the page, a visited article works with the network off;
//   an unvisited article and a new search show the offline page;
// - Explore posts SQL to the server and links the returned names; Ask answers through the
//   API with the model stubbed, gives immediate progress, passes axe, and reports an outage.
//   With SMOKE_BASE_URL, Ask uses that server's real model and the staged outage is skipped;
// - page-to-page view transitions run, and pages point browsers at the hover-to-fetch rules;
// - the dev server (`pnpm dev`): home, a record page and search work, with no console errors
//   (search and Explore read the full dist-api/ databases). Skipped when
//   SMOKE_BASE_URL points at another server.
// Report: .smoke/report.md. Exit 1 on any failure. Adapted from gyral.dev's scripts/smoke.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';

// SMOKE_BASE_URL=http://localhost:8080 runs every check against another server instead, such
// as the Docker image (`pnpm docker:run`). The page list still comes from the local dist/.
// DIST_DIR: the build to check (the gate's sample is in .sample/; see scripts/build.ts).
const dist = new URL(`../${process.env.DIST_DIR ?? 'dist'}/`, import.meta.url).pathname;
// The questions smoke asks go to a log of their own, not the local one (data/questions/).
process.env.QUESTIONS_DB ??= new URL('../.smoke/questions.duckdb', import.meta.url).pathname;
// The API asks a fake model (fakeModel below), not the real one: fast, free, the same every run.
const model = await fakeModel();
process.env.ASK_ORIGIN = `http://localhost:${String(model.address().port)}`;
process.env.ASK_KEY = 'smoke';
/** Checking another server (SMOKE_BASE_URL): it has its own model, and no dev server here. */
const REMOTE = process.env.SMOKE_BASE_URL !== undefined;
const server = REMOTE ? undefined : await startPreview();
const base = process.env.SMOKE_BASE_URL ?? `http://localhost:${String(server.address().port)}`;

async function startPreview() {
  const { createPreview } = await tsImport('./preview.ts', import.meta.url);
  const preview = createPreview(dist.replace(/\/$/, ''));
  await new Promise((resolve) => preview.listen(0, resolve));
  return preview;
}

/** The paths a sitemap file lists: pages, or (in the index) the sitemap files themselves. */
const locs = (file) =>
  [
    ...readFileSync(`${dist}${file}`, 'utf8').matchAll(
      /<loc>https:\/\/starwars\.run\/([^<]*)<\/loc>/g,
    ),
  ].map((m) => `/${m[1]}`);
// sitemap.xml is an index of sitemap-1.xml, sitemap-2.xml…, which list the pages.
const listed = locs('sitemap.xml').flatMap((part) => locs(part.slice(1)));
// Pages deliberately left out of the sitemap (noindex) that still ship.
const unlisted = ['/search/', '/offline/'];
/** Each query must list every expected page in its first five results. */
const SEARCHES = [
  ['sky', ['/characters/luke-skywalker/', '/characters/anakin-skywalker/']],
  ['luke', ['/characters/luke-skywalker/']],
  // A redirect: there's no article called Vader (swr-357).
  ['vader', ['/characters/anakin-skywalker/']],
  ['tatooine', ['/planets/tatooine/']],
  ['falcon', ['/starships/millennium-falcon/']],
  ['padme', ['/characters/padme-amidala-naberrie/']],
];

/**
 * The pages to check. A full build has 227k: checking each in Chromium would take about a day,
 * so SMOKE_PAGES=N checks every section and letter page, the pages SEARCHES expect, and an
 * even spread of articles up to N in all (swr-7f1.6). Unset, every page is checked.
 */
const paths = samplePaths(listed, Number(process.env.SMOKE_PAGES ?? 'Infinity'));

function samplePaths(all, limit) {
  if (!(all.length > limit)) return all;
  const always = new Set(SEARCHES.flatMap(([, expected]) => expected));
  const isList = (p) =>
    p.split('/').filter(Boolean).length < 2 || /^\/[a-z-]+\/letters\/[a-z0-9]\/(?:\d+\/)?$/.test(p);
  const kept = all.filter((p) => isList(p) || always.has(p));
  const keptSet = new Set(kept);
  const rest = all.filter((p) => !keptSet.has(p));
  const room = Math.max(0, limit - kept.length);
  const step = rest.length / Math.max(1, room);
  for (let i = 0; i < room && Math.floor(i * step) < rest.length; i++)
    kept.push(rest[Math.floor(i * step)]);
  return kept;
}

const CONCURRENCY = 6;
const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);
const started = Date.now();

const browser = await chromium.launch();
try {
  const links = new Set();
  const all = [...[...paths, ...unlisted].map((p) => [p, 200]), ['/no-such-page/', 404]];
  const tasks = [
    ...all.map(([path, status]) => ({ scheme: 'light', path, status })),
    ...all
      .filter(([path]) => darkSample(path))
      .map(([path, status]) => ({ scheme: 'dark', path, status })),
  ];
  // Pages are independent: check several at once, each in its own context.
  await pool(tasks, CONCURRENCY, (task) => checkPage(task, links));
  await checkLinks(links);
  await checkSearch();
  await checkSuggestions();
  await checkWithoutJavaScript();
  await checkOffline();
  await checkExplore();
  await checkAskFeedback();
  await checkAsk();
  await checkTransitions();
  await checkHyperspace();
  await checkEraFilter();
  if (!REMOTE) await checkDevServer();
} finally {
  await browser.close();
  server?.close();
  model.close();
}

/** Home, list pages, search, 404, and the first two articles of each section. */
function darkSample(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2 || parts[1] === 'letters') return true;
  const articles = paths.filter(
    (p) => p.startsWith(`/${parts[0]}/`) && p.split('/').filter(Boolean).length === 2,
  );
  return articles.indexOf(path) < 2;
}

async function pool(items, size, work) {
  // An index, not queue.shift(): shifting a 227k-item array each time is quadratic.
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

function watch(page, where, status = 200) {
  page.on('console', (m) => {
    // The browser logs an expected error status itself (a 404 page, a stubbed 503); that one is
    // expected.
    if (m.type() === 'error' && !(status !== 200 && m.text().includes(String(status))))
      fail(where, `console: ${m.text()}`);
  });
  page.on('pageerror', (e) => fail(where, `page error: ${e.message}`));
}

async function axe(page, where) {
  const result = await new AxeBuilder({ page }).analyze();
  for (const v of result.violations) {
    const nodes = v.nodes.map((n) => n.target.join(' ')).slice(0, 3);
    fail(where, `axe ${v.id}: ${v.help} (${nodes.join(', ')})`);
  }
}

async function checkPage({ scheme, path, status }, links) {
  const where = `${path} (${scheme})`;
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1280, height: 900 },
  });
  try {
    const page = await context.newPage();
    watch(page, where, status);
    const response = await page.goto(base + path, { waitUntil: 'networkidle' });
    if (response?.status() !== status)
      fail(where, `status ${String(response?.status())}, expected ${String(status)}`);
    await axe(page, where);
    if (scheme === 'light' && status === 200) {
      for (const href of await page.$$eval('a[href]', (as) => as.map((a) => a.href)))
        links.add(href);
      await page.setViewportSize({ width: 360, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) fail(where, `${String(overflow)}px horizontal overflow at 360px wide`);
    }
  } finally {
    await context.close();
  }
}

async function checkLinks(links) {
  // Letter pages link to every article, so a full build has ~227k links: fetch several at once.
  const internal = new Set(
    [...links]
      .map((href) => new URL(href))
      .filter((u) => u.origin === base)
      .map((u) => u.pathname),
  );
  await pool([...internal], 16, async (path) => {
    const res = await fetch(base + path, { redirect: 'manual' });
    await res.body?.cancel();
    // /random/ is meant to redirect, uncached, to an article that exists.
    if (path === '/random/') {
      const to = res.headers.get('location') ?? '';
      const landed = await fetch(base + to, { redirect: 'manual' });
      await landed.body?.cancel();
      if (res.status !== 302 || res.headers.get('cache-control') !== 'no-store' || !landed.ok)
        fail('links', `/random/ → ${String(res.status)} ${to} → ${String(landed.status)}`);
      return;
    }
    if (res.status !== 200) fail('links', `${path} → ${String(res.status)}`);
  });
}

/** The result links on a server-rendered /search/ page, in order. */
function hrefs(page) {
  return page
    .locator('main ol[aria-label="Search results"] > li > a:first-child')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
}

async function checkSearch() {
  const where = '/search/';
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    watch(page, where);
    for (const [query, expected] of SEARCHES) {
      // Start from a record page, as a reader would: `/` focuses the header box.
      await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
      await page.keyboard.press('/');
      const focused = await page.evaluate(() => document.activeElement?.id);
      if (focused !== 'site-search-q') fail(where, `"/" focused "${String(focused)}"`);
      await page.keyboard.type(query);
      await page.keyboard.press('Enter');
      await page.waitForURL(`**/search/?q=${query}`);
      if ((await page.locator('#search-section').inputValue()) !== '')
        fail(where, `"${query}": the form selected a section without being asked`);
      const top = (await hrefs(page)).slice(0, 5);
      if (top.length === 0) {
        fail(where, `"${query}": no results`);
        continue;
      }
      for (const path of expected) {
        if (!top.includes(path))
          fail(where, `"${query}": ${path} not in the top 5 (${top.join(', ')})`);
      }
    }

    // The section filter: only planets.
    await page.goto(`${base}/search/?q=ta&section=planets`, { waitUntil: 'networkidle' });
    if ((await page.locator('#search-section').inputValue()) !== 'planets')
      fail(where, 'section=planets did not select Planets in the form');
    const outside = (await hrefs(page)).filter((h) => !h.startsWith('/planets/'));
    if (outside.length > 0) fail(where, `section=planets returned ${outside.join(', ')}`);

    // Suggestions' API: the same search, as JSON, cacheable.
    const api = await fetch(`${base}/api/search?q=vader`);
    const found = await api.json();
    if (found.results?.[0]?.path !== '/characters/anakin-skywalker/')
      fail(where, `/api/search?q=vader → ${JSON.stringify(found.results?.[0])}`);
    if (!(api.headers.get('cache-control') ?? '').includes('s-maxage'))
      fail(where, `/api/search isn't cacheable: ${String(api.headers.get('cache-control'))}`);

    // The SSR page has its own input, and the narrow header offers only a link (swr-1ax).
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/search/?q=luke`, { waitUntil: 'networkidle' });
      const input = page.locator('#search-q');
      for (const key of ['/', 'Control+k', 'Meta+k']) {
        await input.fill('luke');
        await page.locator('h1').click();
        await page.keyboard.press(key);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'search-q')
          fail(where, `${key} did not focus the search page input at ${String(width)}px`);
        await page.keyboard.type('sky');
        if ((await input.inputValue()) !== 'sky')
          fail(where, `${key} did not select the previous query at ${String(width)}px`);
      }
      await input.fill('luke');
      await input.press('End');
      await input.press('/');
      if ((await input.inputValue()) !== 'luke/')
        fail(where, `typing / triggered the shortcut at ${String(width)}px`);
    }
    await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
    await page.keyboard.press('/');
    await page.waitForURL('**/search/#search-q');
    if ((await page.evaluate(() => document.activeElement?.id)) !== 'search-q')
      fail(where, 'the phone shortcut did not focus search on arrival');
    await page.setViewportSize({ width: 1280, height: 900 });

    // axe with results showing, in both schemes.
    await page.goto(`${base}/search/?q=sky`, { waitUntil: 'networkidle' });
    await axe(page, `${where} with results (light)`);
    await page.emulateMedia({ colorScheme: 'dark' });
    // Links and buttons ease their colors (150 ms): check the settled scheme, not the crossfade.
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await axe(page, `${where} with results (dark)`);
  } finally {
    await context.close();
  }
}

/** The suggestion control keeps native focus, navigation and GET submission. */
async function checkSuggestions() {
  const where = 'search suggestions';
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    watch(page, where, 503);
    await page.goto(`${base}/characters/anakin-skywalker/`, { waitUntil: 'networkidle' });
    const input = page.locator('#site-search-q');
    await input.fill('luke');
    const options = page.locator('[role="option"]');
    await options.first().waitFor();
    if ((await input.getAttribute('role')) !== 'combobox') fail(where, 'input did not hydrate');
    if ((await options.count()) > 6) fail(where, 'more than six suggestions');
    if ((await options.first().getAttribute('href')) !== '/characters/luke-skywalker/')
      fail(where, 'Luke was not the first suggestion');
    const badges = await options.first().textContent();
    if (!badges.includes('Canon') || !badges.includes('Legends'))
      fail(where, 'the suggestion lost its continuity badges');
    await input.press('ArrowDown');
    if ((await input.getAttribute('aria-activedescendant')) !== 'site-search-q-option-0')
      fail(where, 'ArrowDown did not select the first suggestion');
    if ((await page.evaluate(() => document.activeElement?.id)) !== 'site-search-q')
      fail(where, 'keyboard selection moved focus out of the input');
    await axe(page, `${where} (light)`);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await axe(page, `${where} (dark)`);
    await input.press('Escape');
    if ((await input.getAttribute('aria-expanded')) !== 'false')
      fail(where, 'Escape did not dismiss suggestions');
    if ((await input.inputValue()) !== 'luke') fail(where, 'Escape cleared the query');
    await input.press('ArrowUp');
    const selected = page.locator('[role="option"][aria-selected="true"]');
    const target = await selected.getAttribute('href');
    await input.press('Enter');
    await page.waitForURL(base + target);
    await page.waitForFunction(() => document.getAnimations().length === 0);

    // A phone enhances the results-page form; its header retains the native search link.
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`${base}/search/?q=ta&section=planets`, { waitUntil: 'networkidle' });
    const phone = page.locator('#search-q');
    await phone.fill('ta');
    await options.first().waitFor();
    const paths = await options.evaluateAll((all) => all.map((a) => a.getAttribute('href')));
    if (paths.some((p) => !p.startsWith('/planets/')))
      fail(where, 'phone suggestions ignored the section filter');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      fail(where, 'the phone palette overflows horizontally');
    await axe(page, `${where} (phone dark)`);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await axe(page, `${where} (phone light)`);
    await options.first().click();
    await page.waitForURL('**/planets/**');

    // An outage announces the problem while ordinary Enter still reaches the SSR results.
    await page.route('**/api/search?*', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(`${base}/search/`, { waitUntil: 'networkidle' });
    await phone.fill('luke');
    await page
      .locator('[data-search-palette]')
      .getByText('Suggestions couldn’t be loaded.', { exact: false })
      .waitFor();
    if (!(await page.locator('[data-search-status]').textContent()).includes('Press Enter'))
      fail(where, 'the outage announcement lost the form fallback');
    await phone.press('Enter');
    await page.waitForURL('**/search/?q=luke&section=');
    if (!(await hrefs(page)).includes('/characters/luke-skywalker/'))
      fail(where, 'Enter did not recover from a suggestion outage');
    await page.unroute('**/api/search?*');
    await phone.fill('Who trained Luke?');
    await page.locator('[data-search-palette] a[href^="/explore/?ask="]').waitFor();
  } finally {
    await context.close();
  }
}

/** Search renders on the server (ADR 0011): results without any JavaScript. */
async function checkWithoutJavaScript() {
  const where = '/search/ (no JavaScript)';
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/characters/luke-skywalker/`);
    await page.locator('#site-search-q').fill('luke');
    await page.locator('header search button[type="submit"]').click();
    await page.waitForURL('**/search/?q=luke');
    await page.goto(`${base}/search/?q=luke`);
    if (!(await hrefs(page)).includes('/characters/luke-skywalker/'))
      fail(where, 'no results for "luke" without JavaScript');
    if ((await page.locator('#search-section').inputValue()) !== '')
      fail(where, 'the section filter did not default to all sections');
    await page.goto(`${base}/search/?q=ta&section=planets`);
    if ((await page.locator('#search-section').inputValue()) !== 'planets')
      fail(where, 'the requested section did not survive server rendering');
  } finally {
    await context.close();
  }
}

async function checkOffline() {
  const where = 'offline';
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons?.find((i) => i.sizes === size && i.purpose === 'any');
    if (icon === undefined) fail(where, `manifest has no ${size} icon`);
    else if ((await fetch(base + icon.src)).status !== 200) fail(where, `${icon.src} is missing`);
  }
  if (manifest.display !== 'standalone' || manifest.start_url !== '/')
    fail(where, 'manifest must set display: standalone and start_url: /');

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => fail(where, `page error: ${e.message}`));
    await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
    // Wait for install (the precache) and for the worker to take control of this page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller === null) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
      }
    });
    // A visit through the worker saves the page.
    await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
    await page.goto(`${base}/explore/`, { waitUntil: 'networkidle' });
    await page.locator('swr-explore #question').waitFor();
    await context.setOffline(true);

    await page.goto(`${base}/characters/luke-skywalker/`);
    const h1 = await page.locator('h1').textContent();
    if (h1 !== 'Luke Skywalker') fail(where, `visited page shows "${String(h1)}" offline`);

    // Automatic components load through a separate loader and chunk; both must be cached.
    await page.goto(`${base}/explore/`);
    await page.locator('swr-explore #question').waitFor();
    if ((await page.locator('swr-explore #question').count()) !== 1)
      fail(where, 'the cached Explore page did not hydrate once offline');

    // Search needs the server now (ADR 0011): offline, a new search gets the offline page.
    await page.goto(`${base}/search/?q=sky`);
    if (!/offline/i.test((await page.locator('h1').textContent()) ?? ''))
      fail(where, 'a search offline does not show the offline page');

    await page.goto(`${base}/species/wookiee/`);
    const offline = await page.locator('h1').textContent();
    if (!/offline/i.test(offline ?? '')) {
      fail(where, `unvisited page shows "${String(offline)}" offline, not the offline page`);
    }
  } finally {
    await context.close();
  }
}

async function checkExplore() {
  const where = '/explore/';
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    watch(page, where);
    await page.goto(`${base}/explore/`, { waitUntil: 'networkidle' });
    const explore = page.locator('swr-explore');
    const status = () =>
      explore.evaluate((el) => el.shadowRoot?.querySelector('#status')?.textContent ?? '');
    // The SQL editor and its ready-made questions are under "Write SQL yourself".
    await explore.locator('details.advanced > summary').click();
    for (const [question, expected] of [
      ['Who comes from Tatooine?', '/characters/luke-skywalker/'],
      ['Articles per section', null],
    ]) {
      await explore.getByRole('button', { name: question }).click();
      try {
        await page.waitForFunction(
          () =>
            /rows? in|didn't run/.test(
              document.querySelector('swr-explore')?.shadowRoot?.querySelector('#status')
                ?.textContent ?? '',
            ),
          undefined,
          { timeout: 60_000 },
        );
      } catch {
        fail(where, `"${question}" never finished`);
        continue;
      }
      const text = await status();
      if (!/rows? in/.test(text)) fail(where, `"${question}": ${text}`);
      if (expected !== null) {
        const links = await explore.evaluate((el) =>
          [...(el.shadowRoot?.querySelectorAll('tbody a') ?? [])].map((a) =>
            a.getAttribute('href'),
          ),
        );
        if (!links.includes(expected)) fail(where, `"${question}" has no link to ${expected}`);
      }
    }
  } finally {
    await context.close();
  }
}

/**
 * A stand-in for the model's endpoint (ADR 0010: the API calls it, the browser never does). It
 * answers by step: the names in the question, a real query over the built database, then a
 * streamed sentence. Any question about Hoth gets a 503, to check the page says the AI is down.
 */
async function fakeModel() {
  const sql =
    "SELECT a.name, a.path, a.era FROM archive a WHERE a.section = 'characters' AND EXISTS (SELECT 1 FROM facts f WHERE f.title = a.title AND f.field = 'homeworld' AND f.link IN ('Tatooine', 'Tatooine/Legends')) ORDER BY a.links DESC, a.name";
  const reply = (res, content) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content } }] }));
  };
  const fake = createHttpServer();
  fake.on('request', (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const request = JSON.parse(body);
      if (JSON.stringify(request.messages).includes('Hoth')) {
        res.writeHead(503).end();
        return;
      }
      const step = request.response_format?.json_schema?.name;
      if (step === 'plan') return reply(res, '{"names":["Tatooine"]}');
      if (step === 'query')
        return reply(res, JSON.stringify({ sql, looksFor: 'people from Tatooine' }));
      const chunk = (text) =>
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`${chunk('Luke Skywalker ')}${chunk('comes from Tatooine.')}data: [DONE]\n\n`);
    });
  });
  await new Promise((resolve) => fake.listen(0, resolve));
  return fake;
}

/** Hold the first response before any event: progress, focus and duplicate guards must be local. */
async function checkAskFeedback() {
  for (const scheme of ['light', 'dark']) {
    const where = `/explore/ (delayed Ask, ${scheme})`;
    const context = await browser.newContext({
      colorScheme: scheme,
      reducedMotion: 'reduce',
      viewport: { width: 360, height: 780 },
    });
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let requests = 0;
    const questions = [];
    try {
      const page = await context.newPage();
      watch(page, where);
      await page.route('**/api/ask', async (route) => {
        questions.push(route.request().postDataJSON());
        requests++;
        if (requests === 1) await held;
        const answer = {
          question: questions.at(-1).question,
          looksFor: 'Luke Skywalker',
          sql: 'SELECT name, path, era FROM archive',
          resolved: [],
          result: {
            columns: ['name', 'path', 'era'],
            rows: [
              ['Luke Skywalker', '/characters/luke-skywalker/', 'canon'],
              ['Luke Skywalker', '/characters/luke-skywalker-legends/', 'legends'],
            ],
            truncated: false,
            ms: 1,
          },
          summary: 'Luke Skywalker comes from Tatooine.',
        };
        const events =
          requests === 2 ? [{ _tag: 'Failed', reason: 'slow' }] : [{ _tag: 'Answered', answer }];
        await route.fulfill({
          contentType: 'text/event-stream',
          body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        });
      });
      await page.goto(`${base}/explore/`, { waitUntil: 'networkidle' });
      const explore = page.locator('swr-explore');
      const input = explore.locator('#question');
      const submit = explore.locator('.ask button[type=submit]');
      const status = explore.locator('#ask-status');
      await input.fill('Who comes from Tatooine?');
      await submit.focus();
      await submit.press('Enter');
      await status.getByText('Reading your question…', { exact: true }).waitFor();
      if (
        (await submit.getAttribute('aria-disabled')) !== 'true' ||
        !(await submit.innerText()).includes('Searching…')
      )
        fail(where, 'the submit button has no immediate busy state');
      const focused = await submit.evaluate(
        (button) => button.getRootNode().activeElement === button,
      );
      if (!focused) fail(where, 'submitting moved keyboard focus');
      if ((await explore.locator('details.examples').getAttribute('open')) !== null)
        fail(where, 'examples did not collapse after submission');
      const ordered = await explore.evaluate((el) => {
        const root = el.shadowRoot;
        return !!(
          root.querySelector('.answer').compareDocumentPosition(root.querySelector('.examples')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      if (!ordered) fail(where, 'progress and answers are below examples');
      await input.press('Enter');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      if (requests !== 1) fail(where, `duplicate submission made ${String(requests)} requests`);
      await axe(page, `${where}, pending`);
      release();
      await status.getByText('1 result.', { exact: true }).waitFor();
      await explore.getByRole('heading', { name: 'Answer', exact: true }).waitFor();
      await axe(page, `${where}, answered`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const islandWide = await explore.evaluate((el) =>
        [...el.shadowRoot.querySelectorAll('form, .answer, .examples')].some(
          (node) => node.getBoundingClientRect().right > innerWidth,
        ),
      );
      if (wide || islandWide) fail(where, 'question or answer overflows at 360px');
      await explore.locator('.answer-steps > summary').click();
      await explore.getByRole('button', { name: 'Open this query in the SQL editor' }).click();
      if ((await explore.locator('#sql').inputValue()) !== 'SELECT name, path, era FROM archive')
        fail(where, 'the answer no longer opens its SQL');
      await input.fill('Only canon');
      await submit.click();
      await status.getByText('That took too long', { exact: false }).waitFor();
      if (questions[1].history.length !== 1) fail(where, 'the follow-up lost its conversation');
      await explore.getByRole('button', { name: 'Retry', exact: true }).click();
      await status.getByText('1 result.', { exact: true }).waitFor();
      if (questions[2].question !== 'Only canon' || questions[2].history.length !== 1)
        fail(where, 'Retry changed the failed question or its conversation');
      await explore.locator('.examples > summary').click();
      await explore
        .getByRole('button', { name: 'Which Wookiees fought for the Rebel Alliance?' })
        .click();
      await status.getByText('1 result.', { exact: true }).waitFor();
      if (
        questions[3].history.length !== 0 ||
        (await explore.locator('details.examples').getAttribute('open')) !== null
      )
        fail(where, 'an example did not start fresh and collapse its disclosure');
      if (!(await input.evaluate((el) => el.getRootNode().activeElement === el)))
        fail(where, 'closing the examples left keyboard focus on a hidden button');
      await page.goto(`${base}/explore/?ask=Who%20is%20Luke%3F`);
      await status.getByText('1 result.', { exact: true }).waitFor();
      if (questions[4].question !== 'Who is Luke?') fail(where, '?ask= no longer asks on arrival');
    } catch (error) {
      fail(where, error.message);
    } finally {
      release();
      await context.close();
    }
  }
}

/**
 * Ask the archive (ADR 0009, 0010), end to end through the API with the fake model: the page
 * shows the answer, links Luke Skywalker, passes axe, and says so when the model is down.
 */
async function checkAsk() {
  const where = '/explore/ (ask)';
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    watch(page, where);
    await page.goto(`${base}/explore/`, { waitUntil: 'networkidle' });
    const explore = page.locator('swr-explore');
    await explore.locator('#question').fill('Who comes from Tatooine?');
    await explore.locator('.ask button[type=submit]').click();
    try {
      if (REMOTE) {
        // Another server asks its own, real model (swr-d6q): its words vary, so wait for the
        // answer's rows, or for the page to say the model isn't answering.
        await explore
          .locator('.ask tbody a')
          .first()
          .or(explore.locator('.ask [role=status]').getByText('isn’t answering'))
          .waitFor({ timeout: 90_000 });
        if ((await explore.locator('.ask tbody a').count()) === 0) throw new Error('unavailable');
      } else {
        await explore
          .locator('.ask .summary')
          .getByText('comes from Tatooine.')
          .waitFor({ timeout: 60_000 });
      }
    } catch {
      fail(where, `no answer: ${await explore.locator('.ask').innerText()}`);
      return;
    }
    const links = await explore.evaluate((el) =>
      [...(el.shadowRoot?.querySelectorAll('.ask tbody a') ?? [])].map((a) =>
        a.getAttribute('href'),
      ),
    );
    if (!links.includes('/characters/luke-skywalker/'))
      fail(where, 'the answer has no link to Luke Skywalker');
    await axe(page, where);
    // The model failing can only be staged with the local fake; another server's is real.
    if (REMOTE) return;

    await explore.locator('#question').fill('Who comes from Hoth?');
    await explore.locator('.ask button[type=submit]').click();
    try {
      await explore
        .locator('.ask [role=status]')
        .getByText('isn’t answering')
        .waitFor({ timeout: 30_000 });
    } catch {
      fail(where, 'with the model down, the page doesn’t say so');
    }
  } finally {
    await context.close();
  }
}

/**
 * Page-to-page view transitions and hover-to-fetch (ADR 0011): pages carry the Speculation-Rules
 * header, the rules file has the MIME type browsers insist on, and following a link from home to
 * a section runs a cross-document view transition.
 */
async function checkTransitions() {
  const where = '/ → /characters/ (view transition)';
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    watch(page, where);
    // Each page records whether it arrived with a transition, under its own path: a fast page
    // can fire `load` before its first frame, and `pagereveal` comes with that frame.
    await page.addInitScript(() => {
      addEventListener('pagereveal', (event) => {
        sessionStorage.setItem(
          `reveal:${location.pathname}`,
          String(event.viewTransition !== null),
        );
      });
    });
    const home = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    if (home?.headers()['speculation-rules'] !== '"/speculation-rules.json"')
      fail(where, 'the page has no Speculation-Rules header');
    const rules = await page.request.get(`${base}/speculation-rules.json`);
    if (!(rules.headers()['content-type'] ?? '').startsWith('application/speculationrules+json'))
      fail(where, `the rules are served as ${String(rules.headers()['content-type'])}`);
    await page.locator('main a[href="/characters/"]').first().click();
    await page.waitForURL('**/characters/');
    const ran = await page
      .waitForFunction(() => sessionStorage.getItem('reveal:/characters/'), null, { timeout: 5000 })
      .then(
        (answer) => answer.jsonValue(),
        () => 'nothing',
      );
    if (ran !== 'true') fail(where, `no view transition ran (pagereveal said ${String(ran)})`);
  } finally {
    await context.close();
  }
}

/** A random jump stretches named points into trails, then cleans up for Back or Escape. */
async function checkHyperspace() {
  for (const scheme of ['light', 'dark']) {
    const where = `/ → /random/ (hyperspace, ${scheme})`;
    const context = await browser.newContext({
      colorScheme: scheme,
      reducedMotion: 'no-preference',
      viewport: { width: 360, height: 780 },
    });
    try {
      const page = await context.newPage();
      watch(page, where);
      await page.addInitScript(() => {
        addEventListener('pagereveal', (event) => {
          if (!event.viewTransition) return;
          event.viewTransition.ready.then(
            () => {
              const star = document
                .getAnimations()
                .find(
                  (animation) =>
                    animation.effect.pseudoElement ===
                    '::view-transition-group(hyperspace-star-23)',
                );
              if (!star) return;
              sessionStorage.setItem(
                'jump-capture',
                JSON.stringify({
                  duration: star.effect.getTiming().duration,
                  widths: star.effect.getKeyframes().map((frame) => frame.width),
                  field: document.querySelector('.hyperspace-field') !== null,
                  started: Date.now(),
                }),
              );
              event.viewTransition.finished.then(() => {
                sessionStorage.setItem(
                  'jump-duration',
                  String(Date.now() - JSON.parse(sessionStorage.getItem('jump-capture')).started),
                );
              });
            },
            () => {},
          );
        });
      });
      const jump = async (keyboard = false) => {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        const link = page.locator('a[href="/random/"]');
        if (keyboard) await link.press('Enter', { noWaitAfter: true });
        else await link.click({ noWaitAfter: true });
        await page.waitForURL((url) => url.pathname !== '/');
        await page.waitForFunction(() => sessionStorage.getItem('jump-capture'));
      };
      await jump();
      const capture = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jump-capture')));
      if (
        capture.duration !== 4000 ||
        !capture.field ||
        parseFloat(capture.widths[0]) !== 2 ||
        parseFloat(capture.widths.at(-1)) <= 35
      )
        fail(where, `stars did not stretch into four-second trails: ${JSON.stringify(capture)}`);
      await page.waitForFunction(() => sessionStorage.getItem('jump-duration'));
      const elapsed = await page.evaluate(() => Number(sessionStorage.getItem('jump-duration')));
      if (elapsed < 3600) fail(where, `the jump ended early at ${String(elapsed)} ms`);
      const clean = () =>
        page.evaluate(
          () =>
            !document.documentElement.hasAttribute('data-hyperspace') &&
            document.querySelector('.hyperspace-field') === null &&
            sessionStorage.getItem('swr-hyperspace-to') === null,
        );
      if (!(await clean())) fail(where, 'the completed jump left stars or a pending destination');
      await page.goBack({ waitUntil: 'networkidle' });
      if (!(await clean())) fail(where, 'Back restored the temporary stars');
      await page.evaluate(() => {
        sessionStorage.removeItem('jump-capture');
        sessionStorage.removeItem('jump-duration');
      });
      await jump(true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-hyperspace'));
      if (!(await clean())) fail(where, 'Escape did not clean up the jump');
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      const preference = page.getByRole('checkbox', { name: 'Animate hyperspace jumps' });
      await preference.uncheck();
      await page.reload({ waitUntil: 'networkidle' });
      if (await preference.isChecked()) fail(where, 'the opt-out was forgotten after reload');
      await page.locator('a[href="/random/"]').click();
      await page.waitForURL((url) => url.pathname !== '/');
      if (!(await clean())) fail(where, 'the stored opt-out still showed stars');
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await preference.check();
      await page.reload({ waitUntil: 'networkidle' });
      if (!(await preference.isChecked())) fail(where, 'the effect could not be enabled again');
    } catch (error) {
      fail(where, error.message);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    watch(page, '/random/ (reduced motion)');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.locator('a[href="/random/"]').click();
    await page.waitForURL((url) => url.pathname !== '/');
    const clean = await page.evaluate(
      () =>
        !document.documentElement.hasAttribute('data-hyperspace') &&
        document.querySelector('.hyperspace-field') === null &&
        sessionStorage.getItem('swr-hyperspace-to') === null,
    );
    if (!clean) fail('/random/', 'reduced motion still created the hyperspace effect');
  } finally {
    await context.close();
  }
}

/** The continuity filter on a letter page hides the other continuity's rows, with CSS alone. */
async function checkEraFilter() {
  const where = '/characters/letters/l/ (continuity filter)';
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    watch(page, where);
    await page.goto(`${base}/characters/letters/l/`, { waitUntil: 'networkidle' });
    const visible = (era) => page.locator(`main li[data-era="${era}"]:visible`).count();
    // The labels are what a visitor clicks; the radios inside them are 1 px and hidden.
    const choose = (text) =>
      page.locator('fieldset[data-era-filter] label').filter({ hasText: text }).click();
    if ((await visible('legends')) === 0) fail(where, 'no Legends rows to filter');
    await choose('Canon');
    if ((await visible('legends')) !== 0) fail(where, 'Canon still shows Legends rows');
    if ((await visible('canon')) === 0) fail(where, 'Canon hides the canon rows');
    await choose('Legends');
    if ((await visible('canon')) !== 0) fail(where, 'Legends still shows canon rows');
    const next = page.locator('nav[data-pagination] a[rel="next"]:visible');
    if ((await next.count()) !== 0) {
      const target = await next.getAttribute('href');
      await next.click();
      await page.waitForURL(base + target);
      if ((await page.locator('input[name="era"]:checked').inputValue()) !== 'legends')
        fail(where, 'the next page lost the continuity choice');
      if ((await visible('canon')) !== 0) fail(where, 'the next page shows canon rows');
    }
    await axe(page, where);
  } finally {
    await context.close();
  }
}

/** A port nothing is listening on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function checkDevServer() {
  const where = 'dev server';
  const [port, hmr] = [await freePort(), await freePort()];
  const dev = spawn(
    new URL('../node_modules/.bin/tsx', import.meta.url).pathname,
    ['scripts/dev.ts'],
    {
      env: { ...process.env, PORT: String(port), HMR_PORT: String(hmr), SITE_SAMPLE: '20' },
      stdio: 'pipe',
    },
  );
  let log = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`didn't start in 120s: ${log}`)), 120_000);
      const read = (chunk) => {
        log += String(chunk);
        if (log.includes(`localhost:${String(port)}`)) {
          clearTimeout(timer);
          resolve();
        }
      };
      dev.stdout.on('data', read);
      dev.stderr.on('data', read);
      dev.once('exit', (code) => reject(new Error(`exited with ${String(code)}: ${log}`)));
    });
    const devBase = `http://localhost:${String(port)}`;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      watch(page, where);
      for (const path of ['/', '/characters/luke-skywalker/']) {
        const response = await page.goto(devBase + path, { waitUntil: 'networkidle' });
        if (response?.status() !== 200)
          fail(where, `${path}: status ${String(response?.status())}`);
      }
      // Dev searches the last build's pages.sqlite (DIST_DIR-api), beside its own archive.
      await page.goto(`${devBase}/search/?q=sky`, { waitUntil: 'networkidle' });
      if ((await hrefs(page)).length === 0) fail(where, '"sky" found nothing on the dev server');
      await page.goto(`${devBase}/explore/`, { waitUntil: 'networkidle' });
      await page.locator('swr-explore #question').waitFor();
      const copies = await page.locator('swr-explore #question').count();
      if (copies !== 1) fail(where, `automatic loading hydrated ${String(copies)} Explore copies`);
    } finally {
      await context.close();
    }
  } catch (error) {
    fail(where, error instanceof Error ? error.message : String(error));
  } finally {
    dev.kill();
  }
}

mkdirSync('.smoke', { recursive: true });
const seconds = ((Date.now() - started) / 1000).toFixed(0);
/** What this run checked: against another server, Ask uses its real model and there's no dev server. */
const checked = REMOTE
  ? `search, offline, Explore, Ask (${base}'s own model; the model-outage check needs the local fake, so it was skipped), transitions and the continuity filter`
  : 'search, offline, Explore, Ask, transitions, the continuity filter and the dev server';
const report = [
  '# Smoke report',
  '',
  `${String(paths.length + unlisted.length)} pages and the 404 page, light and dark, plus ${checked} (${seconds}s).`,
  '',
  failures.length === 0 ? 'All checks passed.' : failures.map((f) => `- ${f}`).join('\n'),
  '',
].join('\n');
writeFileSync('.smoke/report.md', report);
if (failures.length > 0) {
  console.error(report);
  process.exit(1);
}
console.log(
  `smoke: ${String(paths.length + unlisted.length)} pages + 404, light and dark, ${checked}: all checks passed (${seconds}s)`,
);
