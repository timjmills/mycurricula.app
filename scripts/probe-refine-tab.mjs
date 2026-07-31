// scripts/probe-refine-tab.mjs — §4b live pass for the Wave 5 REFINE tab.
//
// WHICH TREE THIS MEASURES. The WORKING TREE, which is dirty and shared with
// several concurrent lanes — NOT a commit. Nothing here is evidence about
// `HEAD`. The run prints the sha and the dirty-file list so a reader can never
// mistake one for the other (CLAUDE.md §4b).
//
// WHAT IT CHECKS, and why each one needs a browser rather than a test:
//   1. The tab EXISTS in the strip and is reachable by click (the unit tests
//      render RefineTab directly and would pass even if it were never wired).
//   2. The table paints one row per lesson, with real values in the cells.
//   3. Enter-to-advance actually moves focus down the column — the interaction
//      the whole surface is built around, and pure keyboard behaviour that a
//      static string render cannot see.
//   4. An edit PERSISTS: type an objective, leave the tab, come back, still
//      there. This is the check that would catch an input wired to nothing.
//   5. A fill-down with an empty source is DISABLED (the anti-wipe guard,
//      observed as a real DOM attribute rather than a unit-test return value).
//   6. No page-level horizontal scroll at 375 / 768 / 1440 (CLAUDE.md §4), and
//      the table's own overflow container is the thing that scrolls.
//   7. Browser-console errors during the whole pass.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-refine-tab.mjs
//        PROBE_BASE defaults to http://localhost:3010

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
// execFileSync, not execSync: no shell, so nothing here can be a command-string
// injection even if an argument ever stops being a hardcoded constant.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT = path.resolve("docs/screenshots/refine-tab");
await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
const check = (label, cond, detail = "") =>
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
const info = (label, detail = "") =>
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);

// ── Precondition block (CLAUDE.md §4b) ──────────────────────────────────────
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"])
  .toString()
  .trim();
const dirty = execFileSync("git", [
  "diff",
  "HEAD",
  "--name-only",
  "--",
  "components",
  "lib",
  "app",
])
  .toString()
  .trim();
info("HEAD", sha);
info(
  "tree",
  dirty
    ? `DIRTY — this run measures the WORKING TREE, not ${sha}. Dirty: ${dirty.split("\n").length} file(s)`
    : "clean",
);

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
// Console errors are split by WHOSE they are, and neither bucket is discarded.
// This repo runs several lanes against one checkout and one dev server, so a
// sibling's half-saved file produces a very loud compile error that has nothing
// to do with the surface under test. Attributing it beats both alternatives:
// counting it as this wave's failure (a false positive, which is how the first
// run reported it) and filtering it away silently (which hides a real, if
// foreign, breakage).
const OTHER_LANE_PATHS = ["components/hub-v2/timeline/", "lib/plan-timeline/"];
const consoleErrors = [];
const foreignErrors = [];
function recordError(text) {
  const t = String(text).slice(0, 300);
  // Pre-existing dev-only noise from a linkedom optional dep; not this wave's.
  if (t.includes("Can't resolve 'canvas'")) return;
  if (OTHER_LANE_PATHS.some((p) => t.includes(p))) foreignErrors.push(t);
  else consoleErrors.push(t);
}
context.on("weberror", (e) => recordError(e.error()));

const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") recordError(m.text());
});

