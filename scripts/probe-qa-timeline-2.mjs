// probe-qa-timeline-2.mjs — follow-ups to probe-qa-timeline.mjs for the
// 2026-07-31 Plan-timeline QA audit. REPORT ONLY.
//
// Answers five things the first pass raised but could not settle:
//   1. WHY are the desktop scroll arrows 5.1px wide — which rule wins?
//   2. WHY is `data-mounted` absent on a surface that is demonstrably
//      interactive? (paired control: a click that changes state)
//   3. The band GRIP's real coarse-pointer box (needs Team mode, which the
//      static tiers never entered).
//   4. Does ANY dot text appear in the LESSONS lens at max zoom? (the first
//      pass measured the Units lens only)
//   5. The desktop slider's resting mismatch: thumb at 24 while columns are
//      34 — what does one nudge actually do?
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
mkdirSync(OUT, { recursive: true });
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);

const browser = await chromium.launch({ channel: "chrome" });

async function open(ctx) {
  await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  await page.waitForTimeout(3000);
  return page;
}

/* ── DESKTOP ─────────────────────────────────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await open(ctx);

  // 1. which rule wins on .scrollBtn
  const arrow = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Scroll back two weeks"]');
    if (!b) return { found: false };
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      found: true,
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      padding: cs.padding,
      border: cs.borderTopWidth,
      background: cs.backgroundColor,
      fontSize: cs.fontSize,
      classList: b.className,
      insideCpRoot: !!b.closest(".cp-root"),
      text: (b.textContent || "").trim(),
    };
  });
  log("SCROLL-ARROW desktop computed", arrow);
  const ab = await page.locator('button[aria-label="Scroll back two weeks"]').boundingBox();
  if (ab)
    await page.screenshot({
      path: `${OUT}/desktop-06-scroll-arrows-crop.png`,
      clip: { x: Math.max(0, ab.x - 120), y: Math.max(0, ab.y - 24), width: 260, height: 76 },
    });

  // 2. data-mounted — paired with a positive control that the tree is LIVE
  const mount = await page.evaluate(() => {
    const card = document.querySelector("[class*='timeline_card__']");
    return {
      cardFound: !!card,
      cardAttrs: card ? [...card.attributes].map((a) => `${a.name}="${a.value}"`) : null,
      anyDataMountedInDoc: document.querySelectorAll("[data-mounted]").length,
      todayLine: document.querySelectorAll("[class*='todayLine'],[data-today]").length,
      nowSubtitle: /Now:/.test(document.body.innerText),
    };
  });
  log("MOUNT-SEAM before interaction", mount);
  // POSITIVE CONTROL that React is hydrated & effects run: flip the lens and
  // observe the attribute change. If this works, effects DO run.
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click();
  await page.waitForTimeout(700);
  const live = await page.evaluate(() => {
    const card = document.querySelector("[class*='timeline_card__']");
    return {
      dataLens: card && card.getAttribute("data-lens"),
      anyDataMountedInDoc: document.querySelectorAll("[data-mounted]").length,
    };
  });
  log("MOUNT-SEAM control: lens flip proves React is live", live);
  await page.getByRole("radio", { name: "Units", exact: true }).first().click();
  await page.waitForTimeout(500);

  // 4. lessons lens @ max zoom — any dot text?
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.locator("#tl-zoom").evaluate((el) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, "130");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const lensText = await page.evaluate(() => {
    const dots = [...document.querySelectorAll("[class*='timeline_dot__']")];
    const bands = [...document.querySelectorAll("[class*='timeline_bandName__']")];
    return {
      dayPx: +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(1),
      dotCount: dots.length,
      dotsWithText: dots.filter((d) => (d.textContent || "").trim()).length,
      _controlBandsWithText: bands.filter((b) => (b.textContent || "").trim()).length,
    };
  });
  log("LESSONS lens @130px — dot text", lensText);
  await page.screenshot({ path: `${OUT}/desktop-07-lessons-zoom130.png` });
  await page.getByRole("radio", { name: "Units", exact: true }).first().click();
  await page.waitForTimeout(400);

  // 5. resting slider mismatch → what one nudge does
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  await page.waitForTimeout(3000);
  const dayW = () =>
    page.evaluate(() => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(1));
  const rest = { sliderValue: await page.locator("#tl-zoom").inputValue(), dayPx: await dayW() };
  await page.screenshot({ path: `${OUT}/desktop-08-slider-at-rest.png` });
  // one step RIGHT from the thumb's resting position (24 → 26), i.e. the user
  // asks for WIDER columns
  await page.locator("#tl-zoom").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  const after = { sliderValue: await page.locator("#tl-zoom").inputValue(), dayPx: await dayW() };
  log("SLIDER rest → one ArrowRight (user asks for WIDER)", {
    rest,
    after,
    columnsGotNarrower: after.dayPx < rest.dayPx,
  });
  await page.screenshot({ path: `${OUT}/desktop-09-slider-after-one-right.png` });

  await ctx.close();
}

/* ── TABLET, coarse pointer, TEAM mode — the grip's real box ─────────── */
{
  const ctx = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await open(ctx);
  const emu = await page.evaluate(() => ({
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    pointerFine: matchMedia("(pointer: fine)").matches,
    hover: matchMedia("(hover: hover)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  log("TABLET emulation actually reported", emu);

  const team = page.getByRole("button", { name: "Team Curriculum", exact: true });
  if (await team.count()) {
    await team.first().click();
    await page.waitForTimeout(1000);
    for (const nm of [/Got it/i, /Continue/i, /Close/i, /Start editing/i]) {
      const b = page.getByRole("button", { name: nm });
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(600);
        break;
      }
    }
  }
  await page.waitForTimeout(800);
  const grip = await page.evaluate(() => {
    const gs = [...document.querySelectorAll('button[aria-label^="Change how many weeks"]')];
    const bands = document.querySelectorAll("[data-draggable]").length; // ← control
    if (!gs.length) return { gripCount: 0, draggableBands: bands };
    const g = gs[0];
    const r = g.getBoundingClientRect();
    const cs = getComputedStyle(g);
    return {
      gripCount: gs.length,
      draggableBands: bands,
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      cssWidth: cs.width,
      touchAction: cs.touchAction,
      beforeOpacity: getComputedStyle(g, "::before").opacity,
      label: g.getAttribute("aria-label"),
    };
  });
  log("TABLET(coarse) TEAM-mode band grip box", grip);
  await page.screenshot({ path: `${OUT}/tablet-10-team-grip.png` });

  // horizontal scroll re-check in Team mode (the caution glow adds chrome)
  const hs = await page.evaluate(() => {
    const de = document.documentElement;
    window.scrollTo(400, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return { docScrollW: de.scrollWidth, docClientW: de.clientWidth, movedX: x, lanes: document.querySelectorAll("[data-lane-subject]").length };
  });
  log("TABLET Team-mode horizontal scroll", hs);
  await ctx.close();
}

await browser.close();
console.log("done");
