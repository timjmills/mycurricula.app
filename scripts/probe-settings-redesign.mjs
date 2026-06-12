// scripts/probe-settings-redesign.mjs — verification probe for the
// settings-hub redesign (header/X/Escape, grouped sidebar, overview,
// search, new sections).
//
// Responsive sweep: every settings route at 360 / 768 / 1280, reporting
// document-level horizontal scroll + screenshotting to
// docs/screenshots/settings-redesign/.
//
// Functional flows:
//   1. /daily → click settings gear path (direct nav) → X returns to /daily
//   2. Escape on a settings page exits to the recorded planner route
//   3. Overview tiles render with live summaries
//   4. Search "holiday" → Enter lands on /settings/calendar + #holidays
//      scrolled into view
//
// Usage: CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3010 \
//          node scripts/probe-settings-redesign.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT_DIR = path.resolve("docs/screenshots/settings-redesign");

const ROUTES = [
  "/settings",
  "/settings/curriculum",
  "/settings/calendar",
  "/settings/schedule",
  "/settings/subjects",
  "/settings/lesson-templates",
  "/settings/workspace",
  "/settings/account",
  "/settings/appearance",
  "/settings/catch-up",
];

const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();

// Bootstrap auth via the claude-login bypass.
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

// ── 1. Responsive sweep ────────────────────────────────────────────────
for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    const finalPath = new URL(page.url()).pathname;
    const hScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    note(
      !hScroll,
      `${route} @${tier.name} — no document h-scroll (landed ${finalPath})`,
    );
    const slug = route.replace(/\//g, "_") || "_root";
    await page.screenshot({
      path: path.join(OUT_DIR, `${slug}__${tier.name}.png`),
      fullPage: true,
    });
  }
  await page.close();
}

// ── 2. Functional flows (desktop tier) ─────────────────────────────────
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// Flow A: visit /daily (records return route), go to settings, click X.
await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 120000 });
// Wait until the route recorder has actually run — dev-mode compile of
// /daily can take a while on first hit, and hydration lags behind
// domcontentloaded.
await page.waitForFunction(
  () =>
    window.sessionStorage.getItem(
      "mycurricula:session:last-planner-route",
    ) === "/daily",
  null,
  { timeout: 90000 },
);
await page.goto(`${BASE}/settings/appearance`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000); // hydration before interacting
const closeBtn = page.getByRole("button", { name: "Close settings" });
note((await closeBtn.count()) === 1, "X button present in settings header");
await closeBtn.click();
await page.waitForURL("**/daily", { timeout: 15000 }).catch(() => {});
note(
  new URL(page.url()).pathname === "/daily",
  `X returns to /daily (landed ${new URL(page.url()).pathname})`,
);

// Flow B: Escape exits settings back to the recorded route.
await page.goto(`${BASE}/settings/calendar`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000); // hydration before keyboard input
await page.keyboard.press("Escape");
await page.waitForURL("**/daily", { timeout: 15000 }).catch(() => {});
note(
  new URL(page.url()).pathname === "/daily",
  `Escape returns to /daily (landed ${new URL(page.url()).pathname})`,
);

// Flow C: overview tiles render with live summaries.
await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000); // hydration before interacting
const tileCount = await page.locator('a[href^="/settings/"]').count();
note(tileCount >= 9, `overview renders ≥9 tiles (found ${tileCount})`);
const calSummary = await page
  .locator('a[href="/settings/calendar"]')
  .last()
  .innerText();
note(
  /week/i.test(calSummary),
  `calendar tile carries live summary ("${calSummary.replace(/\n/g, " · ")}")`,
);

// Flow D: search "holiday" jumps to /settings/calendar#holidays.
const searchInput = page.getByPlaceholder("Search settings…");
note((await searchInput.count()) === 1, "search input present in header");
await searchInput.fill("holiday");
await page.waitForTimeout(700);
const option = page.getByRole("option").first();
note((await option.count()) === 1, "search shows results for 'holiday'");
await searchInput.press("Enter");
await page.waitForURL("**/settings/calendar", { timeout: 15000 }).catch(
  () => {},
);
await page.waitForTimeout(1200);
const anchorVisible = await page.evaluate(() => {
  const el = document.getElementById("holidays");
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.top < window.innerHeight;
});
note(anchorVisible, "search Enter lands on calendar with #holidays in view");

