// probe-wave6-visual.mjs — the two Wave-6 questions a unit test cannot answer.
//
// A. The Day rail/agenda add menu after the `.menuStart` specificity fix.
//    `align="start"` was DEAD before this wave (the rule sat above
//    `.vaDayAddMenu` at equal specificity and lost), so DayB and DayC have
//    been rendering a CENTRED menu while asking for a left-aligned one. The
//    fix makes their own request take effect — a real change to two shipped
//    surfaces — so this checks the menu now hangs off the trigger's left edge
//    AND still fits on screen.
//
// B. The /post section lesson-tag chips: present, ellipsised rather than
//    overflowing their header, and — the one that matters — meeting WCAG AA
//    against their own tint. The chip's colour is `color-mix(oklab, subject
//    48%, --ink-900)`; the handoff's 62% failed AA on four of the eight locked
//    subjects, which is why the shipped value diverges from it.
//
// Contrast is computed from RESOLVED canvas colours, never scraped strings:
// `color-mix()` and `color(srgb …)` both defeat naive parsing, and a scraper
// that conflates 0–1 with 0–255 INFLATES the ratio (repo memory).
//
// Run: node scripts/probe-wave6-visual.mjs   (dev server on 3010)

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// `bg` is the axis that decides the DERIVED tone: photo + dim:normal samples the
// photo and lands on DARK, wash lands on LIGHT (CLAUDE.md §4). It matters for the
// chips because the whole ink scale inverts with the tone.
const axes = (frame, bg = "photo") =>
  `v1.${frame}.dark.${bg}.clear.normal.vivid.highlight`;

// Colour resolution runs INSIDE the page (see `page.addInitScript` below) so
// the measurement never parses a CSS string. `color-mix()` and `color(srgb …)`
// both defeat naive parsing, and the srgb form's 0–1 channels read as
// near-black when scraped as 0–255 — which INFLATES a contrast ratio instead of
// failing loudly. Painting the declared value onto a 1×1 canvas and reading the
// pixel back is the only form that cannot lie about what shipped.
const RESOLVER = () => {
  Object.assign(window, {
    __resolveColor(css) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const x = c.getContext("2d");
      x.fillStyle = "#000";
      x.fillRect(0, 0, 1, 1);
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
  });
};

async function context(browser, frame, viewport, bg = "photo") {
  const ctx = await browser.newContext({ viewport });
  // This repo runs several build lanes against ONE dev server, and a cold
  // route compile under that load routinely exceeds Playwright's 30s default.
  // Those timeouts are the server, not the surface — but they arrive mixed in
  // with real findings, so give navigation room rather than reading contention
  // as a defect.
  ctx.setDefaultNavigationTimeout(150000);
  await ctx.addInitScript(RESOLVER);
  // BOTH halves are required. The mc-theme-axes cookie only drives the SSR
  // attributes; after hydration the client theme store re-derives from
  // localStorage, so seeding the cookie alone let `bg=wash` silently revert to
  // the stored `photo` and a "light tone" case measured tone=dark — a duplicate
  // of the dark run, reported as two-tone coverage until the tone gate caught it.
  await ctx.addInitScript(
    ({ f, b }) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", f);
      localStorage.setItem("mycurricula:user:theme-bg", b);
      localStorage.setItem("mycurricula:user:theme", "clear");
      localStorage.setItem("mycurricula:user:theme-glass", "dark");
      localStorage.setItem("mycurricula:user:theme-dim", "normal");
    },
    { f: frame, b: bg },
  );
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame, bg), url: BASE }]);
  await bypassLogin(ctx, { base: BASE, next: "/weekly" });
  return ctx;
}

/** Poll until clicking the add trigger actually toggles aria-expanded.
 *  A click that lands before React attaches the handler does nothing, and the
 *  resulting "menu never opened" is the same message a MISSING control gives —
 *  so readiness is proved, never assumed. */
