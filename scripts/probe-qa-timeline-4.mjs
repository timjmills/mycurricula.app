// probe-qa-timeline-4.mjs — phone-tier follow-up for the 2026-07-31 Plan
// timeline audit. REPORT ONLY.
//
// The phone screenshot of Lessons+List shows the Status filter group running
// past the card's right edge with "Taught" cut mid-word and "Not yet" nowhere
// to be seen. That could be either
//   (a) a clipped group whose last options are UNREACHABLE — a §4 violation
//       ("every primary control reachable without off-screen overflow"), or
//   (b) a group that scrolls internally, which the contract explicitly allows.
// A screenshot cannot tell those apart. This measures which it is: it asks the
// group whether it can scroll, tries to scroll it, and hit-tests the last
// option's centre point.
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
const page = await ctx.newPage();
await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
await page.waitForSelector("[data-mounted]", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);

const lens = () =>
  page.evaluate(() => {
    const c = document.querySelector("[class*='timeline_card__']");
    return c && c.getAttribute("data-lens");
  });

// gate: prove interactive
let live = false;
for (let i = 0; i < 30 && !live; i++) {
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  live = (await lens()) === "lessons";
}
log("GATE interactive", live);
if (!live) {
  log("ABORT", "phone never became interactive");
  await browser.close();
  process.exit(0);
}
for (let i = 0; i < 20; i++) {
  await page.getByRole("radio", { name: "List", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  if (await page.locator('[role="radiogroup"][aria-label="Show which lessons"]').count()) break;
}
await page.mouse.move(10, 700);
await page.waitForTimeout(400);

const overflow = await page.evaluate(() => {
  const g = document.querySelector('[role="radiogroup"][aria-label="Show which lessons"]');
  if (!g) return { found: false };
  const opts = [...g.querySelectorAll('[role="radio"]')];
  const gr = g.getBoundingClientRect();
  const card = document.querySelector("[class*='timeline_card__']");
  const cr = card && card.getBoundingClientRect();
  const last = opts[opts.length - 1];
  const lr = last.getBoundingClientRect();
  const cs = getComputedStyle(g);
  // can it scroll?
  const before = g.scrollLeft;
  g.scrollLeft = 9999;
  const maxScrolled = g.scrollLeft;
  g.scrollLeft = before;
  const cx = lr.x + lr.width / 2;
  const cy = lr.y + lr.height / 2;
  const hitEl = document.elementFromPoint(cx, cy);
  return {
    found: true,
    optionNames: opts.map((o) => o.getAttribute("aria-label")),
    groupBox: { x: +gr.x.toFixed(1), w: +gr.width.toFixed(1), right: +(gr.x + gr.width).toFixed(1) },
    cardRight: cr ? +(cr.x + cr.width).toFixed(1) : null,
    viewportW: innerWidth,
    lastOption: last.getAttribute("aria-label"),
    lastOptionBox: { x: +lr.x.toFixed(1), w: +lr.width.toFixed(1), right: +(lr.x + lr.width).toFixed(1) },
    lastOptionOffViewport: lr.x + lr.width > innerWidth,
    groupOverflowX: cs.overflowX,
    groupScrollW: g.scrollWidth,
    groupClientW: g.clientWidth,
    groupCanScroll: maxScrolled > 0,
    maxScrollLeftReached: maxScrolled,
    // hit-test the last option's centre — is IT what is there, or is it clipped
    // away / covered by something else?
    hitAtLastOptionCentre: hitEl
      ? hitEl === last || last.contains(hitEl) || hitEl.contains(last)
        ? "the option itself"
        : hitEl.tagName + "." + String(hitEl.className).slice(0, 30)
      : "nothing (outside the viewport)",
    _controlOptionCount: opts.length,
  };
});
log("PHONE Status filter group — clipped or scrollable?", overflow);
await page.screenshot({ path: `${OUT}/phone-15-status-overflow.png` });

// Is the document itself sideways-scrollable here? (it must not be)
const doc = await page.evaluate(() => {
  const de = document.documentElement;
  window.scrollTo(400, window.scrollY);
  const x = window.scrollX;
  window.scrollTo(0, window.scrollY);
  return { docScrollW: de.scrollWidth, docClientW: de.clientWidth, movedX: x };
});
log("PHONE document horizontal scroll in Lessons+List", doc);

await browser.close();
console.log("done");