// Flow E: old /settings/team redirects to /settings/workspace.
await page.goto(`${BASE}/settings/team`, { waitUntil: "domcontentloaded" });
note(
  new URL(page.url()).pathname === "/settings/workspace",
  `/settings/team redirects to /settings/workspace (landed ${new URL(page.url()).pathname})`,
);

// ── Flow F: computed-style assertions (visual pass) ────────────────────
// The cp-root button reset (tokens.css `.cp-root button`) silently strips
// background/border/padding from single-class module rules — a class of
// bug the h-scroll sweep can't catch. Assert the real computed styles.
// CSS-module classes are hashed `{file}_{class}__{hash}`, so match on the
// `_class__` infix.

// F1: selected month chip is solid (non-transparent bg) with real padding.
await page.goto(`${BASE}/settings/calendar`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500); // hydration — chips reflect stored months
const chipStyle = await page.evaluate(() => {
  const chip = document.querySelector('button[class*="_monthChipOn__"]');
  if (!chip) return null;
  const cs = window.getComputedStyle(chip);
  return {
    bg: cs.backgroundColor,
    padLeft: parseFloat(cs.paddingLeft),
    borderW: parseFloat(cs.borderLeftWidth),
  };
});
note(chipStyle !== null, "calendar renders a selected month chip");
if (chipStyle) {
  note(
    chipStyle.bg !== "rgba(0, 0, 0, 0)" && chipStyle.bg !== "transparent",
    `selected chip has a solid background (${chipStyle.bg})`,
  );
  note(
    chipStyle.padLeft >= 12,
    `selected chip keeps its padding (padding-left ${chipStyle.padLeft}px ≥ 12)`,
  );
  note(
    chipStyle.borderW >= 1,
    `selected chip keeps its border (${chipStyle.borderW}px)`,
  );
}

// F2: account default-view radio card has a visible border.
await page.goto(`${BASE}/settings/account`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const optionStyle = await page.evaluate(() => {
  const opt = document.querySelector('button[class*="_option__"]');
  if (!opt) return null;
  const cs = window.getComputedStyle(opt);
  return { borderW: parseFloat(cs.borderLeftWidth), pad: parseFloat(cs.paddingLeft) };
});
note(optionStyle !== null, "account renders a radio-card option");
if (optionStyle) {
  note(
    optionStyle.borderW >= 1 && optionStyle.pad >= 8,
    `account option keeps border+padding (border ${optionStyle.borderW}px, padding ${optionStyle.pad}px)`,
  );
}

// F3: overview tiles carry section glyphs (SVG icons). The glyph lives on
// the overview tiles + card eyebrows, not the narrow sidebar tabs (where
// it crowded the label into mid-word wraps).
await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const glyphCount = await page
  .locator('a[href="/settings/calendar"] span[class*="_glyph__"] svg')
  .count();
note(glyphCount >= 1, `overview tile carries a section glyph (found ${glyphCount})`);

// F4: team-scoped overview tile wears the 4px scope stripe, distinct from
// the card's regular border color (core-mode vs --border).
const stripe = await page.evaluate(() => {
  const tile = document.querySelector(
    'a[href="/settings/calendar"][class*="_card"]',
  );
  if (!tile) return null;
  const cs = window.getComputedStyle(tile);
  return {
    width: parseFloat(cs.borderLeftWidth),
    left: cs.borderLeftColor,
    top: cs.borderTopColor,
  };
});
note(stripe !== null, "overview calendar tile found for stripe check");
if (stripe) {
  note(
    stripe.width >= 4 && stripe.left !== stripe.top,
    `team tile wears scope stripe (border-left ${stripe.width}px, ${stripe.left} ≠ ${stripe.top})`,
  );
}

await page.close();
await browser.close();

console.log(
  failures === 0
    ? "\nALL CHECKS PASSED"
    : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
