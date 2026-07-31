#!/usr/bin/env node
/**
 * capture-screens.mjs — batch visual + accessibility evidence capture.
 *
 * Setup (once, in the target project):
 *   npm i -D playwright @axe-core/playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node capture-screens.mjs --base http://localhost:3000 \
 *     --routes / /dashboard /settings \
 *     --out .audit/screens \
 *     --axe --dark --rtl --full
 *
 * Flags:
 *   --base <url>        base URL (default http://localhost:3000)
 *   --routes <a> <b>    routes to capture (default /)
 *   --out <dir>         output directory (default .audit/screens)
 *   --widths <n> <n>    override widths (default 360 768 1280 1920)
 *   --axe               run axe-core on each route at 1280 and write JSON
 *   --dark              also capture with prefers-color-scheme: dark
 *   --rtl               also capture with dir="rtl"
 *   --reduced           also capture with prefers-reduced-motion: reduce
 *   --full              full-page screenshots instead of viewport-only
 *   --wait <ms>         extra settle time per page (default 400)
 *
 * Outputs:
 *   <out>/<route>__<width>[__variant].png
 *   <out>/axe-<route>.json
 *   <out>/summary.json      route/width/variant index + axe violation counts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);

function list(flag, fallback) {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]);
  return out.length ? out : fallback;
}
function single(flag, fallback) {
  const i = argv.indexOf(flag);
  return i === -1 || !argv[i + 1] ? fallback : argv[i + 1];
}
const has = (flag) => argv.includes(flag);

const base = single('--base', 'http://localhost:3000').replace(/\/$/, '');
const routes = list('--routes', ['/']);
const outDir = single('--out', '.audit/screens');
const widths = list('--widths', ['360', '768', '1280', '1920']).map(Number);
const settle = Number(single('--wait', '400'));

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^\w-]+/g, '-')) || 'home';

const variants = [{ name: '', colorScheme: 'light', rtl: false, motion: 'no-preference' }];
if (has('--dark')) variants.push({ name: 'dark', colorScheme: 'dark', rtl: false, motion: 'no-preference' });
if (has('--rtl')) variants.push({ name: 'rtl', colorScheme: 'light', rtl: true, motion: 'no-preference' });
if (has('--reduced')) variants.push({ name: 'reduced', colorScheme: 'light', rtl: false, motion: 'reduce' });

const { chromium } = await import('playwright');

let AxeBuilder = null;
if (has('--axe')) {
  try {
    ({ default: AxeBuilder } = await import('@axe-core/playwright'));
  } catch {
    console.warn('! @axe-core/playwright not installed — skipping accessibility scan.');
  }
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const summary = { base, capturedAt: new Date().toISOString(), shots: [], axe: {} };
let failures = 0;

for (const variant of variants) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: Math.round(width * 0.72) },
      colorScheme: variant.colorScheme,
      reducedMotion: variant.motion === 'reduce' ? 'reduce' : 'no-preference',
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    if (variant.rtl) {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.setAttribute('dir', 'rtl');
        });
      });
    }

    for (const route of routes) {
      const url = `${base}${route.startsWith('/') ? route : `/${route}`}`;
      const suffix = variant.name ? `__${variant.name}` : '';
      const file = path.join(outDir, `${slug(route)}__${width}${suffix}.png`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(settle);
        await page.screenshot({ path: file, fullPage: has('--full') });
        summary.shots.push({ route, width, variant: variant.name || 'default', file });
        console.log(`✓ ${file}`);
      } catch (err) {
        failures++;
        console.error(`✗ ${url} @${width}${suffix} — ${err.message}`);
      }
    }

    // axe once per route, at 1280, on the default variant only
    if (AxeBuilder && width === 1280 && !variant.name) {
      for (const route of routes) {
        const url = `${base}${route.startsWith('/') ? route : `/${route}`}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          const dest = path.join(outDir, `axe-${slug(route)}.json`);
          await writeFile(dest, JSON.stringify(results, null, 2));
          summary.axe[route] = {
            violations: results.violations.length,
            critical: results.violations.filter((v) => v.impact === 'critical').length,
            serious: results.violations.filter((v) => v.impact === 'serious').length,
            file: dest,
          };
          console.log(`✓ ${dest} — ${results.violations.length} violation types`);
        } catch (err) {
          console.error(`✗ axe ${url} — ${err.message}`);
        }
      }
    }

    await context.close();
  }
}

await browser.close();
await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log(`\n${summary.shots.length} screenshots → ${outDir}`);
if (Object.keys(summary.axe).length) {
  const total = Object.values(summary.axe).reduce((n, r) => n + r.violations, 0);
  console.log(`axe: ${total} violation types across ${Object.keys(summary.axe).length} routes`);
}
if (failures) console.log(`${failures} capture(s) failed — see above.`);

console.log('\nReminder: automated checks find roughly a third of real accessibility');
console.log('barriers. Do the keyboard pass, focus-order check, and 200% zoom manually.');
