// probe-design-timeline-span.mjs — one question, cheaply: HOW MUCH OF THE YEAR
// FITS? The Plan page's own subtitle is "Your whole year, subject by subject",
// so whether the year fits at any zoom setting is a claim about the surface's
// core promise and must be measured, not eyeballed.
//
// Gated on [data-mounted] (a PURE wait — no clicking), because the zoom's
// applied column width is only truthful after TimelineZoom's post-mount read of
// --tl-col-floor / --tl-col-base. Every reading is paired with positive
// controls (lanes, axis day cells) in the same evaluation.
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
const page = await ctx.newPage();
await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-lane-subject]", { timeout: 240000 });
const mount = await page
  .waitForSelector("[data-mounted]", { timeout: 240000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(1500);

const read = await page.evaluate(() => {
  const track = document.querySelector("[data-tl-track]");
  const scroller = track ? track.closest("[class*='timeline_scroller__']") : null;
  const days = document.querySelectorAll("[data-tl-day]");
  const cols = track ? Number(track.getAttribute("data-tl-track")) : null;
  const colPx = days[0] ? days[0].getBoundingClientRect().width : null;
  const visible = scroller ? scroller.clientWidth : null;
  const lbl = document.querySelector("[class*='timeline_laneLabel__']");
  const lblW = lbl ? lbl.getBoundingClientRect().width : 0;
  const trackVisible = visible !== null ? visible - lblW : null;
  const perWeek = 5; // mock school week — read back below, not assumed
  return {
    _ctlLanes: document.querySelectorAll("[data-lane-subject]").length,
    _ctlDayCells: days.length,
    mountSeamPresent: !!document.querySelector("[data-mounted]"),
    axisColumns: cols,
    axisDayCells: days.length,
    colPx: colPx ? +colPx.toFixed(1) : null,
    fullAxisWidthPx: cols && colPx ? Math.round(cols * colPx) : null,
    scrollerClientWidth: visible,
    labelGutterPx: Math.round(lblW),
    trackVisiblePx: trackVisible ? Math.round(trackVisible) : null,
    // how many school days / weeks are actually on screen at this zoom
    daysVisible: trackVisible && colPx ? +(trackVisible / colPx).toFixed(1) : null,
    weeksVisibleAssuming5DayWeek:
      trackVisible && colPx ? +(trackVisible / colPx / perWeek).toFixed(1) : null,
    // and at the hard floor (the most year the current control can ever show)
    weeksVisibleAtFloor24:
      trackVisible ? +(trackVisible / 24 / perWeek).toFixed(1) : null,
    // what column width WOULD be needed to fit the whole axis
    colPxNeededToFitYear:
      cols && trackVisible ? +(trackVisible / cols).toFixed(2) : null,
    totalWeeksInAxis: cols ? +(cols / perWeek).toFixed(1) : null,
  };
});
console.log("[span]", JSON.stringify({ mountGate: mount, ...read }, null, 2));
await ctx.close();
await browser.close();
