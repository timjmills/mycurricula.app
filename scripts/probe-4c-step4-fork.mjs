/**
 * §4c STEP 4 — fork-per-field, against PRODUCTION. The riskiest step in the
 * runbook and the last one outstanding.
 *
 * WHAT IT PROVES. Editing a MASTER-derived lesson in Personal mode must lazily
 * create a `personal_core_lesson_event_copies` row carrying the edited value,
 * and must leave the master row untouched. That is the forking model — the
 * product's competitive differentiator (CLAUDE.md §2) — and it has never been
 * exercised against real Supabase. Both copies that exist on prod predate B2 and
 * carry no Track-B value at all, so fork-per-field is entirely unproven.
 *
 * WHY IT IS THE RISKY ONE. It is the only step that touches seeded Grade-5
 * curriculum. Everything else this wave operated on scratch rows it created.
 *
 * THE HARD STOP. If `master_core_lesson_events` changes, a Personal edit has
 * written to the plan every teacher shares. That outranks every other finding in
 * the runbook: the probe stops immediately and does not attempt its own reversal
 * (an automated "undo" on top of an unexplained master write is how you turn one
 * bad row into two).
 *
 * MODE IS THE SAFETY PROPERTY, and it is asserted rather than assumed. In Team
 * mode the same keystroke routes to `patchMaster` and writes the shared row on
 * purpose. The frame carries `[data-mode="team"]` in that state (the pink
 * caution glow keys off it), so the probe REFUSES to type unless that attribute
 * is absent. `--dry-run` stops after the assertion, before any write.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState, redact } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app");
const DRY = argv.includes("--dry-run");
/** The chosen master lesson: week 30 (far from the taught week 12), Math,
 *  no copy for any teacher. Captured verbatim in SQL before this ran. */
const LESSON_TITLE = arg("title", "Title: Numerical Patterns");
const DURATION = arg("duration", "45");
const OUT = path.join(process.cwd(), "docs/screenshots/4c-step4");
mkdirSync(OUT, { recursive: true });

const R = [];
const mark = (state, label, detail = "") => {
  R.push({ state, label, detail });
  console.log(
    `  ${{ pass: "ok  ", fail: "FAIL", abort: "ABRT", note: "note" }[state]} ${label}` +
      (detail ? ` — ${detail}` : ""),
  );
};

const browser = await chromium.launch({ channel: "chrome" });
let storageState;
try {
  storageState = await authedStorageState(browser, {
    base: BASE,
    next: "/planner",
    timeout: 120000,
    settleMs: 3000,
  });
} catch (e) {
  console.error("AUTH FAILED:", redact(String(e)));
  await browser.close();
  process.exit(2);
}

const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
// Theme-sync writes to a real teacher's `teacher_preferences` on LOAD, not on
// anything I do. Blocking it makes that unrepresentable.
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
const page = await ctx.newPage();
const bad = [];
page.on("response", async (r) => {
  if (r.status() >= 400) bad.push({ url: r.url().slice(0, 140), status: r.status() });
});

console.log(`\n§4c STEP 4 — fork-per-field${DRY ? " (DRY RUN — no write)" : ""}\n`);

await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 180000 });
const hydrated = await page
  .waitForFunction(() => document.body.innerText.includes("Lessons"), null, {
    timeout: 180000,
    polling: 1000,
  })
  .then(() => true)
  .catch(() => false);
mark(hydrated ? "pass" : "abort", "planner hub reachable");

// ── find the lesson by search, not by 18 clicks of week navigation ──────────
const search = page.locator('input[placeholder*="Search lessons"]').first();
if (await search.count()) {
  await search.fill("Numerical Patterns").catch(() => {});
  await page.waitForTimeout(3500);
}
const row = page.getByText(LESSON_TITLE, { exact: false }).first();
const found = await row
  .waitFor({ state: "visible", timeout: 30000 })
  .then(() => true)
  .catch(() => false);
mark(found ? "pass" : "abort", `located "${LESSON_TITLE}"`);
if (!found) {
  await page.screenshot({ path: path.join(OUT, "not-found.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}
await row.click().catch(() => {});
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(OUT, "01-opened.png"), fullPage: true });

// ── THE SAFETY ASSERTION — mode, before a single keystroke ─────────────────
// TWO signals, and the POSITIVE one is required.
//
// `<html data-mode="team">` is set and REMOVED by ChromeShell, never written as
// "personal" (ChromeShell.tsx:63) — so absence really does mean Personal. But
// absence is also what an UNHYDRATED page shows, and what a page that never
// mounted ChromeShell shows. On its own it is an absence-assertion that fails
// OPEN, in the one place in this wave where failing open means writing to the
// plan every teacher shares.
//
// So the gate is the ModeSwitch itself: `aria-pressed` on the Personal segment
// (ModeSwitch.tsx:118-120). That cannot be satisfied by a dead page — it
// requires the toggle to have rendered AND to report its state. If the switch is
// not found at all, the mode is UNKNOWN, and unknown is not permission.
const mode = await page.evaluate(() => {
  const personalSeg = document.querySelector('[aria-label="Personal"][aria-pressed]');
  const teamSeg = document.querySelector('[aria-label="Team Curriculum"][aria-pressed]');
  return {
    switchFound: Boolean(personalSeg || teamSeg),
    personalPressed: personalSeg?.getAttribute("aria-pressed") ?? null,
    teamPressed: teamSeg?.getAttribute("aria-pressed") ?? null,
    teamAttr: document.querySelectorAll('[data-mode="team"]').length,
  };
});

if (!mode.switchFound) {
  mark(
    "abort",
    "mode is UNKNOWN — the Personal/Team switch never rendered",
    "refusing to infer Personal from the absence of a team marker",
  );
  await page.screenshot({ path: path.join(OUT, "mode-unknown.png"), fullPage: true });
  await browser.close();
  process.exit(2);
}

const personal = mode.personalPressed === "true" && mode.teamPressed !== "true" && mode.teamAttr === 0;
mark(
  personal ? "pass" : "abort",
  "PERSONAL mode confirmed POSITIVELY (aria-pressed on the switch, not just an absent attribute)",
  `personal=${mode.personalPressed} team=${mode.teamPressed} data-mode=team nodes=${mode.teamAttr}`,
);
if (!personal) {
  console.log("\n  REFUSING TO TYPE: in Team mode this keystroke writes the SHARED plan.\n");
  await page.screenshot({ path: path.join(OUT, "team-mode-refused.png"), fullPage: true });
  await browser.close();
  process.exit(2);
}

const dur = page.locator('[aria-label="Lesson duration in minutes"]').first();
const hasDur = await dur.count();
mark(hasDur ? "pass" : "abort", "duration editor present");

if (DRY) {
  console.log("\n  DRY RUN — stopping before the write, as asked.\n");
  writeFileSync(path.join(OUT, "results-dry.json"), JSON.stringify({ R, bad }, null, 2));
  await browser.close();
  process.exit(0);
}

if (hasDur) {
  await dur.scrollIntoViewIfNeeded().catch(() => {});
  await dur.fill(DURATION).catch(() => {});
  mark("note", `typed duration ${DURATION} — this is the fork trigger`);
  // Per-keystroke commit, latest-wins queue with one in flight: let the tail land.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(OUT, "02-after-write.png"), fullPage: true });
}

for (const b of bad) console.log(`    !! HTTP ${b.status}: ${b.url}`);
writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ R, bad }, null, 2));
console.log(`\n  artifacts → ${OUT}`);
console.log(`  NOW VERIFY IN SQL: a NEW copy carrying ${DURATION}, and master BYTE-IDENTICAL.`);
await browser.close();
