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

const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.vivid.highlight`;

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

async function context(browser, frame, viewport) {
  const ctx = await browser.newContext({ viewport });
  // This repo runs several build lanes against ONE dev server, and a cold
  // route compile under that load routinely exceeds Playwright's 30s default.
  // Those timeouts are the server, not the surface — but they arrive mixed in
  // with real findings, so give navigation room rather than reading contention
  // as a defect.
  ctx.setDefaultNavigationTimeout(150000);
  await ctx.addInitScript(RESOLVER);
  await ctx.addInitScript((f) => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", f);
  }, frame);
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
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

async function partB(browser, frame, viewport, label) {
  const ctx = await context(browser, frame, viewport);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/post?lesson=m-11-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-sectags]", { timeout: 40000 });

  const r = await page.evaluate(() => {
    const resolve = window.__resolveColor;
    const strip = document.querySelector("[data-sectags]");
    const chip = strip.querySelector('[role="listitem"]');
    const cs = getComputedStyle(chip);
    const head = strip.parentElement;
    // Composite the chip's translucent fill over the surface behind it.
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
    };
  });

  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = ([a, b, c]) => 0.2126 * lin(a) + 0.7152 * lin(b) + 0.0722 * lin(c);
  const ratio = (A, B) => {
    const x = lum(A), y = lum(B);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  // The canvas already composited the chip fill over black; re-composite over
  // the real surface using the declared alpha so the maths sees what a teacher
  // sees rather than the fill in isolation.
  const bg = r.bgChip.map((v, i) => v + r.behind[i] * (1 - r.alpha));
  const cr = ratio(r.fg, bg);

  ok(`${label} — section tag chips render`, r.chips > 0, `${r.chips} chip(s), tone=${r.tone}`);
  ok(`${label} — chip label ellipsises rather than overflowing`, r.ellipsis === "ellipsis");
  ok(`${label} — chips do not push the header out of its box`, !r.chipOverflowsHeader && !r.headerScrolls);
  ok(`${label} — no document-level horizontal scroll`, r.docScrollX <= 0, `${r.docScrollX}px`);
  ok(`${label} — chip text meets WCAG AA (4.5:1)`, cr >= 4.5, `${cr.toFixed(2)}:1`);

  await ctx.close();
}

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  await partA(browser, "paper", "DayB rail (paper)");
  await partA(browser, "color", "DayC agenda (color)");
  // The axes cookie above is photo + dim:normal, whose DERIVED tone is dark —
  // each case prints the tone it actually measured rather than claiming one.
  await partB(browser, "paper", { width: 1440, height: 900 }, "/post 1440");
  await partB(browser, "paper", { width: 375, height: 812 }, "/post 375");
  await browser.close();

  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(String(e).slice(0, 500));
  process.exit(1);
});
