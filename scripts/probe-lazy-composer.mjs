// scripts/probe-lazy-composer.mjs — §4b for the composer/ResMenu lazy-boundary
// fix (task #53).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT.
//
// The fix moved two shared helpers into leaf modules so `ResourceComposer` and
// `ResMenu` stop being statically reachable from /weekly. A static import-graph
// walk already proves the reachability change (tests/bundle-lazy-boundaries.
// test.ts). This probe answers the OTHER question, the one a graph walk cannot:
// does the feature still WORK once it is genuinely lazy? A lazy boundary that
// breaks the dialog is not a win.
//
// It checks three things, in this order:
//   GATE A (control) — /weekly really hydrated and a lesson card is really
//     interactive. Every assertion after this is an "it opened" claim, and an
//     un-hydrated page would make them all fail for the WRONG reason. Without
//     this control a broken probe and a broken feature look identical.
//   PART 1 — the composer OPENS from the resources panel, renders its dialog,
//     and closes. This is the load-bearing check.
//   PART 2 — opening it pulls at least one JS chunk that was NOT in the initial
//     document load. That is the runtime signature of a real lazy boundary: if
//     the module still shipped eagerly, the click would need no new script.
//
// NOTE ON DEV MODE: `next dev` chunks per-module and does not tree-shake, so
// PART 2's chunk-count evidence is weaker here than against a production build.
// It can show that a NEW chunk arrives on open (positive evidence); it cannot
// be used to claim a byte total. Do not quote sizes from this probe.
//
// Usage: node scripts/probe-lazy-composer.mjs
//        PROBE_BASE defaults to http://localhost:3014

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bypassLoginOnPage, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/lazy-composer");
await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
const consoleErrors = [];

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

// Every script the page fetches, in order, so we can split "arrived with the
// document" from "arrived because the teacher clicked".
const scripts = [];
page.on("response", (r) => {
  const u = r.url();
  if (/\.js(\?|$)/.test(u) && u.includes("/_next/")) scripts.push(u);
});

