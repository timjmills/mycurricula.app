// probe-timeline-hscroll.mjs — the §4 no-document-horizontal-scroll check for
// the Plan drawer at 375, with the drawer OPEN and each tab selected.
//
// The three-tab strip visibly clips at 375 ("Units" renders as "nits"), which
// §4 permits ONLY as internal scroll — the document itself must not move
// sideways. `document.scrollWidth` alone cannot settle that: it is blind to a
// bar hidden by `overflow-x: clip`, so the real test is to ASK the page to
// scroll and see whether it does.

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const out = [];
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
// `state: "attached"`, not the default "visible": `data-mounted` rides on the
// canvas card, which at 375 can be scrolled out of the viewport — and an
// off-screen element is "not visible" to Playwright, so the default state waits
// for a condition that never arrives and times out on a page that hydrated
// fine. The dev hydrate here also runs 5–9s and longer under load, hence 180s.
await page.waitForSelector("[data-mounted]", { state: "attached", timeout: 180000 });
await page.locator("[class*='timeline_drawerToggle__']").first().click();
await page.waitForTimeout(400);

for (const tab of ["Units", "Lessons", "Needs attention"]) {
  await page
    .locator('[role="radiogroup"][aria-label="Library section"] [role="radio"]', { hasText: tab })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);
  const r = await page.evaluate(`(() => {
    // The app shell scrolls #main-content, not the document — so BOTH are asked.
    const main = document.querySelector("#main-content");
    window.scrollTo(400, 0);
    if (main) main.scrollTo(400, 0);
    const r = {
      // POSITIVE CONTROL in the same evaluation: the drawer really is open on
      // the tab we think it is, so a "0" below is a verdict and not an empty page.
      control: {
        drawerOpen: !!document.querySelector("#plan-timeline-library"),
        rows: document.querySelectorAll("#plan-timeline-library [class*='timeline_row__'], #plan-timeline-library [class*='timeline_issue__']").length,
        lanes: document.querySelectorAll("[data-lane-subject]").length,
      },
      windowScrollX: window.scrollX,
      mainScrollLeft: main ? main.scrollLeft : null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
    window.scrollTo(0, 0);
    if (main) main.scrollTo(0, 0);
    return r;
  })()`);
  out.push({ tab, ...r });
  const ok = r.windowScrollX === 0 && (r.mainScrollLeft === null || r.mainScrollLeft === 0);
  console.log(`${ok ? "[ok]  " : "[FAIL]"} ${tab} :: ${JSON.stringify(r)}`);
}
await page.screenshot({ path: "docs/screenshots/timeline-handoff-pieces/phone-06-hscroll.png" });
await browser.close();
const bad = out.filter((r) => r.windowScrollX !== 0 || (r.mainScrollLeft ?? 0) !== 0);
console.log(`\nfailures: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
