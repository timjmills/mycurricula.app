// scripts/probe-settings-night.mjs — Night-theme screenshot pass for the
// settings visual pass (chips, scope stripes, glyphs, eyebrow tones).
//
// Sets `mycurricula:user:theme = "night"` before load (the no-FOUC boot
// script in lib/theme-init reads it pre-hydration), then screenshots
// overview + calendar + subjects at the three responsive tiers to
// docs/screenshots/settings-redesign/night/. Also re-asserts the chip
// computed styles under Night so the solid-fill recipe holds there.
//
// Usage: CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3017 \
//          node scripts/probe-settings-night.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT_DIR = path.resolve("docs/screenshots/settings-redesign/night");

const ROUTES = ["/settings", "/settings/calendar", "/settings/subjects"];
const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();

// Force Night BEFORE any page script runs, on every navigation. Setting
// localStorage after login races the theme provider, which writes the
// default theme on mount and can clobber a post-hoc setItem — addInitScript
// runs ahead of the app's own boot script every time, so data-theme paints
// night deterministically.
await context.addInitScript(() => {
  window.localStorage.setItem("mycurricula:user:theme", "night");
});

// Bootstrap auth (the init script already seeds the Night preference).
const boot = await context.newPage();
// encodeURIComponent — the bypass token is base64 and can contain `+`,
// which a query parser would otherwise decode as a space and fail auth.
await boot.goto(`${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await boot.waitForTimeout(1500);
await boot.close();

let failures = 0;
const note = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    note(theme === "night", `${route} @${tier.name} renders data-theme=night`);
    const slug = route.replace(/\//g, "_") || "_root";
    await page.screenshot({
      path: path.join(OUT_DIR, `${slug}__${tier.name}.png`),
      fullPage: true,
    });
  }
  await page.close();
}

// Chip recipe under Night — still a solid, non-transparent fill.
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/settings/calendar`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const chip = await page.evaluate(() => {
  const el = document.querySelector('button[class*="_monthChipOn__"]');
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  return { bg: cs.backgroundColor, color: cs.color };
});
note(chip !== null, "night: selected month chip present");
if (chip) {
  note(
    chip.bg !== "rgba(0, 0, 0, 0)" && chip.bg !== "transparent",
    `night: selected chip solid fill (${chip.bg} / text ${chip.color})`,
  );
}
await page.close();

await browser.close();
console.log(failures === 0 ? "\nALL NIGHT CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
