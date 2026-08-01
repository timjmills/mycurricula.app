// probe-catchup-reschedule-anchor.mjs — live QA (CLAUDE.md §4b) for task #55's
// Catch-Up half: the row's Reschedule action must place a lesson relative to
// TODAY, never relative to the week the teacher is browsing.
//
// The deterministic proof of the arithmetic lives in
// tests/catchup-modal-clock-anchor.test.ts (3 red / 4 green against the defect,
// with the exact destinations printed). This probe covers what a mounted unit
// test cannot: that the real surface, in a real browser, still offers the action
// at all — and that the new "we cannot say where now is" arm produces a legible
// disabled control rather than a dead button or a crash.
//
// WHAT IT ASSERTS
//   A. IN-RANGE ARM — with today inside the configured academic year, every
//      Reschedule pill is present and ENABLED. This is the regression the fix
//      could plausibly cause: gating the action on the clock could disable it
//      for everyone. Paired with a count of the sibling "Mark taught" pills, so
//      "all enabled" cannot be satisfied by a page that rendered no pills.
//   B. OUT-OF-RANGE ARM — with an academic year that starts in the future
//      (`currentWeekBasis === "before-start"`, live today for an August-start
//      school), every Reschedule pill is disabled AND carries the explanation.
//      Its positive control is arm A in the same run: the SAME selector found
//      enabled pills a moment ago, so "disabled" is a state the instrument can
//      distinguish rather than a selector that stopped matching.
//   C. No console errors on either arm.
//
// The two arms differ ONLY in the academic-year window written to localStorage.
// Both windows are derived from the clock, never hard-coded, so the probe keeps
// its teeth on any day it is run.
//
// Traps this is built against:
//   • Hydration here has ranged 10s–130s; the gate polls a `__reactFiber$` key
//     on a live node and then waits for the readout to repeat, never a sleep.
//   • Absence assertions fail open — each arm names its positive control above.
//   • channel: "chrome", never the system-default Edge.
//
// Run: node scripts/probe-catchup-reschedule-anchor.mjs   (dev server on 3014)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/catchup-reschedule-anchor";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (m) => console.log(`      · ${m}`);

// A FOUR-day school week — deliberately not five (CLAUDE.md §6). Nothing this
// probe measures may depend on the weekday set.
const SCHOOL_WEEK = ["mon", "tue", "wed", "thu"];

// The week both arms browse to before opening the modal. Well ahead of either
// arm's clock, so the modal's browsed-week horizon holds plenty of uncovered
// rows in BOTH — which is what makes the two arms comparable at all.
const BROWSED_WEEK = 20;

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

/** The two arms, both clock-relative. */
const ARMS = [
  {
    tag: "in-range",
    // Today sits 11 whole weeks into the year ⇒ week 12, basis "in-range".
    start: iso(shift(-11 * 7)),
    end: iso(shift(300)),
    expectDisabled: false,
  },
  {
    tag: "before-start",
    // The year has not begun. `currentWeek` becomes a CLAMP to week 1, which is
    // not where now is — so there is no "next week" to reschedule into.
    start: iso(shift(60)),
    end: iso(shift(400)),
    expectDisabled: true,
  },
];

const consoleLog = [];

