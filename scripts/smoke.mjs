// `pnpm smoke` (part of `pnpm check`, after `pnpm build`): opens the built site in Chromium
// through the preview server and checks every page in the sitemap (or, with SMOKE_PAGES=N, a
// sample of N: see samplePaths), /search/ and the 404 page:
// - status 200 (404 for the 404 page), and no console errors or page errors;
// - axe finds no violations: every page in light; in dark, home, every list page, the first
//   two records of each kind, search and 404 (each kind shares one template and one set of
//   color tokens, so a sample covers the dark palette);
// - no horizontal overflow at phone width (360px);
// - every internal link resolves;
// - search (docs/product-specs/search.md): the header form and the `/` key reach /search/,
//   each query finds its expected pages in the top five, the kind filter filters, arrows and
//   Escape work, the island hydrates in place (one copy), and without JavaScript the page
//   offers the section links instead;
// - offline (docs/product-specs/offline.md): the manifest is valid with 192px and 512px icons;
//   once the service worker controls the page, a visited page, a search made before, and the offline
//   page for an unvisited record all work with the network off;
// - Explore (swr-7f1.7): DuckDB-WASM starts under the CSP and answers a question from the
//   archive's database, with names linking to their pages; Ask the archive (swr-ei6) answers a
//   question with the model stubbed, passes axe, and says so when the model is down;
// - page-to-page view transitions run, and pages point browsers at the hover-to-fetch rules;
// - the dev server (`pnpm dev`): home, a record page and search work, with no console errors
//   (it serves the search index from dist/, see docs/lessons-learned.md). Skipped when
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
const server = process.env.SMOKE_BASE_URL === undefined ? await startPreview() : undefined;
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
    p.split('/').filter(Boolean).length < 2 || /^\/[a-z-]+\/[a-z0-9]\/$/.test(p);
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
  await checkWithoutJavaScript();
  await checkOffline();
  await checkExplore();
  await checkAsk();
  await checkTransitions();
  await checkEraFilter();
  if (process.env.SMOKE_BASE_URL === undefined) await checkDevServer();
} finally {
  await browser.close();
  server?.close();
  model.close();
}

/** Home, list pages, search, 404, and the first two records of each kind. */
function darkSample(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return true;
  const ofKind = paths.filter((p) => p.startsWith(`/${parts[0]}/`) && p !== `/${parts[0]}/`);
  return ofKind.indexOf(path) < 2;
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

function island(page) {
  return page.locator('swr-site-search');
}

function hrefs(page) {
  return island(page)
    .locator('ol a')
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
      try {
        await island(page).locator('ol a').first().waitFor({ timeout: 5000 });
      } catch {
        fail(where, `"${query}": no results`);
        continue;
      }
      const top = (await hrefs(page)).slice(0, 5);
      for (const path of expected) {
        if (!top.includes(path))
          fail(where, `"${query}": ${path} not in the top 5 (${top.join(', ')})`);
      }
    }

    const copies = await island(page).evaluate(
      (el) => el.shadowRoot?.querySelectorAll('input#q').length ?? 0,
    );
    if (copies !== 1) fail(where, `${String(copies)} search boxes after hydration, expected 1`);

    // The kind filter: only planets.
    await page.goto(`${base}/search/?q=ta&kind=planets`, { waitUntil: 'networkidle' });
    await island(page).locator('ol a').first().waitFor({ timeout: 5000 });
    const outside = (await hrefs(page)).filter((h) => !h.startsWith('/planets/'));
    if (outside.length > 0) fail(where, `kind=planets returned ${outside.join(', ')}`);

    // Keys: ArrowDown from the box focuses the first result; Escape clears the box.
    await island(page).locator('#q').focus();
    await page.keyboard.press('ArrowDown');
    const active = await island(page).evaluate((el) => el.shadowRoot?.activeElement?.id ?? '');
    if (active !== 'hit-0') fail(where, `ArrowDown focused "${active}", expected hit-0`);
    await page.keyboard.press('Escape');
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('swr-site-search')?.shadowRoot?.querySelector('#q')?.value === '',
        undefined,
        { timeout: 2000 },
      );
    } catch {
      fail(where, 'Escape did not clear the search box');
    }

    // axe with results showing, in both schemes.
    await page.goto(`${base}/search/?q=sky`, { waitUntil: 'networkidle' });
    await island(page).locator('ol a').first().waitFor({ timeout: 5000 });
    await axe(page, `${where} with results (light)`);
    await page.emulateMedia({ colorScheme: 'dark' });
    // Links and buttons ease their colors (150 ms): check the settled scheme, not the crossfade.
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await axe(page, `${where} with results (dark)`);
  } finally {
    await context.close();
  }
}

async function checkWithoutJavaScript() {
  const where = '/search/ (no JavaScript)';
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/search/?q=sky`);
    const fallback = await page.locator('swr-site-search a[href="/characters/"]').count();
    if (fallback !== 1) fail(where, 'no fallback link to /characters/');
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
    // A visit through the worker saves the page, and a search saves the index chunks it reads.
    await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
    await page.goto(`${base}/search/?q=sky`);
    await island(page).locator('ol a').first().waitFor({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);

    await page.goto(`${base}/characters/luke-skywalker/`);
    const h1 = await page.locator('h1').textContent();
    if (h1 !== 'Luke Skywalker') fail(where, `visited page shows "${String(h1)}" offline`);

    await page.goto(`${base}/search/?q=sky`);
    try {
      await island(page).locator('ol a').first().waitFor({ timeout: 5000 });
    } catch {
      fail(where, 'search found nothing offline');
    }

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
      await explore
        .locator('.ask .summary')
        .getByText('comes from Tatooine.')
        .waitFor({ timeout: 60_000 });
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

/** The continuity filter on a letter page hides the other continuity's rows, with CSS alone. */
async function checkEraFilter() {
  const where = '/characters/l/ (continuity filter)';
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    watch(page, where);
    await page.goto(`${base}/characters/l/`, { waitUntil: 'networkidle' });
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
      await page.goto(`${devBase}/search/?q=sky`, { waitUntil: 'networkidle' });
      try {
        await island(page).locator('ol a').first().waitFor({ timeout: 15_000 });
      } catch {
        fail(where, '"sky" found nothing on the dev server');
      }
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
const report = [
  '# Smoke report',
  '',
  `${String(paths.length + unlisted.length)} pages and the 404 page, light and dark, plus search, offline, Explore and the dev server (${seconds}s).`,
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
  `smoke: ${String(paths.length + unlisted.length)} pages + 404, light and dark, search, offline, Explore, transitions, the continuity filter and dev server: all checks passed (${seconds}s)`,
);
