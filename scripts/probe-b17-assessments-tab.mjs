// probe-b17-assessments-tab.mjs — live QA (§4b) for task #45: the unit
// workspace's Assessments tab.
//
// WHAT IT PROVES, AND WHAT IT CANNOT.
//
// WHICH FIXTURE THIS IS. Measured, not assumed: the unit this probe opens
// ("Place Value & Decimals") reports SIX lessons, and zero of them carry an
// assessment. So the standing "localhost has no lessons" caveat does NOT apply
// on /year — but the assessment data genuinely is empty, which means every
// populated-row path (a kind group, an expanded editor, a kind change) is
// UNEXERCISED here. An empty roll-up in these screenshots is the fixture, not a
// defect; equally, a green run says nothing about a row that does not exist.
// This probe therefore claims only what the fixture can support:
//   • the tab EXISTS in the strip, in the handoff's position;
//   • clicking it renders the panel's own headings (both halves), at all three
//     widths, with no document-level horizontal scroll;
//   • the drawer no longer offers an Assessments pane;
//   • no console errors / page errors during the whole run.
// It does NOT claim anything about populated rows — a lesson-level assertion
// against an empty fixture would be a green that was never earned.
//
// Usage: PROBE_BASE=http://localhost:3014 node scripts/probe-b17-assessments-tab.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/b17-assessments-tab");
await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
function check(label, cond, detail = "") {
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
}
function info(label, detail = "") {
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, finished: true }),
    );
    // Force the drawer OPEN so its pane strip is observable — the whole point
    // of one assertion below is that "Assessments" is no longer in it, and a
    // closed drawer would make that absence unfalsifiable.
    window.localStorage.setItem("mycurricula:user:workspace-drawer-open", "1");
    // …carrying the RETIRED pane key, which is what a real device that used the
    // drawer before this change has stored. The fallback is the thing under
    // test, not a hypothetical.
    window.localStorage.setItem(
      "mycurricula:user:workspace-drawer-pane",
      "assessments",
    );
  } catch {
    /* private mode — the assertions surface the consequence */
  }
});
await bypassLogin(context, { base: BASE, next: "/year", timeout: 240000 });

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

