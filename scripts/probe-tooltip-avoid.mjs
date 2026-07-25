// scripts/probe-tooltip-avoid.mjs — §4b evidence for the `avoid` prop.
//
// Measures the one thing the fix claims: focusing the appearance gear no
// longer buries the console nav (Day · Week · Year · Plan · Post · Teach).
//
// Run it TWICE on the same tree and the same dev server to get a real
// before/after — never a computed one. To take the "before" reading, comment
// out the `avoid=".views.console"` prop on the gear's Tooltip in
// components/chrome/ViewTitle.tsx, run with --label=before, then restore it
// and run with --label=after. (`git stash push -- <path>` is the tidier form
// but fails outright in this shared checkout whenever a sibling lane has
// staged entries.)
//
// Removing only the PROP leaves the primitive's new code in place with no
// callsite opting in — so the "before" run doubles as proof that a callsite
// which did not opt in is unchanged in a real browser (`data-displaced` must
// come back absent).
//
// --tiers=375,1440 re-runs a subset; --label may be suffixed (`after-375`)
// and still takes the after-assertions.
//
// WRITE-SAFE: it focuses, and it clicks the gear once (the finding in §4a
// below). Neither persists anything, and every non-GET Supabase request is
// aborted. No theme option is ever clicked.
//
// HYDRATION: the dev server takes 5–17s, and keys pressed into un-hydrated
// markup measure nothing. The gate here is the bubble itself — focus the
// gear, look for the bubble, retry until it appears. That is the gate read in
// the same observation it guards, not a fixed sleep.

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "http://localhost:3099");
const LABEL = arg("label", "after");
const OUT = path.resolve(process.cwd(), "docs/screenshots/tooltip-avoid");
mkdirSync(OUT, { recursive: true });

const ONLY = arg("tiers", "");
const TIERS = [
  { name: "375", width: 375, height: 812, coarse: true },
  { name: "768", width: 768, height: 1024, coarse: true },
  { name: "1440", width: 1440, height: 900, coarse: false },
].filter((t) => !ONLY || ONLY.split(",").includes(t.name));

