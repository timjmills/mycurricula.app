/**
 * §4c STEP 3 — REVERSAL. Archives the scratch lessons this wave created, using
 * the app's OWN soft-delete, then verifies the result in the DB.
 *
 * Why the UI and not SQL: the runbook's reversal is specified as the app's own
 * delete semantics, and exercising it is free extra coverage of a write path
 * nothing else in this wave touched. A raw DELETE would also be an agent
 * mutating prod directly, which is forbidden here.
 *
 * WHAT IT WILL AND WILL NOT TOUCH. It archives ONLY cards whose title is
 * exactly "New lesson" — the hardcoded title createLesson assigns, and the
 * title both scratch rows carry. It is scoped to the week the scratch rows were
 * created in. If a real lesson were ever titled "New lesson" this would be
 * unsafe; it is not today (verified: the only two such rows in
 * personal_authored_lessons are the ones this wave created, and every seeded
 * lesson lives in master_core_lesson_events with a real title).
 *
 * Archive is reachable ONLY on the paper Week frame — WeekA/WeekC render tiles
 * with no context menu at all.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { authedStorageState, redact } from "./lib/auth.mjs";

const BASE = "https://mycurricula.app";
const TARGET = "New lesson";
const OUT = path.join(process.cwd(), "docs/screenshots/4c-step3");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
let state;
try {
  state = await authedStorageState(browser, {
    base: BASE,
    next: "/weekly",
    timeout: 120000,
    settleMs: 3000,
  });
} catch (e) {
  console.error("AUTH FAILED:", redact(String(e)));
  await browser.close();
  process.exit(2);
}

const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
const page = await ctx.newPage();

await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 180000 });
const ready = await page
  .waitForFunction(
    () => document.querySelectorAll('[data-planner-item^="lesson:"]').length > 0,
    null,
    { timeout: 180000, polling: 1000 },
  )
  .then(() => true)
  .catch(() => false);
console.log(`  hydrated: ${ready}`);
if (!ready) {
  await page.screenshot({ path: path.join(OUT, "cleanup-no-hydrate.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}

let archived = 0;
for (let pass = 0; pass < 6; pass++) {
  const card = page.locator(`[data-planner-item^="lesson:"]`, { hasText: TARGET }).first();
  if (!(await card.count())) break;
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.hover().catch(() => {});
  await page.waitForTimeout(700);
  // TWO openers, tried in order. The ⋯ affordance is hover-revealed but its
  // 44px box stays in the DOM, so a scripted click reaches it; right-click is
  // the fallback and is DISABLED in compact density, which is why it cannot be
  // the primary. Trying only one of them is how a reachable control gets
  // reported as missing.
  const more = card.locator('button[aria-label="More actions"]').first();
  if (await more.count()) {
    await more.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  let item = page.getByRole("menuitem", { name: /^Archive$/ }).first();
  if (!(await item.count())) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
    await card.click({ button: "right" }).catch(() => {});
    await page.waitForTimeout(1200);
    item = page.getByRole("menuitem", { name: /^Archive$/ }).first();
  }
  if (!(await item.count())) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.screenshot({ path: path.join(OUT, `cleanup-no-menu-${pass}.png`), fullPage: true });
    console.log(`  pass ${pass}: no Archive menuitem via ⋯ OR right-click — stopping`);
    break;
  }
  await item.click().catch(() => {});
  archived += 1;
  console.log(`  archived one "${TARGET}" (${archived})`);
  // The undo toast lives ~5s; let it lapse so the write settles.
  await page.waitForTimeout(7000);
}

await page.screenshot({ path: path.join(OUT, "06-after-cleanup.png"), fullPage: true });
console.log(`\n  archived: ${archived}`);
console.log(`  now verify in SQL — deleted_at must be non-null on both rows.`);
await browser.close();