const HYDRATE_GATE = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = () =>
    [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
      /^\+?\s*Add lesson$/.test(b.textContent.trim()),
    );
  for (let k = 0; k < 60; k++) {
    const t = el();
    if (!t) { await sleep(250); continue; }
    t.click();
    await sleep(250);
    if (el().getAttribute("aria-expanded") === "true") return true;
    await sleep(150);
  }
  return false;
};

async function partA(browser, frame, label) {
  const ctx = await context(browser, frame, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/daily?lesson=m-11-1`, { waitUntil: "domcontentloaded" });
  // Wait for the ADD TRIGGER, not for lessons: the rail's add row renders on an
  // empty day too, and this part of the probe is about the menu's geometry, not
  // about the day's contents. Waiting on lessons made the probe fail on a day
  // that legitimately had none.
  // The rail/agenda add trigger by its LABEL. `[aria-expanded][aria-busy]`
  // matched a chrome control first and the gate then reported the add trigger
  // as dead — the instrument naming the wrong element, not a broken control.
  await page
    .locator("button[aria-expanded]", { hasText: /^\+?\s*Add lesson$/ })
    .first()
    .waitFor({ state: "attached", timeout: 90000 });
  const hydrated = await page.evaluate(HYDRATE_GATE);
  ok(`${label} — add trigger is interactive`, hydrated);

  const m = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trig = [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
      /^\+?\s*Add lesson$/.test(b.textContent.trim()),
    );
    if (!trig) return null;
    if (trig.getAttribute("aria-expanded") !== "true") { trig.click(); await sleep(400); }
    const nl = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("New lesson"),
    );
    if (!nl) return null;
    const menu = nl.parentElement.getBoundingClientRect();
    const t = trig.getBoundingClientRect();
    return {
      menuLeft: Math.round(menu.left), menuRight: Math.round(menu.right),
      trigLeft: Math.round(t.left), trigRight: Math.round(t.right),
      vw: window.innerWidth,
    };
  });
  if (!m) {
    ok(`${label} — add menu opens`, false, "menu never opened");
  } else {
    ok(`${label} — add menu opens`, true);
    // start-aligned: the menu's left edge sits on the trigger's left edge.
    ok(
      `${label} — menu is LEFT-aligned to its trigger (align="start" now applies)`,
      Math.abs(m.menuLeft - m.trigLeft) <= 2,
      `menu.left=${m.menuLeft} trigger.left=${m.trigLeft}`,
    );
    ok(
      `${label} — menu stays on screen`,
      m.menuLeft >= 0 && m.menuRight <= m.vw,
      `${m.menuLeft}..${m.menuRight} in 0..${m.vw}`,
    );
  }
  await ctx.close();
}

/** Everything the chip measurement needs, read in ONE page evaluation so the
 *  colours and the geometry describe the same paint. */
const MEASURE_CHIP = () => {
  const resolve = window.__resolveColor;
  const strip = document.querySelector("[data-sectags]");
  if (!strip) return null;
  const chip = strip.querySelector('[role="listitem"]');
  if (!chip) return null;
  const cs = getComputedStyle(chip);
  const head = strip.parentElement;
  const fg = resolve(cs.color);
  const bgChip = resolve(cs.backgroundColor);
  let el = head, behind = null;
  while (el && !behind) {
    const b = getComputedStyle(el).backgroundColor;
    const p = resolve(b);
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) behind = p;
    el = el.parentElement;
  }
  return {
    chips: strip.querySelectorAll('[role="listitem"]').length,
    fg, bgChip, behind: behind ?? [255, 255, 255],
    alpha: parseFloat((cs.backgroundColor.match(/[\d.]+\)$/) || ["1)"])[0]) || 1,
    // The truncation lives on the LABEL span, not on the chip — the chip is
    // the flex pill and must keep its icon at full size. Reading it off the
    // chip reported "no ellipsis" for a chip that ellipsises correctly.
    ellipsis: getComputedStyle(chip.querySelector("span:last-child")).textOverflow,
    chipOverflowsHeader:
      chip.getBoundingClientRect().right > head.getBoundingClientRect().right + 1,
    headerScrolls: head.scrollWidth > head.clientWidth + 1,
    docScrollX:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tone: document.querySelector("[data-tone]")?.getAttribute("data-tone"),
    // Did the section adopt the known-dark treatment? `.inverse` is applied by
    // Section only when needsInverseInk(bg) is true.
    inverse: /inverse/.test(document.querySelector("section")?.className ?? ""),
  };
};

const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([a, b, c]) => 0.2126 * lin(a) + 0.7152 * lin(b) + 0.0722 * lin(c);
const contrast = (A, B) => {
  const x = lum(A), y = lum(B);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** The canvas composites onto black, so re-composite the chip's translucent
 *  fill over the surface actually behind it using the declared alpha. */
const chipRatio = (r) =>
  contrast(r.fg, r.bgChip.map((v, i) => v + r.behind[i] * (1 - r.alpha)));

async function partB(browser, frame, viewport, label, bg = "photo") {
  const ctx = await context(browser, frame, viewport, bg);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/post?lesson=m-11-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-sectags]", { timeout: 40000 });

  const r = await page.evaluate(MEASURE_CHIP);
  const cr = chipRatio(r);

  ok(`${label} — section tag chips render`, r.chips > 0, `${r.chips} chip(s), tone=${r.tone}`);
  ok(`${label} — chip label ellipsises rather than overflowing`, r.ellipsis === "ellipsis");
  ok(`${label} — chips do not push the header out of its box`, !r.chipOverflowsHeader && !r.headerScrolls);
  ok(`${label} — no document-level horizontal scroll`, r.docScrollX <= 0, `${r.docScrollX}px`);
  ok(`${label} — chip text meets WCAG AA (4.5:1)`, cr >= 4.5, `${cr.toFixed(2)}:1`);

  await ctx.close();
}

/**
 * PART C — the `.inverse` path, which was previously reasoned and NOT observed.
 *
 * `Section` adds `.inverse` only when `needsInverseInk(bg)` is true — a
 * background this app KNOWS is dark, i.e. the "ink" colour swatch or an ink
 * translucent at >=55% (`backgrounds.ts:308-315`). That is a light-tone app
 * showing a dark section, so the ink scale is pointing the wrong way for it and
 * the chips must flip on their own. Nothing else in this probe reaches it.
 *
 * Driven through the REAL control path — open the section's background popover
 * and click the ink swatch — rather than seeding the localStorage key. The key
 * is `cc_secbg_<wallKey>:<subjectId>:<sectionId>` and getting any part of it
 * wrong writes a record the app then ignores, leaving a probe that applies
 * nothing and cheerfully measures the DEFAULT state. Clicking cannot lie about
 * that: the assertion below fails outright if `.inverse` is not on the section.
 *
 * IT APPLIES TWICE ON PURPOSE, AND THAT IS A BUG IN THE APP, NOT A QUIRK HERE.
 * The FIRST pin on a preset wall is silently discarded. `onApplyBg` calls
 * `onEdit()`, which auto-forks the preset into a custom wall ("Current Lesson"
 * -> "My Current Lesson") in the same action; the background is saved under the
 * OLD wallKey while Section's bg effect immediately re-reads under the NEW one,
 * finds nothing, and sets bg back to null. Measured:
 *
 *   apply #1 (preset)  inverse=false hasBg=false  wrote cc_secbg_lesson:math:…
 *   apply #2 (forked)  inverse=true  hasBg=true   wrote cc_secbg_cw16aea111…:math:…
 *
 * So a teacher's first click on a colour does nothing visible and orphans a
 * localStorage record. Reported separately — it is in the wall-state/fork seam,
 * not in the chips. The second apply is what this part needs, and the first is
 * left in as the documented workaround rather than hidden behind a retry loop.
 */
async function partC(browser, bg, label) {
  const ctx = await context(browser, "paper", { width: 1440, height: 900 }, bg);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/post?lesson=m-11-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-sectags]", { timeout: 40000 });

  const before = await page.evaluate(MEASURE_CHIP);
  ok(`${label} .inverse — control: section starts WITHOUT the dark treatment`, !before.inverse);
  // The label claims a tone; the page has to agree, or this case is a silent
  // duplicate of the other one and its numbers describe coverage nobody has.
  const wantTone = label.includes("light") ? "light" : "dark";
  ok(
    `${label} .inverse — the axes really produced tone=${wantTone}`,
    before.tone === wantTone,
    `measured tone=${before.tone}`,
  );

  const applyInk = () =>
    page.evaluate(async () => {
      const sleep = (r) => new Promise((x) => setTimeout(x, r));
      const bgBtn = document.querySelector('button[aria-label="Section background"]');
      if (!bgBtn) return "no background button";
      for (let k = 0; k < 40; k++) {
        bgBtn.click();
        await sleep(250);
        if (bgBtn.getAttribute("aria-expanded") === "true") break;
        await sleep(150);
      }
      if (bgBtn.getAttribute("aria-expanded") !== "true") return "popover never opened";
      const ink = document.querySelector('button[aria-label="ink"]');
      if (!ink) return "no ink swatch";
      ink.click();
      await sleep(1200);
      return "ok";
    });

  const first = await applyInk();
  ok(`${label} .inverse — the ink swatch is reachable through the real popover`, first === "ok", first);
  if (first !== "ok") { await ctx.close(); return; }

  // Pin the app bug in passing, so a fix that makes the first apply stick shows
  // up here as a change rather than going unnoticed.
  const midway = await page.evaluate(MEASURE_CHIP);
  ok(
    ".inverse — KNOWN BUG: the first pin on a preset is discarded by the auto-fork",
    midway.inverse === false,
    "if this now FAILS the bug is fixed — drop the second apply below",
  );

  const second = await applyInk();
  ok(`${label} .inverse — second apply, now on the forked custom wall`, second === "ok", second);

  const after = await page.evaluate(MEASURE_CHIP);
  // The gate: if this is false the measurement below describes the default
  // state and every ratio under it is meaningless.
  ok(`${label} .inverse — section adopted the dark treatment`, after.inverse === true);
  ok(
    `${label} .inverse — chip re-inked (its colour actually changed)`,
    after.fg.join() !== before.fg.join(),
    `${before.fg.join(",")} -> ${after.fg.join(",")}`,
  );
  const cr = chipRatio(after);
  ok(`${label} .inverse — chip text still meets WCAG AA (4.5:1)`, cr >= 4.5, `${cr.toFixed(2)}:1`);

  await ctx.close();
}

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  await partA(browser, "paper", "DayB rail (paper)");
  await partA(browser, "color", "DayC agenda (color)");
  // The axes cookie above is photo + dim:normal, whose DERIVED tone is dark —
  // each case prints the tone it actually measured rather than claiming one.
  await partC(browser, "photo", "[dark tone]");
  await partC(browser, "wash", "[light tone]");
  // Both tones. The chip's colour is one recipe that relies on the ink scale
  // inverting (`color-mix(oklab, --sc 48%, --ink-900)`), so a dark-only pass
  // would leave the half the 48% figure was actually calculated for unmeasured.
  await partB(browser, "paper", { width: 1440, height: 900 }, "/post 1440 dark");
  await partB(browser, "paper", { width: 375, height: 812 }, "/post 375 dark");
  await partB(browser, "paper", { width: 1440, height: 900 }, "/post 1440 light", "wash");
  await partB(browser, "paper", { width: 375, height: 812 }, "/post 375 light", "wash");
  await browser.close();

  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(String(e).slice(0, 500));
  process.exit(1);
});
