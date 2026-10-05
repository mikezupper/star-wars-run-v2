// `pnpm icons`: renders public/icons/icon.svg to the PNG sizes the web manifest and iOS need.
// The mark is centred with a full-bleed background, so the same art is safe as a maskable icon
// (Android crops to a circle of 80% diameter). Re-run after changing icon.svg; commit the PNGs.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
try {
  for (const [name, size] of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${svg}`,
    );
    await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`icons: rendered ${SIZES.map(([n]) => n).join(', ')}`);
