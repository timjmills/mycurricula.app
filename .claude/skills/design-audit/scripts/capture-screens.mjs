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
 *   --axe               run axe-core once per route, at whichever requested
 *                       width is nearest 1280, and write JSON
 *   --dark              also capture with prefers-color-scheme: dark
 *   --dark-attrs <k=v>  root-element attributes that put the app into dark mode,
 *                       for apps that ignore prefers-color-scheme (see below)
 *   --rtl               also capture with dir="rtl"
 *   --reduced           also capture with prefers-reduced-motion: reduce
 *   --full              full-page screenshots instead of viewport-only
 *   --wait <ms>         extra settle time per page (default 400)
 *
 * Dark mode, honestly:
 *   --dark only emulates the `prefers-color-scheme: dark` media feature. An app
 *   that drives dark from a root data attribute instead — mycurricula.app uses
 *   data-theme="night", from which it derives data-tone="dark" — IGNORES that
 *   media signal completely, so a --dark run captures light pixels and files
 *   them under "dark". For those apps, pass the attributes as well:
 *
 *     --dark --dark-attrs data-theme=night
 *
 *   The script stamps them on <html>, re-reads them after load, and if they did
 *   not stick it labels the capture "dark: NOT APPLIED" and exits 2 — rather
 *   than let you grade a condition that was never in effect.
 *
 * Settle time is NOT a hydration gate:
 *   --wait is a crude fixed delay. Server-rendered markup is usually the DESKTOP
 *   branch at every width (viewport hooks default false on the server), so a
 *   narrow capture taken pre-hydration shows a desktop layout. For responsive or
 *   behavioural claims, drive the page through a browser MCP and gate on a
 *   client-only signal instead of trusting these screenshots alone.
 *
 * Exit codes — the instrument must never report success it did not earn:
 *   0  fully verified — every intended capture ran and succeeded
 *   1  real failures — captures or axe scans errored (the app looks broken)
 *   2  incomplete coverage — the instrument was blind: nothing was captured,
 *      every route was redirected away (an auth gate turns a full green run into
 *      a portrait of the login page), --axe was requested but no scan ran, or a
 *      requested variant did not apply. 2 outranks 1: a blind run cannot testify
 *      about the app at all.
 *
 * Outputs:
 *   <out>/<route>__<width>[__variant].png
 *   <out>/axe-<route>.json
 *   <out>/summary.json      route/width/variant index + axe counts + exit reason
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

const routePath = (r) => (r.startsWith('/') ? r : `/${r}`);
const normalisePath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Did the browser end up on the page we asked for? An auth gate that bounces
 * every route to /login yields a full set of green captures and a clean axe
 * report — about the login page. Comparing the landed path to the requested one
 * is the positive control that stops a redirect from reading as coverage.
 */
function landedOffRoute(requested, actualUrl) {
  try {
    const landed = normalisePath(new URL(actualUrl).pathname);
    const wanted = normalisePath(routePath(requested));
    return landed === wanted ? null : landed;
  } catch {
    return null;
  }
}

// Real device viewports, matching evidence-protocol.md §7. A viewport derived
// from the width alone (e.g. width × 0.72) makes a "375" shot 375×270, which is
// a letterbox no device has and which hides everything below the fold.
const DEVICE_VIEWPORTS = [
  [360, 740], // small mobile
  [414, 896], // large mobile
  [768, 1024], // tablet portrait
  [1024, 768], // tablet landscape
  [1280, 800], // laptop
  [1440, 900], // desktop
  [1920, 1080], // large desktop
];

function heightFor(width) {
  let best = DEVICE_VIEWPORTS[0];
  for (const entry of DEVICE_VIEWPORTS) {
    if (Math.abs(entry[0] - width) < Math.abs(best[0] - width)) best = entry;
  }
  return Math.max(700, best[1]);
}

// Below this width we emulate an actual phone. A merely-narrow desktop window
// does not fire coarse-pointer, hover-capability, or phone-only layout rules,
// so it cannot stand in for a phone check.
const PHONE_MAX_WIDTH = 480;
const isPhoneWidth = (width) => width <= PHONE_MAX_WIDTH;

function parseAttrs(values) {
  const out = {};
  for (const raw of values) {
    for (const piece of raw.split(',')) {
      const [key, ...rest] = piece.split('=');
      if (!key || !rest.length) continue;
      out[key.trim()] = rest.join('=').trim();
    }
  }
  return Object.keys(out).length ? out : null;
}

const darkAttrs = parseAttrs(list('--dark-attrs', []));

const variants = [{ name: '', colorScheme: 'light', motion: 'no-preference', attrs: null }];
if (has('--dark'))
  variants.push({ name: 'dark', colorScheme: 'dark', motion: 'no-preference', attrs: darkAttrs });
if (has('--rtl'))
  variants.push({ name: 'rtl', colorScheme: 'light', motion: 'no-preference', attrs: { dir: 'rtl' } });
if (has('--reduced'))
  variants.push({ name: 'reduced', colorScheme: 'light', motion: 'reduce', attrs: null });