await page.goto(`${BASE}/year`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
check("stayed on /year", !page.url().includes("/onboarding"), page.url());

// ── Open the workspace ──────────────────────────────────────────────────────
//
// READINESS BY RESPONSE. A unit chip's markup is server-rendered long before
// React attaches its onClick, so a single click can land on a live element and
// do nothing. Retry until the dialog actually appears; the loop IS the
// hydration signal.
const DIALOG = '[role="dialog"]';
let opened = false;
for (let i = 0; i < 40 && !opened; i++) {
  // UnitChip's own accessible name (components/unit-chip/UnitChip.tsx:89).
  const chip = page
    .locator('[aria-label*="unit workspace"], [class*="unitBand"], [class*="chip"]')
    .first();
  if (await chip.count()) {
    await chip.click({ timeout: 2000 }).catch(() => {});
  }
  opened = await page
    .locator(DIALOG)
    .first()
    .isVisible()
    .catch(() => false);
  if (!opened) await page.waitForTimeout(500);
}
check("the unit workspace opened", opened, page.url());
if (!opened) {
  await page.screenshot({ path: path.join(OUT, "00-no-workspace.png") });
  info(
    "no unit chip was clickable",
    "localhost may have no units in the catalog — see the header note",
  );
}

if (opened) {
  const tablist = page.locator(`${DIALOG} [role="tablist"]`).first();
  const tabs = tablist.locator('[role="tab"]');
  const labels = (await tabs.allInnerTexts()).map((t) => t.trim());
  info("tab strip", labels.join(" · "));

  check(
    "an Assessments tab exists",
    labels.includes("Assessments"),
    labels.join(" · "),
  );
  check(
    "it sits between Standards and Resources (handoff :8651)",
    labels.indexOf("Assessments") === labels.indexOf("Standards") + 1 &&
      labels.indexOf("Assessments") === labels.indexOf("Resources") - 1,
    labels.join(" · "),
  );

  // ── The drawer no longer offers an Assessments pane ───────────────────────
  //
  // ABSENCE ASSERTION — paired with a positive control in the SAME read. If the
  // pane strip failed to render at all, "no Assessments" would be trivially and
  // wrongly true; requiring Insights AND Prep to be present is what makes the
  // absence mean something.
  const paneStrip = page.locator(`${DIALOG} [class*="paneStrip"], ${DIALOG} [role="tablist"]`);
  const allStripText = (await paneStrip.allInnerTexts()).join(" | ");
  const drawerPanes = await page
    .locator(`${DIALOG} [role="tab"]`)
    .allInnerTexts();
  const drawerLabels = drawerPanes.map((t) => t.trim());
  check(
    "the drawer still shows Insights and Prep (positive control)",
    drawerLabels.includes("Insights") && drawerLabels.includes("Prep"),
    drawerLabels.join(" · "),
  );
  check(
    "the drawer's Assessments PANE is gone (only the TAB names it)",
    drawerLabels.filter((t) => t === "Assessments").length === 1,
    `Assessments appears ${drawerLabels.filter((t) => t === "Assessments").length}× across both strips`,
  );

  // ── Open the tab and look at it, at three widths ──────────────────────────
  const assessTab = tabs.filter({ hasText: "Assessments" }).first();
  if (await assessTab.count()) {
    await assessTab.click();
    await page.waitForTimeout(400);

    for (const [w, h, name] of [
      [1440, 950, "desktop-1440"],
      [768, 1024, "tablet-768"],
      [375, 812, "phone-375"],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);

      const panel = page.locator('[data-ap-layout="tab"]').first();
      const present = await panel.isVisible().catch(() => false);
      check(`${name}: the tab body is the panel`, present);

      if (present) {
        const heads = await panel.locator("h3").allInnerTexts();
        check(
          `${name}: both halves render`,
          heads.some((t) => /Unit assessments/i.test(t)) &&
            heads.some((t) => /Lesson assessments/i.test(t)),
          heads.join(" · "),
        );
        const box = await panel.boundingBox();
        info(`${name}: panel box`, box ? `${Math.round(box.width)}px wide` : "none");
        const cols = await panel.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns,
        );
        info(`${name}: grid-template-columns`, cols);
      }

      // Document-level horizontal scroll (BUILD_STANDARD §9). `scrollWidth` is
      // blind to a bar clipped by `overflow-x: clip`, so read the scrolling
      // element the shell actually uses too (memory: the document never
      // scrolls here; #main-content does).
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const main = document.querySelector("#main-content");
        return {
          doc: de.scrollWidth - de.clientWidth,
          main: main ? main.scrollWidth - main.clientWidth : null,
        };
      });
      check(
        `${name}: no document-level horizontal scroll`,
        overflow.doc <= 1,
        `document overflow ${overflow.doc}px, #main-content ${overflow.main}px`,
      );

      await page.screenshot({
        path: path.join(OUT, `${name}-assessments-tab.png`),
        fullPage: false,
      });
    }

    // ── Checks INHERITED from probe-toggle-drawer.mjs ─────────────────────
    //
    // That probe asserted M4 ("both halves carry a scope badge") and L4
    // ("badges are keyboard-reachable and carry a role") against
    // `#ue-drawer-panel [role="note"]`, plus L5 ("Assessments nests h4 groups
    // under h3 halves"). All three were about THIS panel, which has moved out
    // of the drawer — so they move here rather than being deleted. Same
    // assertions, re-pointed at the tab.
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.waitForTimeout(400);
    const panelRoot = page.locator('[data-ap-layout="tab"]').first();
    const badges = await panelRoot.evaluate((root) =>
      [...root.querySelectorAll('[role="note"]')].map((b) => ({
        text: (b.textContent || "").trim(),
        tabbable: b.tabIndex === 0,
      })),
    );
    check(
      "M4 both halves carry a scope badge",
      badges.length >= 2,
      badges.map((b) => `"${b.text}"`).join(" + ") || "none found",
    );
    check(
      "L4 badges are keyboard-reachable and carry a role",
      badges.length > 0 && badges.every((b) => b.tabbable),
      JSON.stringify(badges),
    );
    const tiers = await panelRoot.evaluate((root) =>
      [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => h.tagName),
    );
    // HONEST SCOPE: the h4 kind groups only render once the unit HAS lesson
    // assessments, and this fixture has none — so the nesting half of the
    // original assertion is vacuous here and the detail says so rather than
    // letting "H3,H3" read as proof of a hierarchy that was never exercised.
    check(
      "L5 the panel opens at h3, and no heading skips a tier",
      tiers[0] === "H3" && tiers.every((t) => t === "H3" || t === "H4"),
      `${tiers.join(",")}${tiers.includes("H4") ? "" : " (no h4 groups — fixture has no lesson assessments)"}`,
    );

    // ── The tab is REACHABLE on a phone, not just selected ────────────────
    //
    // Every width above was measured with the tab ALREADY active (clicked at
    // 1440, then resized) — which says nothing about whether a phone teacher
    // can get to it. The strip scrolls horizontally at 375 and "Assessments"
    // sits past the fold, so this switches away and back by real clicks.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    const firstTab = tabs.first();
    await firstTab.scrollIntoViewIfNeeded().catch(() => {});
    await firstTab.click().catch(() => {});
    await page.waitForTimeout(300);
    const leftIt = !(await page
      .locator('[data-ap-layout="tab"]')
      .first()
      .isVisible()
      .catch(() => false));
    check("phone-375: switching away really left the tab (control)", leftIt);

    await assessTab.scrollIntoViewIfNeeded().catch(() => {});
    const tapBox = await assessTab.boundingBox();
    info(
      "phone-375: Assessments tab hit box",
      tapBox ? `${Math.round(tapBox.width)}×${Math.round(tapBox.height)}` : "none",
    );
    await assessTab.click().catch(() => {});
    await page.waitForTimeout(400);
    check(
      "phone-375: a teacher can reach the tab by scrolling the strip",
      await page
        .locator('[data-ap-layout="tab"]')
        .first()
        .isVisible()
        .catch(() => false),
    );
    check(
      "phone-375: the tab's touch target clears 44px tall",
      !!tapBox && tapBox.height >= 44,
      tapBox ? `${Math.round(tapBox.height)}px` : "no box",
    );
    await page.screenshot({
      path: path.join(OUT, "phone-375-tab-reached.png"),
    });

    // ── The two-column path, exercised ────────────────────────────────────
    //
    // Every measurement above came back ONE column, because the workspace's
    // default presentation is the compact modal (~460–680px) — so on its own
    // the run says nothing about the split, and a broken `auto-fit` rule would
    // have passed silently. Expand to the full workspace (the ⤢ toggle's
    // state, persisted in workspace-prefs) and measure again. Two tracks, each
    // wide enough for the 273px kind tray, is the claim.
    await page.setViewportSize({ width: 1440, height: 950 });
    const expand = page
      .locator(`${DIALOG} button[aria-label*="Expand"], ${DIALOG} button[aria-label*="full"]`)
      .first();
    if (await expand.count()) {
      await expand.click().catch(() => {});
      await page.waitForTimeout(600);
      const panel = page.locator('[data-ap-layout="tab"]').first();
      const cols = await panel
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns)
        .catch(() => "unreadable");
      const tracks = cols
        .split(/\s+/)
        .map((t) => parseFloat(t))
        .filter((n) => !Number.isNaN(n));
      info("full workspace @1440: grid-template-columns", cols);
      check(
        "full workspace @1440 splits into two columns",
        tracks.length === 2,
        cols,
      );
      check(
        "each column clears the 273px kind tray",
        tracks.length > 0 && tracks.every((t) => t >= 380),
        cols,
      );
      await page.screenshot({
        path: path.join(OUT, "desktop-1440-full-workspace.png"),
      });

      // ── The light tone ──────────────────────────────────────────────────
      //
      // The run above is one tone. Every colour the tab layout adds
      // (--surface, --surface-warm, --border) re-declares itself on the
      // `[data-tone="dark"]` path in tokens.css, so the OTHER branch has not
      // been looked at at all. Flipping the root attribute is not how a
      // teacher gets there — it is exactly how the tokens resolve when they
      // do, which is the thing under test. Labelled as a forced flip, not as
      // a theme-picker journey.
      const toneBefore = await page.evaluate(
        () => document.documentElement.getAttribute("data-tone"),
      );
      info("tone measured above", toneBefore ?? "unset");
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-tone", "light");
      });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(OUT, "desktop-1440-full-light-tone.png"),
      });
      await page.evaluate((t) => {
        if (t) document.documentElement.setAttribute("data-tone", t);
      }, toneBefore);
    } else {
      info("no ⤢ expand toggle on this entry point", "two-column path unmeasured");
    }
  } else {
    await page.screenshot({ path: path.join(OUT, "01-no-tab.png") });
  }
}

check("no console / page errors", consoleErrors.length === 0, consoleErrors.join(" | "));

await browser.close();

console.log("\n".concat(notes.join("\n")));
if (failures.length) {
  console.log("\n" + failures.join("\n"));
  console.log(`\n${failures.length} FAILURE(S)`);
  process.exitCode = 1;
} else {
  console.log("\nALL CHECKS PASSED");
}
console.log(`screenshots → ${OUT}`);
