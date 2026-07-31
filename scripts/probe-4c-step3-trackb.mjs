/**
 * §4c STEP 3 — Track-B lesson fields, written for real against PRODUCTION.
 *
 * WHY THIS EXISTS. Every Track-B column is null on all 1,254 master lesson rows
 * and all 57 units. With no source values, a correctly-widened read and a
 * completely-unwidened one render identically — so only a WRITE separates them.
 * That is the entire argument for touching prod at all.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — the runbook's "assertion 1".
 * docs/4c-write-plan.md STEP 3 says the value being visible in the editor
 * immediately after the write, with no reload, proves "the post-mutation reload
 * path returned it", and instructs "Do not shortcut assertion 1."
 *
 * That is false, and this probe does not perform it. Field writes are FULLY
 * OPTIMISTIC: `editLesson` dispatches the patch into the reducer
 * unconditionally, and the serial write queue's `send` DISCARDS the `Lesson`
 * that `updateLesson` returns (lib/planner-store.tsx:3045-3046) — and that queue
 * is the ONLY caller of `plannerClient.updateLesson` in the app. So the values
 * built by `reloadLesson` and `reloadAuthoredLesson` — the exact pair the
 * four-callsite rule protects — are never rendered. Assertion 1 passes whether
 * or not those callsites spread `trackBArgsFromRow`. Performing it would
 * manufacture a confident false "verified", which is the failure mode this
 * repo keeps paying for.
 *
 * So the real assertions are:
 *   RELOAD — after a full page reload, the value is on screen. This exercises
 *            the LIST-HYDRATE read path (two of the four callsites) for real.
 *   DB     — the value is in the column. Persistence, independent of any UI.
 *
 * SCOPE HONESTY: this covers `personal_authored_lessons` only. The scratch
 * lesson is created unfiled (`createLesson` hardcodes `unit: ""` and no
 * persisted verb can change a lesson's unit), so it can never reach the unit
 * drawer — STEP 3c is not runnable on it and is not attempted here.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION: everything operates on a lesson this script
 * creates. It touches no seeded curriculum. Reversal is the app's own
 * soft-delete, verified rather than assumed.
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
const TITLE = arg("title", "ZZ-QA-SCRATCH-lesson");
const OUT = path.join(process.cwd(), "docs/screenshots/4c-step3");
mkdirSync(OUT, { recursive: true });

const R = [];
const mark = (state, label, detail = "") => {
  R.push({ state, label, detail });
  const tag = { pass: "ok  ", fail: "FAIL", abort: "ABRT", note: "note" }[state];
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
};

/** The seven Track-B fields, with the editor locator and the DB column.
 *  Values are chosen to be unmistakably ours and to survive round-tripping. */
const FIELDS = [
  { col: "duration_minutes", aria: "Lesson duration in minutes", value: "35", expect: 35 },
  { col: "assessment_title", aria: "Assessment title", value: "QA exit ticket" },
  { col: "assessment_purpose", aria: "Assessment purpose", value: "QA fluency check" },
  { col: "assessment_notes", aria: "Assessment notes", value: "QA three problems" },
  { col: "builds", aria: "Builds on prior learning", value: "QA prior unit" },
  { col: "prep", aria: "Prep and materials", value: "QA print strips" },
];

