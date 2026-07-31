// probe-qa-timeline-6.mjs — settles ONE open question cheaply. REPORT ONLY.
//
// Q: on desktop the zoom slider rests at 24 (its FALLBACK_FLOOR) while the
//    canvas draws 34px columns. Is that a pre-hydration transient, or does it
//    survive?
//
// The earlier attempts gated on a CLICK landing, which under this machine's
// current load (five agents sharing one dev server) takes minutes and starved
// out. But no click is needed: `data-mounted` is set by PlanTimeline's mount
// effect, and TimelineZoom's `--tl-col-base` read is a sibling effect that runs
// in the same commit phase. So `[data-mounted]` present IS the proof that
// post-mount effects have run — and it is a pure wait, no interaction.
//
// If `data-mounted` is present AND the slider still reads its floor while the
// columns are wider, the mismatch is real and not a transient.
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);
const browser = await chromium.launch({ channel: "chrome" });

for (const tier of [
  { name: "desktop", w: 1440, h: 900, mobile: false, dsf: 1 },
  { name: "tablet", w: 768, h: 1024, mobile: true, dsf: 2 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: tier.w, height: tier.h },
    isMobile: tier.mobile,
    hasTouch: tier.mobile,
    deviceScaleFactor: tier.dsf,
  });
  await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("[data-lane-subject]", { timeout: 180000 });

  // THE GATE — a pure wait on the mount seam, no clicking.
  const seen = await page
    .waitForSelector("[data-mounted]", { timeout: 180000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(2500);

  const read = await page.evaluate(() => {
    const s = document.querySelector("#tl-zoom");
    const day = document.querySelector("[data-tl-day]");
    const card = document.querySelector("[class*='timeline_card__']");
    return {
      mountSeamPresent: !!document.querySelector("[data-mounted]"), // ← the gate
      sliderValue: s ? Number(s.value) : null,
      sliderMin: s ? Number(s.min) : null,
      sliderMax: s ? Number(s.max) : null,
      ariaValueText: s ? s.getAttribute("aria-valuetext") : null,
      dayColumnPx: day ? +day.getBoundingClientRect().width.toFixed(1) : null,
      colBase: card ? getComputedStyle(card).getPropertyValue("--tl-col-base").trim() : null,
      colFloor: card ? getComputedStyle(card).getPropertyValue("--tl-col-floor").trim() : null,
      _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
    };
  });
  log(`${tier.name}: slider vs canvas AFTER the mount seam`, {
    gateSeen: seen,
    ...read,
    thumbAgreesWithCanvas: read.sliderValue === read.dayColumnPx,
    thumbParkedAtFloor: read.sliderValue === read.sliderMin,
  });
  await page.screenshot({ path: `${OUT}/${tier.name}-20-slider-vs-canvas.png` });
  await ctx.close();
}
await browser.close();
console.log("done");