if (has('--dark') && !darkAttrs) {
  console.warn('! --dark emulates prefers-color-scheme only.');
  console.warn('  Apps that drive dark from a root attribute ignore it, and these captures');
  console.warn('  will be light pixels filed under "dark". If that is this app, re-run with');
  console.warn('  e.g. --dark-attrs data-theme=night so the condition can be verified.');
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.error(`✗ playwright is not installed — nothing can be captured. ${err.message}`);
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const axeRequested = has('--axe');
let AxeBuilder = null;
if (axeRequested) {
  try {
    ({ default: AxeBuilder } = await import('@axe-core/playwright'));
  } catch {
    console.warn('! @axe-core/playwright not installed — accessibility scan cannot run.');
  }
}

// axe runs once per route, on the default variant, at whichever REQUESTED width
// sits nearest 1280. Hard-coding `width === 1280` meant that any project auditing
// at its own tiers (e.g. 375/768/1440) silently ran no scan at all.
const axeWidth = widths.reduce(
  (best, w) => (Math.abs(w - 1280) < Math.abs(best - 1280) ? w : best),
  widths[0],
);

await mkdir(outDir, { recursive: true });

const intendedShots = variants.length * widths.length * routes.length;
const intendedAxeScans = AxeBuilder ? routes.length : 0;

console.log(`intended coverage: ${intendedShots} captures — ${routes.length} route(s) × `
  + `${widths.length} width(s) × ${variants.length} variant(s)`);
if (axeRequested) {
  console.log(`intended coverage: ${intendedAxeScans} axe scan(s) — 1 per route at ${axeWidth}px`);
}
console.log('');

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(`✗ could not launch chromium — ${err.message}`);
  process.exit(2);
}

const summary = { base, capturedAt: new Date().toISOString(), shots: [], axe: {} };
let failures = 0;
let axeScans = 0;
let redirectedShots = 0;
let redirectedAxe = 0;
const variantsNotApplied = new Set();

/**
 * Stamp the variant's root attributes and read them straight back. An app's own
 * theme boot script (or a React provider reconciling on mount) can overwrite
 * them, so what we asked for is not evidence of what applied — only the read-back
 * is. Returns { ok, actual }.
 */
async function applyRootAttrs(page, attrs) {
  if (!attrs) return { ok: true, actual: {} };
  await page.evaluate((pairs) => {
    for (const [key, value] of Object.entries(pairs)) {
      document.documentElement.setAttribute(key, value);
    }
  }, attrs);
  await page.waitForTimeout(150);
  const actual = await page.evaluate((pairs) => {
    const seen = {};
    for (const key of Object.keys(pairs)) seen[key] = document.documentElement.getAttribute(key);
    return seen;
  }, attrs);
  return { ok: Object.entries(attrs).every(([key, value]) => actual[key] === value), actual };
}