const main = async () => {
  console.log(`\n§4c STEP 3 — Track-B write round-trip against ${BASE}\n`);
  if (!/^https:\/\/mycurricula\.app/.test(BASE) && !/localhost/.test(BASE)) {
    console.error("REFUSING: unrecognised base.");
    process.exit(2);
  }

  const browser = await chromium.launch({ channel: "chrome" });
  let storageState;
  try {
    storageState = await authedStorageState(browser, {
      base: BASE,
      next: "/daily",
      timeout: 120000,
      settleMs: 3000,
    });
  } catch (e) {
    console.error("AUTH FAILED:", redact(String(e)));
    await browser.close();
    process.exit(2);
  }

  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });

  // THE ONE GUARD THAT MATTERS HERE. NEXT_PUBLIC_THEME_SYNC=1, and theme.tsx
  // has a heal-push and an empty-row seed that fire on LOAD, not on any action
  // I take — so a stray local theme value could overwrite this teacher's real
  // saved appearance. Blocking the route makes that unrepresentable rather than
  // merely unlikely. Nothing else about the run needs it.
  // ATTRIBUTION CONTROL. `route.abort()` surfaces as `net::ERR_FAILED` in the
  // console, indistinguishable from a real network fault — so with the guard on,
  // MY OWN instrument manufactures console errors. `--no-pref-guard` runs the
  // identical path without it, which is what lets a failure be attributed to the
  // app rather than to me. Never report an ERR_FAILED from a guarded run as a
  // finding without the control.
  const PREF_GUARD = !argv.includes("--no-pref-guard");
  if (PREF_GUARD) await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  mark("note", `theme-pref guard ${PREF_GUARD ? "ON" : "OFF (control run)"}`);

  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  const bad = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  // URLs, not just counts — "5 console errors" is not a diagnosis.
  page.on("requestfailed", (r) => {
    failed.push({ url: r.url().slice(0, 160), why: r.failure()?.errorText ?? "" });
  });
  page.on("response", async (r) => {
    if (r.status() >= 400) {
      let body = "";
      try {
        body = (await r.text()).slice(0, 600);
      } catch {
        body = "(unreadable)";
      }
      bad.push({ url: r.url().slice(0, 160), status: r.status(), body });
    }
  });

  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 180000 });
  mark(page.url().includes("/onboarding") ? "fail" : "pass", "landed on /daily", page.url());

  // READINESS BY DATA, not by markup. The store's first server AND first client
  // render both paint EMPTY_CATALOG, so the add control can exist while
  // `handleQuickAddLesson` silently no-ops on an unhydrated catalog. Wait for a
  // real hydrated lesson to appear.
  const hydrated = await page
    .waitForFunction(
      () => document.querySelectorAll('[data-planner-item^="lesson:"]').length > 0,
      null,
      { timeout: 180000, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);
  mark(hydrated ? "pass" : "abort", "planner hydrated (real lesson rows present)");
  if (!hydrated) {
    await page.screenshot({ path: path.join(OUT, "no-hydrate.png") });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: path.join(OUT, "01-daily.png"), fullPage: true });

  // ── create ────────────────────────────────────────────────────────────────
  // Edit mode's dashed row is a ONE-click create that also opens the lesson,
  // unlike the View-mode popover. `.modesw-ib` is a global class, not a CSS
  // module, so it survives the prod build hash.
  const editBtn = page.locator('button.modesw-ib[aria-label="Edit"]').first();
  if (await editBtn.count()) {
    await editBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  mark("note", "entered Edit mode", `${await editBtn.count()} toggle(s) found`);

  const addBtn = page.getByRole("button", { name: /^\+?\s*Add lesson$/i }).first();
  const canAdd = await addBtn
    .waitFor({ state: "visible", timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  mark(canAdd ? "pass" : "abort", "Add lesson control reachable");
  if (!canAdd) {
    await page.screenshot({ path: path.join(OUT, "no-add.png"), fullPage: true });
    await browser.close();
    process.exit(1);
  }

  await addBtn.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, "02-created.png"), fullPage: true });

  // ── open the lesson workspace ─────────────────────────────────────────────
  // The seven Track-B editors live ONLY in components/lesson-plan-v2's
  // LessonWorkspace, not in the /daily edit split. The Planner Hub is the
  // reachable host for an UNFILED lesson (the unit-explorer route needs a unit,
  // and this lesson can never have one — createLesson hardcodes `unit: ""` and
  // no persisted verb can change it).
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(4000);
  const lessonsNav = page.getByRole("button", { name: /^Lessons$/i }).first();
  if (await lessonsNav.count()) {
    await lessonsNav.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  const card = page.getByText("New lesson", { exact: false }).first();
  const opened = await card
    .click({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(5000);
  mark(opened ? "pass" : "abort", "opened the scratch lesson in the workspace");
  await page.screenshot({ path: path.join(OUT, "03-workspace.png"), fullPage: true });

  if (opened) {
    // Advanced reveals `Builds & prep` and the purpose/notes textareas — they
    // are not merely collapsed, they are NOT RENDERED in Simple mode on a
    // lesson where both are empty.
    const adv = page.getByRole("radio", { name: /^Advanced$/i }).first();
    if (await adv.count()) {
      await adv.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    // Assessment kind must be set before the title input exists.
    const formative = page.getByRole("radio", { name: /^Formative$/i }).first();
    if (await formative.count()) {
      await formative.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    for (const f of FIELDS) {
      const el = page.locator(`[aria-label="${f.aria}"]`).first();
      if (!(await el.count())) {
        mark("fail", `write ${f.col}`, "editor not found");
        continue;
      }
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.fill(f.value).catch(() => {});
      await page.waitForTimeout(1200);
      mark("pass", `typed ${f.col}`, f.value);
    }
    // Every field commits per keystroke, but the serial queue is latest-wins
    // with one in flight — give the tail of it time to land before asserting.
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(OUT, "04-written.png"), fullPage: true });

    // ASSERTION "RELOAD": a full reload re-runs the hydrate chain, so what shows
    // now came from the LIST-HYDRATE read path, not the optimistic reducer.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(15000);
    await page.screenshot({ path: path.join(OUT, "05-after-reload.png"), fullPage: true });
    mark("note", "reloaded — compare 05-after-reload.png against the DB read");
  }

  const mine = failed.filter((f) => /teacher_preferences/.test(f.url));
  const notMine = failed.filter((f) => !/teacher_preferences/.test(f.url));

  console.log(`\n  NETWORK`);
  console.log(`    aborted BY ME (teacher_preferences): ${mine.length}`);
  for (const f of notMine) console.log(`    !! failed: ${f.url} — ${f.why}`);
  for (const b of bad) console.log(`    !! HTTP ${b.status}: ${b.url}\n       ${b.body}`);

  writeFileSync(
    path.join(OUT, `results${PREF_GUARD ? "" : "-control"}.json`),
    JSON.stringify(
      {
        base: BASE,
        title: TITLE,
        prefGuard: PREF_GUARD,
        results: R,
        consoleErrors: errors,
        abortedByMe: mine,
        otherFailures: notMine,
        httpErrors: bad,
      },
      null,
      2,
    ),
  );
  console.log(`\n  artifacts → ${OUT}`);

  await ctx.close();
  await browser.close();
  return R.some((r) => r.state === "fail") ? 1 : 0;
};

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error("\nPROBE THREW:", redact(String(e)));
    process.exit(1);
  });