// Measure the bubble against the nav. Returns null while un-hydrated so the
// caller can retry — a missing bubble must never read as "no occlusion".
const MEASURE = () => {
  const bubble = document.querySelector('[role="tooltip"]');
  const nav = document.querySelector(".views.console");
  if (!bubble || !nav) return null;
  const br = bubble.getBoundingClientRect();
  const nr = nav.getBoundingClientRect();
  if (br.width === 0 || nr.width === 0) return null;
  // Before its first measurement the primitive parks the bubble at
  // (-9999, -9999) with opacity 0. That is NOT a placement — accepting it
  // would let a half-open bubble satisfy the gate this probe exists to read,
  // and it reports as "0% occlusion" while proving nothing.
  if (br.left < -1000 || br.top < -1000) return null;

  const overlap = (a, b) => {
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return w * h;
  };
  const r = (v) => Math.round(v * 10) / 10;

  // Rectangle intersection is not proof a control is unusable; elementFromPoint
  // landing on the bubble IS. Checked both ways.
  const items = [...nav.querySelectorAll("a, button, [role='tab']")];
  const blocked = [];
  for (const el of items) {
    const ir = el.getBoundingClientRect();
    if (ir.width === 0) continue;
    const top = document.elementFromPoint(
      ir.left + ir.width / 2,
      ir.top + ir.height / 2,
    );
    if (top && top !== el && !el.contains(top) && top.closest('[role="tooltip"]')) {
      blocked.push((el.textContent || "").trim().slice(0, 12));
    }
  }

  const gear = document.querySelector(".vt-cogbtn");
  const gr = gear ? gear.getBoundingClientRect() : null;
  const navArea = nr.width * nr.height;

  return {
    bubbleRect: { x: r(br.left), y: r(br.top), w: r(br.width), h: r(br.height) },
    navRect: { x: r(nr.left), y: r(nr.top), w: r(nr.width), h: r(nr.height) },
    gearRect: gr ? { x: r(gr.left), y: r(gr.top), w: r(gr.width), h: r(gr.height) } : null,
    overlapPx: Math.round(overlap(br, nr)),
    navAreaPx: Math.round(navArea),
    overlapPctOfNav: navArea > 0 ? Math.round((overlap(br, nr) / navArea) * 100) : null,
    blockedNavItems: blocked,
    navItemCount: items.length,
    // Does the bubble cover the control the teacher is focused on?
    overlapGearPx: gr ? Math.round(overlap(br, gr)) : null,
    dataSide: bubble.getAttribute("data-side"),
    dataDisplaced: bubble.getAttribute("data-displaced"),
    pointerEvents: getComputedStyle(bubble).pointerEvents,
    // CSS-modules hashes the class to `Tooltip_arrow__xxxx`; match on the
    // stem rather than on "last span", which a span inside the tip copy
    // would win.
    arrowShown: (() => {
      const a = bubble.querySelector('[class*="arrow"]');
      return a ? getComputedStyle(a).display !== "none" : null;
    })(),
    // On-screen check: a bubble pushed off the viewport is a different bug.
    onScreen:
      br.left >= 0 &&
      br.top >= 0 &&
      br.right <= window.innerWidth &&
      br.bottom <= window.innerHeight,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
};

const results = [];
const consoleErrors = [];
const browser = await chromium.launch({ channel: "chrome" });
const storageState = await authedStorageState(browser, {
  base: BASE,
  next: "/year",
  timeout: 90000,
  settleMs: 2500,
});

// ── Warm the dev compile BEFORE the tier loop. ────────────────────────────
// `next dev` compiles /year on first hit, and other lanes editing this shared
// tree trigger recompiles. Without this, whichever tier runs first eats the
// compile and reports "no bubble" — which reads exactly like "the fix did not
// work". The gate is the same one the tiers use: a painted bubble.
{
  const warm = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await warm.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  const gear = page.locator("button.vt-cogbtn").first();
  let warmed = false;
  for (let i = 0; i < 60 && !warmed; i += 1) {
    if (await gear.count()) {
      await gear.focus().catch(() => {});
      await page.waitForTimeout(500);
      warmed = !!(await page.evaluate(MEASURE));
      if (!warmed) await gear.evaluate((el) => el.blur()).catch(() => {});
    }
    if (!warmed) await page.waitForTimeout(1500);
  }
  console.log(warmed ? "warmup: dev compile ready" : "warmup: NOT ready — tiers may fail");
  await warm.close();
}

for (const tier of TIERS) {
  const ctx = await browser.newContext({
    storageState,
    ...(tier.coarse
      ? {
          ...devices["iPhone 14 Pro"],
          viewport: { width: tier.width, height: tier.height },
        }
      : { viewport: { width: tier.width, height: tier.height } }),
  });
  await ctx.route(/supabase\.co\//, (route) => {
    const m = route.request().method().toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    if (/\/auth\/v1\/token(\?|$)/.test(route.request().url())) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${tier.name}] ${m.text().slice(0, 200)}`);
  });
  // An exception thrown inside the placement rAF would leave the bubble
  // parked offscreen forever and never reach the console listener.
  page.on("pageerror", (e) => consoleErrors.push(`[${tier.name}] pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });

  // ── Hydration gate: retry focus until the bubble actually paints. ────────
  const gear = page.locator("button.vt-cogbtn").first();
  let m = null;
  let waitedMs = 0;
  let tries = 0;
  const DEADLINE = 90000;
  while (waitedMs < DEADLINE) {
    if (await gear.count()) {
      await gear.focus().catch(() => {});
      await page.waitForTimeout(600);
      m = await page.evaluate(MEASURE);
      if (m) break;
      await gear.evaluate((el) => el.blur()).catch(() => {});
    }
    await page.waitForTimeout(1000);
    waitedMs += 1600;
    tries += 1;
    // The onboarding gate intermittently claims the session before the
    // workspace resolves, parking the run on /onboarding where no gear
    // exists. Navigate back rather than burning the whole deadline on a
    // page that can never satisfy the gate.
    if (page.url().includes("/onboarding")) {
      await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    }
    // Other lanes are editing this shared tree, so a chunk can 500 mid-run
    // while `next dev` recompiles. A reload picks up the recompiled bundle;
    // without it a transient sibling break reads as "the fix did not work".
    if (tries % 8 === 0) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    }
  }
  if (!m) {
    // Say WHICH precondition failed. "No bubble" alone is indistinguishable
    // between a broken fix, a missing control, and a dev server that never
    // finished compiling — and guessing between those wastes a whole pass.
    const why = await page.evaluate(() => ({
      url: location.pathname,
      gear: !!document.querySelector("button.vt-cogbtn"),
      nav: !!document.querySelector(".views.console"),
      navSize: (() => {
        const n = document.querySelector(".views.console");
        const r = n && n.getBoundingClientRect();
        return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null;
      })(),
      tooltipEl: !!document.querySelector('[role="tooltip"]'),
      activeEl: document.activeElement ? document.activeElement.className || document.activeElement.tagName : null,
      bodyChars: document.body.innerText.length,
    })).catch((e) => ({ evalFailed: String(e).slice(0, 120) }));
    results.push({ tier: tier.name, error: `no bubble after ${waitedMs}ms`, why });
    console.log(`\n${tier.name}px FAILED:`, JSON.stringify(why));
    await page.screenshot({ path: path.join(OUT, `${LABEL}-FAILED-${tier.name}.png`) }).catch(() => {});
    await ctx.close();
    continue;
  }

  // Screenshot clipped to the nav row + the bubble, which is the evidence.
  const clipTop = Math.max(0, Math.min(m.navRect.y, m.bubbleRect.y) - 12);
  const clipBottom = Math.min(
    tier.height,
    Math.max(m.navRect.y + m.navRect.h, m.bubbleRect.y + m.bubbleRect.h) + 12,
  );
  await page.screenshot({
    path: path.join(OUT, `${LABEL}-navrow-${tier.name}.png`),
    clip: { x: 0, y: clipTop, width: tier.width, height: Math.max(40, clipBottom - clipTop) },
  });
  await page.screenshot({ path: path.join(OUT, `${LABEL}-full-${tier.name}.png`) });

  // ── §4a Medium finding: does a MOUSE-opened bubble block the menu? ───────
  // Codex's claim: clicking the gear leaves an interactive bubble
  // (pointer-events:auto) sitting over the Appearance dialog's controls.
  await page.mouse.move(
    m.gearRect.x + m.gearRect.w / 2,
    m.gearRect.y + m.gearRect.h / 2,
  );
  await page.waitForTimeout(600); // let the 400ms hover delay elapse
  let clickError = null;
  await gear.click({ force: true }).catch((e) => {
    clickError = String(e).slice(0, 160);
  });
  await page.waitForTimeout(700);
  const menuCheck = await page.evaluate(() => {
    const menu = document.querySelector(".vt-menu");
    const bubble = document.querySelector('[role="tooltip"]');
    const g = document.querySelector("button.vt-cogbtn");
    // `menuOpen:false` with no reason is a gate that passes without testing
    // anything — the exact failure this probe is supposed to catch. Report
    // the trigger's own state so a false pass is visible.
    if (!menu) {
      return {
        menuOpen: false,
        ariaExpanded: g ? g.getAttribute("aria-expanded") : null,
        bubbleStillOpen: !!bubble,
      };
    }
    const controls = [...menu.querySelectorAll("button, input, a, [role='radio']")];
    const blocked = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && top !== el && !el.contains(top) && top.closest('[role="tooltip"]')) {
        blocked.push((el.getAttribute("aria-label") || el.textContent || "?").trim().slice(0, 20));
      }
    }
    return {
      menuOpen: true,
      bubbleStillOpen: !!bubble,
      bubblePointerEvents: bubble ? getComputedStyle(bubble).pointerEvents : null,
      controlCount: controls.length,
      blockedMenuControls: blocked,
    };
  });
  await page.screenshot({ path: path.join(OUT, `${LABEL}-menu-${tier.name}.png`) });

  results.push({ tier: tier.name, ...m, menuCheck: { ...menuCheck, clickError } });
  console.log(`\n${tier.name}px:`, JSON.stringify({ ...m, menuCheck }, null, 2));
  await ctx.close();
}

