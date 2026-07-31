/**
 * §4c STEP 3 — READ-BACK ONLY. Writes nothing.
 *
 * Closes the last gap in the STEP 3 result: `prep` and `builds` were confirmed
 * PERSISTED in Postgres, but never confirmed RENDERED after a reload, because
 * `Builds & prep` is collapsed by default and the reload pass did not re-open
 * it. Persistence and the read path are different claims, and this repo has
 * been burned by conflating them.
 *
 * Loads the existing scratch lesson fresh (so every value shown came from the
 * list-hydrate read, not from any reducer state this process created), opens the
 * collapsed section, and reads all seven editors back.
 */
import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { authedStorageState, redact } from "./lib/auth.mjs";

const BASE = "https://mycurricula.app";
const OUT = path.join(process.cwd(), "docs/screenshots/4c-step3");
mkdirSync(OUT, { recursive: true });

const WANT = [
  ["duration_minutes", "Lesson duration in minutes", "35"],
  ["assessment_title", "Assessment title", "QA exit ticket"],
  ["assessment_purpose", "Assessment purpose", "QA fluency check"],
  ["assessment_notes", "Assessment notes", "QA three problems"],
  ["builds", "Builds on prior learning", "QA prior unit"],
  ["prep", "Prep and materials", "QA print strips"],
];

const browser = await chromium.launch({ channel: "chrome" });
let state;
try {
  state = await authedStorageState(browser, { base: BASE, next: "/planner", timeout: 120000, settleMs: 3000 });
} catch (e) {
  console.error("AUTH FAILED:", redact(String(e)));
  await browser.close();
  process.exit(2);
}
const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
const page = await ctx.newPage();

await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForFunction(() => document.body.innerText.includes("Lessons"), null, {
  timeout: 180000,
  polling: 1000,
}).catch(() => {});
// NOT via the search box. Filling it with the lesson's EXACT title returned
// "No lessons match "New lesson"." while the same lesson was present in the
// unfiltered list and openable — so the search is an unreliable route to it (see
// the note in the report; it is a finding in its own right, not just a probe
// quirk). Browse the list instead, which is the flow that worked.
const opened = await page
  .getByText("New lesson", { exact: false })
  .first()
  .click({ timeout: 25000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(6000);
console.log(`\n  opened the scratch lesson: ${opened}`);
if (!opened) {
  await page.screenshot({ path: path.join(OUT, "readback-not-found.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}

const adv = page.getByRole("radio", { name: /^Advanced$/i }).first();
if (await adv.count()) {
  await adv.click().catch(() => {});
  await page.waitForTimeout(2000);
}
const bp = page.locator("button[aria-expanded]").filter({ hasText: /Builds\s*&\s*prep/i }).first();
if (await bp.count()) {
  if ((await bp.getAttribute("aria-expanded")) !== "true") {
    await bp.scrollIntoViewIfNeeded().catch(() => {});
    await bp.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  console.log(`  Builds & prep aria-expanded: ${await bp.getAttribute("aria-expanded")}`);
} else {
  console.log("  !! Builds & prep header not found");
}

let fails = 0;
for (const [col, aria, want] of WANT) {
  const el = page.locator(`[aria-label="${aria}"]`).first();
  if (!(await el.count())) {
    console.log(`  FAIL ${col} — editor absent`);
    fails += 1;
    continue;
  }
  const got = await el.inputValue().catch(() => "");
  const ok = got === want;
  if (!ok) fails += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${col} — want "${want}" got "${got}"`);
}

await page.screenshot({ path: path.join(OUT, "07-readback.png"), fullPage: true });
console.log(`\n  ${WANT.length - fails}/${WANT.length} fields rendered from the hydrate read`);
await browser.close();
process.exit(fails > 0 ? 1 : 0);