for (const variant of variants) {
  for (const width of widths) {
    const phone = isPhoneWidth(width);
    const emulation = phone ? 'phone' : 'desktop-window';

    const context = await browser.newContext({
      viewport: { width, height: heightFor(width) },
      colorScheme: variant.colorScheme,
      reducedMotion: variant.motion === 'reduce' ? 'reduce' : 'no-preference',
      deviceScaleFactor: phone ? 3 : 1,
      isMobile: phone,
      hasTouch: phone,
    });
    const page = await context.newPage();

    if (variant.attrs) {
      await page.addInitScript((pairs) => {
        const stamp = () => {
          if (!document.documentElement) return;
          for (const [key, value] of Object.entries(pairs)) {
            document.documentElement.setAttribute(key, value);
          }
        };
        stamp();
        document.addEventListener('DOMContentLoaded', stamp);
      }, variant.attrs);
    }

    for (const route of routes) {
      const url = `${base}${route.startsWith('/') ? route : `/${route}`}`;
      const suffix = variant.name ? `__${variant.name}` : '';
      const file = path.join(outDir, `${slug(route)}__${width}${suffix}.png`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(settle);

        const applied = await applyRootAttrs(page, variant.attrs);
        const label = variant.name || 'default';
        if (!applied.ok) {
          variantsNotApplied.add(label);
          console.error(
            `! ${label}: NOT APPLIED on ${url} — wanted ${JSON.stringify(variant.attrs)}, `
              + `root has ${JSON.stringify(applied.actual)}`,
          );
        }

        const offRoute = landedOffRoute(route, page.url());
        if (offRoute) redirectedShots++;

        await page.screenshot({ path: file, fullPage: has('--full') });
        summary.shots.push({
          route,
          width,
          height: heightFor(width),
          variant: label,
          emulated: emulation,
          variantApplied: applied.ok,
          landedOn: offRoute ?? routePath(route),
          file,
        });
        console.log(
          `✓ ${file}  [emulated: ${emulation}]`
            + (applied.ok ? '' : `  [${label}: NOT APPLIED]`)
            + (offRoute ? `  [REDIRECTED → ${offRoute} — not evidence about ${routePath(route)}]` : ''),
        );
      } catch (err) {
        failures++;
        console.error(`✗ ${url} @${width}${suffix} — ${err.message}`);
      }
    }

    if (AxeBuilder && width === axeWidth && !variant.name) {
      for (const route of routes) {
        const url = `${base}${route.startsWith('/') ? route : `/${route}`}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          const dest = path.join(outDir, `axe-${slug(route)}.json`);
          await writeFile(dest, JSON.stringify(results, null, 2));
          // A scan of whatever the route redirected to is not a scan of the route.
          // Writing the JSON is still useful; counting it as coverage is not.
          const offRoute = landedOffRoute(route, results.url ?? page.url());
          // `incomplete` is what axe could not decide — most often contrast over a
          // translucent or overlapping background (frosted glass defeats it). It is
          // NOT a pass, and folding it into one hides exactly the cases a human has
          // to judge from the pixels.
          summary.axe[route] = {
            width: axeWidth,
            violations: results.violations.length,
            critical: results.violations.filter((v) => v.impact === 'critical').length,
            serious: results.violations.filter((v) => v.impact === 'serious').length,
            incomplete: results.incomplete.length,
            incompleteRules: [...new Set(results.incomplete.map((r) => r.id))],
            scannedUrl: results.url ?? url,
            landedOffRoute: offRoute,
            file: dest,
          };
          if (offRoute) {
            redirectedAxe++;
            console.error(
              `! axe ${routePath(route)} REDIRECTED → ${offRoute} — this JSON describes `
                + `${offRoute}, not ${routePath(route)}. Not counted as coverage.`,
            );
          } else {
            axeScans++;
            console.log(
              `✓ ${dest} — ${results.violations.length} violation types, `
                + `${results.incomplete.length} incomplete (needs manual check)`,
            );
          }
        } catch (err) {
          failures++;
          console.error(`✗ axe ${url} — ${err.message}`);
        }
      }
    }

    await context.close();
  }
}

await browser.close();

console.log(`\n${summary.shots.length}/${intendedShots} intended captures → ${outDir}`);

if (Object.keys(summary.axe).length) {
  // Only on-route scans are counted here. A scan of a redirect target says
  // nothing about the route that was asked for, and averaging it in would let a
  // login page report the app as clean.
  const rows = Object.values(summary.axe).filter((r) => !r.landedOffRoute);
  const totalViolations = rows.reduce((n, r) => n + r.violations, 0);
  const totalIncomplete = rows.reduce((n, r) => n + r.incomplete, 0);
  console.log(
    `axe: ${totalViolations} violation types across ${rows.length} on-route scan(s) at ${axeWidth}px`
      + (redirectedAxe ? ` (${redirectedAxe} redirected scan(s) excluded)` : ''),
  );
  if (totalIncomplete) {
    const ruleIds = [...new Set(rows.flatMap((r) => r.incompleteRules))].join(', ');
    console.log(`axe: ${totalIncomplete} INCOMPLETE checks — not passes, judge these by eye.`);
    console.log(`     unresolved rules: ${ruleIds}`);
  }
}

if (failures) console.log(`${failures} capture/scan(s) failed — see above.`);

const blind = [];
if (summary.shots.length === 0) blind.push('no capture succeeded');
if (summary.shots.length > 0 && redirectedShots === summary.shots.length) {
  blind.push('every capture was redirected off its requested route (auth gate? sign in first)');
} else if (redirectedShots) {
  console.log(
    `! ${redirectedShots} capture(s) landed off-route — see the REDIRECTED tags above. `
      + 'Those files are not evidence about the routes you asked for.',
  );
}
if (axeRequested && axeScans === 0) {
  blind.push(
    !AxeBuilder
      ? '--axe was requested but @axe-core/playwright is not installed'
      : redirectedAxe
        ? `--axe scanned only redirect targets (${redirectedAxe} route(s) bounced) — no route was actually scanned`
        : '--axe was requested but no scan completed',
  );
}
if (variantsNotApplied.size) {
  blind.push(`variant(s) never applied: ${[...variantsNotApplied].join(', ')}`);
}

let exitCode = 0;
if (blind.length) exitCode = 2;
else if (failures) exitCode = 1;

summary.coverage = {
  intendedShots,
  capturedShots: summary.shots.length,
  redirectedShots,
  intendedAxeScans,
  completedAxeScans: axeScans,
  redirectedAxeScans: redirectedAxe,
  failures,
  blind,
  exitCode,
};
await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

if (exitCode === 2) {
  console.log('\n!! INCOMPLETE COVERAGE — this run cannot testify about the app.');
  for (const reason of blind) console.log(`   · ${reason}`);
  console.log('   Exiting 2. Do not report these results as a pass.');
} else if (exitCode === 1) {
  console.log('\n!! FAILURES — see the ✗ lines above. Exiting 1.');
}

console.log('\nReminder: automated checks find roughly a third of real accessibility');
console.log('barriers. Do the keyboard pass, focus-order check, and 200% zoom manually.');

process.exit(exitCode);