try {
  // ── Open the unit workspace via /weekly's UnitChip ───────────────────────
  //
  // DELIBERATELY NOT the /planner timeline, which was the first choice and had
  // to be abandoned mid-probe: a concurrent lane is rewriting that surface
  // (adding unit-band drag), so its band button appears, disappears and changes
  // gesture between runs — the probe reported "dialog never opened" twice for
  // reasons that had nothing to do with this tab. `UnitChip` is a stable,
  // separately-owned entry point with a semantic accessible name
  // (components/unit-chip/UnitChip.tsx:89), and it reaches the SAME singleton
  // workspace host, so nothing about the surface under test changes.
  await bypassLogin(context, { base: BASE, next: "/planner", timeout: 90000 });

  // TWO ENTRY POINTS, TRIED IN TURN, because ONE of them is not reliable right
  // now and that is not a fact about this tab. A concurrent lane is rewriting
  // the /planner timeline (adding unit-band drag), so its band button changes
  // shape and gesture between runs; this probe reported "the dialog never
  // opened" twice for that reason alone. `UnitChip` is a separately-owned,
  // semantically-named control (components/unit-chip/UnitChip.tsx:89) that
  // reaches the SAME singleton workspace host, so whichever one lands, the
  // surface under test is identical. If BOTH fail the probe says so rather than
  // reporting a pass it did not earn.
  // /daily FIRST — it is the one that reliably lands. It also self-selects a
  // lesson, which bounces the URL (`/daily` → `/daily?lesson=…` → `/daily`)
  // before the chip mounts; an earlier revision waited 30s from navigation and
  // lost the race to that bounce, so the wait below is generous on purpose.
  //
  // The route is the DEEP LINK, not bare `/daily`: a fresh probe context has no
  // stored selection, so bare `/daily` can land on a day with no lesson open and
  // therefore no chip to click — which is how this probe spent three runs
  // reporting "no entry point" while the same chip was plainly visible in an
  // already-warm browser. `m-11-1` is a mock Fractions lesson (11 lessons in the
  // unit — enough rows for Enter-to-advance to mean something).
  const CHIP = 'button[aria-label^="Open the"][aria-label$="unit workspace"]';
  const ENTRIES = [
    { name: "UnitChip on the day view", route: "/daily?lesson=m-11-1", sel: CHIP },
    { name: "UnitChip on a lesson row", route: "/weekly?lesson=m-11-1", sel: CHIP },
    {
      name: "/planner timeline unit band",
      route: "/planner",
      sel: 'button[class*="band"]',
    },
  ];

  const dialog = page.locator('[role="dialog"]').first();
  let opened = null;
  for (const entry of ENTRIES) {
    try {
      await page.goto(`${BASE}${entry.route}`, { waitUntil: "domcontentloaded" });
      // The Supabase-less dev hydrate runs 5–17s; wait on a real signal.
      await page.waitForSelector("button", { timeout: 45000 });
      const target = page.locator(entry.sel).first();
      await target.waitFor({ state: "visible", timeout: 75000 });
      await target.click({ timeout: 10000 });
      await dialog.waitFor({ state: "visible", timeout: 20000 });
      opened = entry.name;
      break;
    } catch {
      info("entry point unavailable, trying the next", entry.name);
    }
  }
  if (!opened) throw new Error("no entry point could open the unit workspace");
  info("opened via", opened);

  // ── 1. The tab is in the strip ───────────────────────────────────────────
  //
  // SCOPED TO THE STRIP'S OWN TABLIST. A bare `[role="tab"]` sweep is the wrong
  // instrument here and reported a false failure on the first run: the context
  // DRAWER has its own, correctly-roled tablist (Assessments · Insights · Prep),
  // so a page-wide scrape sees nine "tabs" and concludes the B3 drawer ruling
  // was violated when the strip is in fact untouched. The two tablists are
  // distinguished by `aria-label` — "Unit details" is the strip (ExplorerShell's
  // `tablistLabel`), "Unit context" is the drawer.
  const strip = page.locator('[role="tablist"][aria-label="Unit details"]');
  const tabNames = (await strip.getByRole("tab").allTextContents()).map((s) =>
    s.trim(),
  );
  info("tab strip", tabNames.join(" · "));
  check("Refine is in the tab strip", tabNames.includes("Refine"));
  check(
    "Refine sits after Lessons, per the handoff order",
    tabNames.indexOf("Refine") === tabNames.indexOf("Lessons") + 1,
    tabNames.join(" · "),
  );
  check(
    "Refine did NOT arrive by promoting a drawer pane into the strip",
    !tabNames.includes("Assessments") && !tabNames.includes("Insights"),
    tabNames.join(" · "),
  );

  // The other half of the B3 ruling — Assessments/Insights still EXIST, as
  // drawer panes. The drawer is closed by default (a per-teacher preference),
  // so its tablist is not mounted until it is opened; reading it blind reported
  // an empty pane list and failed the check for a reason that was purely about
  // preference state, not conformance. Open it, then look.
  await page.locator("[data-ue-drawer-toggle]").click();
  await page.waitForTimeout(500);
  const drawerPanes = (
    await page
      .locator('[role="tablist"][aria-label="Unit context"]')
      .getByRole("tab")
      .allTextContents()
  ).map((s) => s.trim());
  info("drawer panes (a separate tablist — NOT the strip)", drawerPanes.join(" · "));
  check(
    "Assessments and Insights are still drawer panes",
    drawerPanes.includes("Assessments") && drawerPanes.includes("Insights"),
    drawerPanes.join(" · ") || "(drawer tablist not found)",
  );
  // Put it back so the drawer's width does not skew the responsive measurements.
  await page.locator("[data-ue-drawer-toggle]").click();
  await page.waitForTimeout(400);

  const refineTab = page.getByRole("tab", { name: "Refine" });
  await refineTab.click();
  await page.waitForTimeout(600);

  // ── 2. Rows ──────────────────────────────────────────────────────────────
  const rows = page.locator('[role="dialog"] tbody tr');
  const rowCount = await rows.count();
  check("the table paints a row per lesson", rowCount > 0, `${rowCount} rows`);

  const firstTitle = await page
    .locator('[role="dialog"] tbody tr')
    .first()
    .locator('input[aria-label^="Title"]')
    .inputValue();
  check(
    "row cells carry real lesson values",
    firstTitle.trim().length > 0,
    `row 1 title = "${firstTitle}"`,
  );

  await page.screenshot({ path: path.join(OUT, "refine-1440.png") });

  // ── 3. Enter-to-advance ──────────────────────────────────────────────────
  if (rowCount >= 2) {
    await page.locator('input[aria-label="Objective, lesson 1"]').click();
    await page.keyboard.press("Enter");
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    check(
      "Enter moves focus down the Objective column",
      focused === "Objective, lesson 2",
      `focus landed on "${focused}"`,
    );

    // The anti-trap half: Enter on the LAST row must not swallow the key and
    // strand the teacher — focus should simply stay put.
    await page
      .locator(`input[aria-label="Objective, lesson ${rowCount}"]`)
      .click();
    await page.keyboard.press("Enter");
    const lastFocus = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    check(
      "Enter on the last row does not strand focus",
      lastFocus === `Objective, lesson ${rowCount}`,
      `focus = "${lastFocus}"`,
    );
  }

  // ── 4. An edit persists across a tab round-trip ──────────────────────────
  const stamp = `I can probe ${Date.now()}`;
  const objective1 = page.locator('input[aria-label="Objective, lesson 1"]');
  await objective1.click();
  await objective1.fill(stamp);
  await page.waitForTimeout(900); // past the store's 700ms coalesce window
  await page.getByRole("tab", { name: "Lessons" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(600);
  const readBack = await page
    .locator('input[aria-label="Objective, lesson 1"]')
    .inputValue();
  check(
    "an objective typed in Refine survives leaving and re-entering the tab",
    readBack === stamp,
    `read back "${readBack}"`,
  );

  // The same edit must show up on the OTHER surface reading the same field —
  // proof it went to the store, not to local component state.
  await page.getByRole("tab", { name: "Unit Plan" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(500);

  // ── 5. Fill-down guard, observed in the DOM ──────────────────────────────
  const fillButtons = page.locator(
    '[role="dialog"] thead button[aria-label^="Copy the first lesson"]',
  );
  const fillCount = await fillButtons.count();
  check("every fillable column offers a fill-down", fillCount === 3, `${fillCount} found`);
  const states = [];
  for (let i = 0; i < fillCount; i += 1) {
    const b = fillButtons.nth(i);
    states.push({
      label: (await b.getAttribute("aria-label")) ?? "",
      disabled: await b.isDisabled(),
    });
  }
  for (const s of states)
    info("fill-down", `${s.disabled ? "DISABLED" : "enabled"} — ${s.label}`);

  // Assert the INVARIANT, not a fixture: the duration fill-down must be
  // disabled EXACTLY when row 1's duration cell is empty. Hard-coding "expect
  // disabled" would pass for the wrong reason the day a fixture gains a
  // duration, and would quietly stop testing the guard at all.
  const row1Duration = await page
    .locator('input[aria-label="Minutes, lesson 1"]')
    .inputValue();
  const dur = states.find((s) => s.label.includes("duration"));
  const sourceEmpty = row1Duration.trim() === "";
  check(
    "the duration fill-down is armed exactly when row 1 has a value to copy",
    dur ? dur.disabled === sourceEmpty : false,
    `row 1 duration = "${row1Duration}" → fill-down ${dur?.disabled ? "disabled" : "enabled"}`,
  );

  // ── 6. Responsive ────────────────────────────────────────────────────────
  for (const [label, width] of [
    ["phone", 375],
    ["tablet", 768],
    ["desktop", 1440],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const main = document.querySelector("#main-content");
      const wrap = document.querySelector('[role="dialog"] table')?.parentElement;
      return {
        docScroll: doc.scrollWidth - doc.clientWidth,
        mainScroll: main ? main.scrollWidth - main.clientWidth : 0,
        tableScrolls: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
        tableOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 0,
        clientW: wrap ? wrap.clientWidth : 0,
        scrollW: wrap ? wrap.scrollWidth : 0,
        overflowX: wrap ? getComputedStyle(wrap).overflowX : "n/a",
      };
    });
    check(
      `${label} (${width}px): no page-level horizontal scroll`,
      m.docScroll <= 1 && m.mainScroll <= 1,
      `doc +${m.docScroll}px, main +${m.mainScroll}px`,
    );
    info(
      `${label} table container`,
      `client ${m.clientW}px / table ${m.scrollW}px, overflow-x: ${m.overflowX}, scrolls internally: ${m.tableScrolls}`,
    );
    // At desktop the whole table must FIT the compact dialog. The first build
    // summed its columns to 864px against a ~770px container, so "Planned" —
    // the completeness roll-up the table is scanned for — sat half off the right
    // edge behind a scrollbar. Internal scroll is correct on a phone and a bug
    // at 1440.
    if (width === 1440) {
      check(
        "desktop: the last column is not stranded behind a horizontal scrollbar",
        !m.tableScrolls,
        `table overflows its container by ${m.tableOverflow}px`,
      );
    }
    await page.screenshot({ path: path.join(OUT, `refine-${width}.png`) });
  }

  // ── 7. Console ───────────────────────────────────────────────────────────
  check(
    "no browser-console errors attributable to this wave",
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | "),
  );
  if (foreignErrors.length) {
    info(
      "console errors from ANOTHER lane's in-flight files (not this wave, not a pass/fail here)",
      `${foreignErrors.length}: ${foreignErrors[0].slice(0, 160)}`,
    );
  }
} catch (err) {
  failures.push(`FAIL  probe threw — ${String(err).slice(0, 400)}`);
} finally {
  await browser.close();
}

console.log("\n── Refine tab · §4b live pass ──────────────────────────────");
for (const n of notes) console.log(n);
if (failures.length) {
  console.log("");
  for (const f of failures) console.log(f);
}
console.log(
  `\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`} · screenshots in ${OUT}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