try {
  await bypassLoginOnPage(page, { base: BASE, next: "/weekly", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});

  // ── GATE A — control ──────────────────────────────────────────────────────
  const card = page.locator('[class*="card"]').filter({ hasText: "Place Value" }).first();
  const lessonBtn = page.getByRole("button", { name: /Place Value .* Week 1 lesson/ }).first();
  let hydrated = false;
  try {
    await lessonBtn.waitFor({ state: "visible", timeout: 60000 });
    hydrated = true;
  } catch {
    hydrated = false;
  }
  if (!hydrated) {
    failures.push(
      "GATE A FAILED: no interactive lesson card on /weekly after 60s. " +
        "The page did not hydrate (or has no lessons), so NOTHING below this " +
        "line is evidence about the composer. Fix the environment, re-run.",
    );
    throw new Error("gate-a");
  }
  notes.push("GATE A passed — /weekly hydrated, lesson card interactive.");
  await page.screenshot({ path: path.join(OUT, "01-weekly-hydrated.png") });

  const initialScriptCount = scripts.length;
  const initialSet = new Set(scripts);

  // ── PART 1 — open the composer ────────────────────────────────────────────
  // Click the lesson to open the resources panel, then its add-resource action.
  // /weekly no longer has a right panel (task #47 landed inline expansion in
  // this working tree), so the add-resource affordance lives in the EXPANDED
  // lesson card's footer. Expand first, then look for it.
  const expandAll = page.getByRole("button", { name: /Expand all \d+ lessons/i }).first();
  if ((await expandAll.count()) > 0) {
    await expandAll.click();
    notes.push("Expanded all lessons via the expand-all control.");
  } else {
    await lessonBtn.click();
    notes.push("No expand-all control; clicked the lesson card directly.");
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "02-lesson-open.png") });
  {
    const post = await page
      .locator("button")
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
          .filter((s) => /add|resource|note|attach|\+/i.test(s))
          .slice(0, 30),
      );
    notes.push("Post-expand add-ish buttons: " + JSON.stringify(post));
  }

  // The composer is reached from the resources panel's add affordance. Try the
  // known labels in order; record which one worked so the probe is auditable.
  // Exact accessible names, read out of the source rather than guessed:
  //   ResourcesPanel.tsx:1878   iconAriaLabel="Add resources to this lesson"
  //   weekly-lesson-card.tsx    aria-label="Add a resource to this lesson"
  const addCandidates = [
    page.getByRole("button", { name: "Add a resource to this lesson" }),
    page.getByRole("button", { name: "Add resources to this lesson" }),
    page.getByRole("button", { name: /Add (a )?resources? to this lesson/i }),
  ];
  let opened = false;
  let usedLabel = "";
  const tryOpen = async (cands, where) => {
    for (const [i, cand] of cands.entries()) {
      const el = cand.first();
      if ((await el.count()) === 0) continue;
      try {
        await el.click({ timeout: 5000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(2500);
      const dlg = page.locator('[role="dialog"]');
      if ((await dlg.count()) > 0 && (await dlg.first().isVisible())) {
        usedLabel = `${where} candidate #${i}`;
        return true;
      }
    }
    return false;
  };

  opened = await tryOpen(addCandidates, "/weekly");

  // /weekly's add affordance is moving under task #47. Fall back to /daily,
  // whose planning tabs open the SAME shared composer (PlanningTabs.tsx:334) —
  // the boundary under test is the composer module, not the surface that opens
  // it, so either route is valid evidence.
  if (!opened) {
    notes.push("/weekly add affordance not reachable; falling back to /daily.");
    await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(6000);
    const firstLesson = page.getByRole("button", { name: /Week \d+ lesson/ }).first();
    if ((await firstLesson.count()) > 0) {
      await firstLesson.click().catch(() => {});
      await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: path.join(OUT, "04-daily.png") });
    opened = await tryOpen(
      [
        page.getByRole("button", { name: "Add resources to this lesson" }),
        page.getByRole("button", { name: "Add a resource to this lesson" }),
        page.getByRole("button", { name: /Add (a )?resources? to this lesson/i }),
      ],
      "/daily",
    );
  }

  if (opened) {
    notes.push(`PART 1 passed — composer dialog opened (${usedLabel}).`);
    await page.screenshot({ path: path.join(OUT, "03-composer-open.png") });
    // It must also close cleanly — a dialog that traps focus is a regression.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const stillOpen =
      (await page.locator('[role="dialog"]').count()) > 0 &&
      (await page.locator('[role="dialog"]').first().isVisible());
    if (stillOpen) failures.push("PART 1: composer did not close on Escape.");
    else notes.push("PART 1 passed — composer closed on Escape.");
  } else {
    // Dump what IS on the page. A probe that says only "not found" cannot be
    // told apart from a probe that looked in the wrong place.
    const labels = await page
      .locator("button")
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
          .filter(Boolean)
          .slice(0, 60),
      );
    failures.push(
      "PART 1 INCONCLUSIVE: could not reach the composer's add affordance. " +
        "This is NOT evidence the composer is broken — it may be an " +
        "affordance-location change (task #47 is removing /weekly's right " +
        "panel concurrently). Buttons actually present: " +
        JSON.stringify(labels),
    );
    await page.screenshot({ path: path.join(OUT, "03-composer-NOT-opened.png") });
  }

  // ── PART 2 — did opening it fetch new script? ─────────────────────────────
  const newScripts = scripts.filter((u) => !initialSet.has(u));
  notes.push(
    `PART 2 — scripts with document: ${initialScriptCount}; new after open: ${newScripts.length}`,
  );
  if (opened && newScripts.length === 0) {
    failures.push(
      "PART 2: opening the composer fetched NO new chunk. Under `next dev` " +
        "this can be a false alarm (chunks may already be warm from a prior " +
        "route), but against a production build it would mean the module " +
        "still ships eagerly. Re-check on a real build before trusting it.",
    );
  } else if (opened) {
    notes.push(
      "PART 2 passed — new chunk(s) arrived on open: " +
        newScripts.slice(0, 6).map((u) => u.split("/").pop()).join(", "),
    );
  }
} catch (e) {
  if (String(e.message) !== "gate-a") failures.push(`THREW: ${String(e).slice(0, 400)}`);
} finally {
  const report = {
    base: BASE,
    when: new Date().toISOString(),
    notes,
    failures,
    consoleErrors: consoleErrors.slice(0, 25),
  };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== NOTES ===");
  for (const n of notes) console.log("  " + n);
  console.log("\n=== CONSOLE ERRORS ===", consoleErrors.length);
  for (const c of consoleErrors.slice(0, 15)) console.log("  " + c);
  console.log("\n=== FAILURES ===", failures.length);
  for (const f of failures) console.log("  " + f);
  await browser.close();
  process.exit(failures.length ? 1 : 0);
}