// ── Assertions, not logs. A probe that only prints proves nothing. ─────────
const failures = [];
for (const r of results) {
  if (r.error) {
    failures.push(`${r.tier}: ${r.error}`);
    continue;
  }
  // Prefix, not equality: a label like `after-375-1440` for a re-run of two
  // tiers must still take the after-assertions. Exact matching silently sent
  // a passing after-run down the before-branch and printed FAIL.
  if (LABEL.startsWith("after")) {
    if (r.overlapPctOfNav !== 0) failures.push(`${r.tier}: nav still ${r.overlapPctOfNav}% covered`);
    if (r.blockedNavItems.length) failures.push(`${r.tier}: nav items hit-blocked: ${r.blockedNavItems}`);
    if (r.overlapGearPx !== 0) failures.push(`${r.tier}: bubble covers its own trigger (${r.overlapGearPx}px²)`);
    if (!r.onScreen) failures.push(`${r.tier}: bubble off-screen ${JSON.stringify(r.bubbleRect)}`);
    if (r.dataDisplaced !== "true") failures.push(`${r.tier}: expected data-displaced="true", got ${r.dataDisplaced}`);
    if (r.arrowShown !== false) failures.push(`${r.tier}: displaced bubble still shows its arrow`);
    // The §4a Medium finding is only ANSWERED if the menu actually opened.
    // A `menuOpen:false` that silently counts as "no controls blocked" is a
    // check that passes without testing anything.
    if (!r.menuCheck?.menuOpen) {
      failures.push(
        `${r.tier}: appearance menu never opened — §4a finding untested (aria-expanded=${r.menuCheck?.ariaExpanded}, clickError=${r.menuCheck?.clickError})`,
      );
    } else if (r.menuCheck.blockedMenuControls?.length) {
      failures.push(`${r.tier}: bubble blocks menu controls: ${r.menuCheck.blockedMenuControls}`);
    }
  } else {
    // The "before" run must REPRODUCE the defect; if it doesn't, the "after"
    // numbers are measuring something other than the reported bug.
    if (!(r.overlapPctOfNav > 0)) failures.push(`${r.tier}: before-run did not reproduce the occlusion`);
    if (r.dataDisplaced !== null) failures.push(`${r.tier}: opt-out callsite was displaced (${r.dataDisplaced})`);
  }
}

writeFileSync(
  path.join(OUT, `${LABEL}.json`),
  JSON.stringify({ base: BASE, label: LABEL, at: new Date().toISOString(), results, consoleErrors, failures }, null, 2),
);
console.log(`\nconsole errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${LABEL}`);
for (const f of failures) console.log(`  ✗ ${f}`);
await browser.close();
process.exitCode = failures.length ? 1 : 0;
