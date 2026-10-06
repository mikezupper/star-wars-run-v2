// `pnpm smoke` (part of `pnpm check`, after `pnpm build`): opens the built site in Chromium
// through the preview server and checks every page in the sitemap, /search/ and the 404 page:
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
//   once the service worker controls the page, a visited record page, search, and the offline
//   page for an unvisited record all work with the network off;
// - Explore (swr-7f1.7): DuckDB-WASM starts under the CSP and answers a question from the
//   archive's database, with names linking to their pages;
// - the dev server (`pnpm dev`): home, a record page and search work, with no console errors
//   (it serves the search index from dist/, see docs/lessons-learned.md). Skipped when
//   SMOKE_BASE_URL points at another server.
// Report: .smoke/report.md. Exit 1 on any failure. Adapted from gyral.dev's scripts/smoke.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { tsImport } from 'tsx/esm/api';

// SMOKE_BASE_URL=http://localhost:8080 runs every check against another server instead, such
// as the Docker image (`pnpm docker:run`). The page list still comes from the local dist/.
const dist = new URL('../dist/', import.meta.url).pathname;
const server = process.env.SMOKE_BASE_URL === undefined ? await startPreview() : undefined;
const base = process.env.SMOKE_BASE_URL ?? `http://localhost:${String(server.address().port)}`;

async function startPreview() {
  const { createPreview } = await tsImport('./preview.ts', import.meta.url);
  const preview = createPreview(dist.replace(/\/$/, ''));
  await new Promise((resolve) => preview.listen(0, resolve));
  return preview;
}

const paths = [
  ...readFileSync(`${dist}sitemap.xml`, 'utf8').matchAll(
    /<loc>https:\/\/starwars\.run(\/[^<]*)<\/loc>/g,
  ),
].map((m) => m[1]);
// Pages deliberately left out of the sitemap (noindex) that still ship.
const unlisted = ['/search/', '/offline/'];
/** Each query must list every expected page in its first five results. */
const SEARCHES = [
  [
    'sky',
    [
      '/characters/luke-skywalker/',
      '/characters/anakin-skywalker/',
      '/characters/shmi-skywalker-lars/',
    ],
  ],
  ['tatooine', ['/planets/tatooine/']],
  ['falcon', ['/starships/millennium-falcon/']],
  ['padme', ['/characters/padme-amidala-naberrie/']],
];

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
  if (process.env.SMOKE_BASE_URL === undefined) await checkDevServer();
} finally {
  await browser.close();
  server?.close();
}

/** Home, list pages, search, 404, and the first two records of each kind. */
function darkSample(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return true;
  const ofKind = paths.filter((p) => p.startsWith(`/${parts[0]}/`) && p !== `/${parts[0]}/`);
  return ofKind.indexOf(path) < 2;
}

async function pool(items, size, work) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

function watch(page, where, status = 200) {
  page.on('console', (m) => {
    // The browser logs the 404 response itself as an error; that one is expected.
    if (m.type() === 'error' && !(status === 404 && /404/.test(m.text())))
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
  const checked = new Map();
  for (const href of links) {
    const url = new URL(href);
    if (url.origin !== base || checked.has(url.pathname)) continue;
    const res = await fetch(base + url.pathname, { redirect: 'manual' });
    checked.set(url.pathname, res.status);
    if (res.status !== 200) fail('links', `${url.pathname} → ${String(res.status)}`);
  }
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
    // A visit through the worker saves the page.
    await page.goto(`${base}/characters/luke-skywalker/`, { waitUntil: 'networkidle' });
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
      explore.evaluate((el) => el.shadowRoot?.querySelector('[role=status]')?.textContent ?? '');
    for (const [question, expected] of [
      ['Who comes from Tatooine?', '/characters/luke-skywalker/'],
      ['Articles per section', null],
    ]) {
      await explore.getByRole('button', { name: question }).click();
      try {
        await page.waitForFunction(
          () =>
            /rows? in|didn't run/.test(
              document.querySelector('swr-explore')?.shadowRoot?.querySelector('[role=status]')
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
  `smoke: ${String(paths.length + unlisted.length)} pages + 404, light and dark, search, offline, Explore and dev server: all checks passed (${seconds}s)`,
);