async function runArm(browser, arm) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  ctx.setDefaultNavigationTimeout(240000);
  await ctx.addInitScript(
    ({ days, start, end }) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:team:academic-year-start", start);
      localStorage.setItem("mycurricula:team:academic-year-end", end);
      localStorage.setItem(
        "mycurricula:team:school-week-days",
        JSON.stringify(days),
      );
    },
    { days: SCHOOL_WEEK, start: arm.start, end: arm.end },
  );
  // Never write the shared production preferences row from a probe.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 3,
    timeout: 240000,
  });

  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error")
      consoleLog.push({ arm: arm.tag, text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ arm: arm.tag, text: `pageerror: ${String(e).slice(0, 300)}` }),
  );

  // Both arms open the modal by the SAME path, and neither by loading
  // /catch-up directly. Two reasons, and the second cost a run:
  //   • It is the real one — the modal is global chrome, opened from the Tools
  //     popover on whatever surface the teacher is on.
  //   • The modal's row list is horizoned by the BROWSED week. On a cold load
  //     that seeds from `currentWeek`, which the before-start arm clamps to
  //     week 1 — where nothing is uncovered, so the modal renders no rows and
  //     every assertion about the pills becomes vacuous. Browsing to a later
  //     week first is what puts rows on the surface in both arms.
  await page.goto(`${BASE}/weekly?week=${BROWSED_WEEK}`, {
    waitUntil: "domcontentloaded",
  });

  const t0 = Date.now();
  let attached = false;
  for (let i = 0; i < 300; i += 1) {
    attached = await page
      .evaluate(() =>
        [...document.querySelectorAll("button, main, header")].some((el) =>
          Object.keys(el).some((k) => k.startsWith("__reactFiber$")),
        ),
      )
      .catch(() => false);
    if (attached) break;
    await page.waitForTimeout(1000);
  }
  note(`${arm.tag}: React attached after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Open the modal through the Tools popover, polling because a click can land
  // before React has bound its handler. The loop exits on a signal that has
  // been SEEN TO MOVE — the dialog appearing — never on a fixed wait.
  for (let i = 0; i < 60; i += 1) {
    if (await page.locator('[role="dialog"]').count()) break;
    await page
      .locator('button[aria-label="Tools"]')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(300);
    await page
      .getByText("Catch-up", { exact: true })
      .last()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  if (!(await page.locator('[role="dialog"]').count())) {
    ok(`${arm.tag} — the Catch-Up modal opened from the Tools menu`, false, "no dialog");
    await ctx.close();
    return null;
  }

  /** Read every action pill's label + disabled state from the open modal. */
  const read = () =>
    page.evaluate(() => {
      const pills = [
        ...document.querySelectorAll('[role="dialog"] button[aria-label]'),
      ]
        .map((el) => ({
          label: (el.getAttribute("aria-label") || "").split(":")[0],
          // aria-disabled, not the `disabled` attribute: the control stays
          // focusable so keyboard users can reach its explanation.
          disabled: el.getAttribute("aria-disabled") === "true",
        }))
        .filter((p) => ["Reschedule", "Mark taught", "Bump"].includes(p.label));
      return {
        reschedule: pills.filter((p) => p.label === "Reschedule"),
        taught: pills.filter((p) => p.label === "Mark taught"),
        // The reason rides the accessible NAME, so it is in the DOM without
        // any hover — readable the same way a screen reader would get it.
        explains: [
          ...document.querySelectorAll(
            '[role="dialog"] button[aria-label^="Reschedule"]',
          ),
        ].some((el) =>
          (el.getAttribute("aria-label") || "").includes(
            "outside this curriculum’s academic year",
          ),
        ),
      };
    });

  // Settle: the modal's rows come from planner data that lands after the first
  // paint, so poll until the readout repeats rather than sampling once.
  let prev = null;
  let out = null;
  for (let i = 0; i < 90; i += 1) {
    const now = JSON.stringify(await read().catch(() => null));
    if (prev !== null && now === prev) {
      out = JSON.parse(now);
      break;
    }
    prev = now;
    await page.waitForTimeout(1000);
  }
  if (out === null) out = prev === null ? null : JSON.parse(prev);

  // Hover anyway before the screenshot, so the evidence shows the bubble a
  // sighted teacher meets — the ASSERTION reads the accessible name, which does
  // not depend on this having worked.
  if (arm.expectDisabled && out?.reschedule.length) {
    await page
      .locator('[role="dialog"] button[aria-label^="Reschedule"]')
      .first()
      .hover({ force: true })
      .catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${SHOTS}/${arm.tag}.png` }).catch(() => {});

  note(
    `${arm.tag}: ${out?.reschedule.length ?? "?"} Reschedule pills ` +
      `(${out?.reschedule.filter((p) => p.disabled).length ?? "?"} disabled), ` +
      `${out?.taught.length ?? "?"} Mark-taught pills ` +
      `(${out?.taught.filter((p) => p.disabled).length ?? "?"} disabled)`,
  );

  await ctx.close();
  return out;
}

async function main() {
  console.log(
    `\n══ Catch-Up Reschedule — clock-anchored, both arms ══\n` +
      `      · school week ${SCHOOL_WEEK.join(",")} (4 days — deliberately not 5)`,
  );
  const browser = await chromium.launch({ channel: "chrome" });

  const inRange = await runArm(browser, ARMS[0]);
  const before = await runArm(browser, ARMS[1]);

  await browser.close();

  // ── A. in-range: the action is offered, and offered LIVE ─────────────────
  const aRows = inRange?.reschedule.length ?? 0;
  ok(
    "A — in-range: Reschedule pills exist (instrument found the surface)",
    aRows > 0 && (inRange?.taught.length ?? 0) === aRows,
    `${aRows} Reschedule · ${inRange?.taught.length ?? "?"} Mark taught`,
  );
  ok(
    "A — in-range: every Reschedule pill is ENABLED (the fix did not disable the normal case)",
    aRows > 0 && inRange.reschedule.every((p) => !p.disabled),
    `${inRange?.reschedule.filter((p) => p.disabled).length ?? "?"} disabled of ${aRows}`,
  );

  // ── B. before-start: it refuses, visibly and legibly ─────────────────────
  // The positive control is arm A above: the SAME selector, in the same run,
  // found pills that were NOT disabled — so a disabled reading here is a state
  // change, not a selector that quietly stopped matching.
  const bRows = before?.reschedule.length ?? 0;
  ok(
    "B — before-start: Reschedule pills still render (not silently removed)",
    bRows > 0,
    `${bRows} pills`,
  );
  ok(
    "B — before-start: every Reschedule pill is DISABLED",
    bRows > 0 && before.reschedule.every((p) => p.disabled),
    `${before?.reschedule.filter((p) => p.disabled).length ?? "?"} disabled of ${bRows}`,
  );
  ok(
    "B — before-start: sibling actions stay live (only the clock-dependent one refuses)",
    (before?.taught.length ?? 0) > 0 &&
      before.taught.every((p) => !p.disabled),
    `${before?.taught.filter((p) => p.disabled).length ?? "?"} of ${before?.taught.length ?? "?"} Mark-taught disabled`,
  );
  ok(
    "B — before-start: the disabled control explains WHY (CLAUDE.md §4)",
    Boolean(before?.explains),
    before?.explains ? "explanation present on hover" : "no explanation found",
  );

  // ── C. console ───────────────────────────────────────────────────────────
  ok(
    "C — no console errors on either arm",
    consoleLog.length === 0,
    consoleLog.length ? consoleLog.map((c) => `[${c.arm}] ${c.text}`).join(" | ") : "clean",
  );

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (results.length === 0) {
    console.log("FAILED — the probe made no assertions");
    process.exitCode = 1;
  } else if (passed !== results.length) {
    console.log("FAILED");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("FAILED —", e);
  process.exitCode = 1;
});
