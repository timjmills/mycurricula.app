// probe-catchup-late-chips.mjs — live verification for the Catch-Up lane:
//
//   A. Scope chips clear the ≥44px touch contract AND are actually hit-testable
//      at their own centre and edge midpoints (a box that measures 44px but is
//      covered by a neighbour is not a touch target).
//   B. `daysLate` is anchored to TODAY, not to the week the teacher is browsing:
//      paging the planner back three weeks must not change a single lateness
//      number. Under the previous arithmetic every number moved by 3 × the
//      school-week length.
//
// REPORT-ONLY — the only state it writes is localStorage inside its own browser
// context (academic year + school week), so the run is deterministic:
//   • academic year 2026-06-01 … 2027-05-31 → today is IN RANGE, so
//     `currentWeekBasis === "in-range"` and a lateness anchor exists at all.
//   • school week Mon…Sat (6 days), chosen so that on most days today is NOT
//     the last day of the week. That matters: with today ON the last school day
//     the old end-of-week arithmetic and the new today-anchored one AGREE, and
//     the probe would pass either way. Today's column is derived from the clock
//     (never hard-coded), so be aware of the two edge days: on a SATURDAY the
//     oracle still runs but loses its power to discriminate old from new, and
//     on a SUNDAY today is outside the configured week entirely and the probe
//     switches to asserting the null arm — every row's lateness must be blank.
//
// Traps this is built against:
//   • Dev hydration here has measured 60s+ under load, so every wait polls for a
//     control that has been SEEN TO MOVE (a chip whose aria-pressed flips)
//     rather than sleeping.
//   • Absence assertions fail open — each is printed next to a positive control.
//   • Emulating a phone needs isMobile + hasTouch + deviceScaleFactor together;
//     any one alone is a desktop wearing a small viewport.
//   • channel: "chrome" — never the system-default Edge.
//
// Run: node scripts/probe-catchup-late-chips.mjs   (dev server already on 3014)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/catchup-late-chips";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (m) => console.log(`      · ${m}`);

const consoleLog = [];
const attach = (page, tag) => {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      consoleLog.push({ tag, type: t, text: m.text().slice(0, 400) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ tag, type: "pageerror", text: String(e).slice(0, 400) }),
  );
};

const SCHOOL_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat"];

const makeCtx = async (browser, { width, height = 900, phone = false }) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(phone
      ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { deviceScaleFactor: 1 }),
  });
  ctx.setDefaultNavigationTimeout(180000);
  await ctx.addInitScript((days) => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:team:academic-year-start", "2026-06-01");
    localStorage.setItem("mycurricula:team:academic-year-end", "2027-05-31");
    localStorage.setItem("mycurricula:team:school-week-days", JSON.stringify(days));
  }, SCHOOL_WEEK);
  await ctx.route("**/rest/v1/teacher_preferences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await bypassLogin(ctx, { base: BASE, next: "/weekly", retries: 3, timeout: 180000 });
  return ctx;
};

/** Wait for the modal to be REALLY interactive: a scope chip whose aria-pressed
 *  flips under a real click. A rendered dialog proves SSR/paint, not hydration —
 *  and every measurement below is worthless before hydration. */
async function waitInteractive(page, label) {
  const t0 = Date.now();
  await page.waitForSelector('[role="dialog"]', { timeout: 240000 });
  const chips = page.locator('[role="dialog"] button[aria-pressed]');
  await chips.first().waitFor({ timeout: 240000 });
  // "This week" is chip index 2; clicking it must flip aria-pressed off the
  // default "Everything". Poll because the click can land pre-hydration.
  for (let i = 0; i < 120; i += 1) {
    await chips.nth(2).click({ force: true }).catch(() => {});
    if ((await chips.nth(2).getAttribute("aria-pressed")) === "true") {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      note(`${label}: modal interactive after ${secs}s (chip aria-pressed flipped)`);
      await chips.nth(0).click({ force: true }); // back to "Everything"
      return true;
    }
    await page.waitForTimeout(1000);
  }
  ok(`${label} — modal reached an interactive state`, false, "chip never flipped");
  return false;
}

// ── A. chip touch targets ───────────────────────────────────────────────────
async function sectionA(browser) {
  console.log("\n══ A · scope-chip touch targets ══");
  for (const { width, phone } of [
    { width: 375, phone: true },
    { width: 768, phone: true },
    { width: 1440, phone: false }, // desktop control — the compact tier
  ]) {
    const tag = `${width}${phone ? " phone" : " desktop"}`;
    const ctx = await makeCtx(browser, { width, phone });
    const page = await ctx.newPage();
    attach(page, tag);
    await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
    if (!(await waitInteractive(page, `A@${tag}`))) {
      await ctx.close();
      continue;
    }

    // Park the pointer off the chip strip and let any tooltip opened by the
    // hydration probe's own click fade, so the hit-test measures the resting
    // surface rather than the probe's leftovers.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1200);

    // Confirm the emulation is genuine before issuing any touch verdict.
    const env = await page.evaluate(() => ({
      coarse: matchMedia("(any-pointer: coarse)").matches,
      fine: matchMedia("(any-pointer: fine)").matches,
      dpr: devicePixelRatio,
      under900: matchMedia("(max-width: 900px)").matches,
    }));
    note(
      `${tag}: any-pointer coarse=${env.coarse} fine=${env.fine} dpr=${env.dpr} ≤900=${env.under900}`,
    );

    const chipData = await page.evaluate(() => {
      const chips = [
        ...document.querySelectorAll('[role="dialog"] button[aria-pressed]'),
      ];
      return chips.map((el) => {
        const r = el.getBoundingClientRect();
        // Hit-test the OWN box: centre + the midpoint of each edge, inset 3px.
        // A control can measure 44px and still be unreachable because a sibling
        // or an overlay covers it. NOT the box corners: these chips are pills
        // (border-radius 999px), and hit-testing respects the rounded shape, so
        // a corner probe measures the parent by construction and would report a
        // failure that no finger could ever experience.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const pts = [
          ["centre", cx, cy],
          ["top", cx, r.top + 3],
          ["bottom", cx, r.bottom - 3],
          ["left", r.left + 3, cy],
          ["right", r.right - 3, cy],
        ];
        const miss = [];
        for (const [name, x, y] of pts) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || (hit !== el && !el.contains(hit) && hit.closest("button") !== el))
            miss.push(`${name}→${hit ? hit.tagName + "." + (hit.className || "") : "null"}`);
        }
        return {
          label: (el.textContent || "").trim(),
          h: +r.height.toFixed(2),
          w: +r.width.toFixed(2),
          minH: getComputedStyle(el).minHeight,
          display: getComputedStyle(el).display,
          miss,
        };
      });
    });

    const short = chipData.filter((c) => c.h < 44);
    const unreachable = chipData.filter((c) => c.miss.length);
    note(
      `${tag}: ${chipData.length} chips — heights ${chipData.map((c) => c.h).join(", ")}`,
    );
    note(`${tag}: min-height=${chipData[0]?.minH} display=${chipData[0]?.display}`);

    if (phone) {
      ok(
        `A@${tag} — every scope chip ≥44px tall`,
        chipData.length > 0 && short.length === 0,
        short.length ? short.map((c) => `${c.label}=${c.h}`).join(", ") : `n=${chipData.length}`,
      );
      ok(
        `A@${tag} — every scope chip hit-tests to itself (centre + 4 edge midpoints)`,
        chipData.length > 0 && unreachable.length === 0,
        unreachable.length
          ? unreachable.map((c) => `${c.label}: ${c.miss.join(" ")}`).join(" | ")
          : `${chipData.length} chips × 5 points`,
      );
    } else {
      // The desktop control: the compact tier must still be the compact tier,
      // otherwise "≥44px on touch" would be indistinguishable from "44px
      // everywhere" and the media block would not be what moved.
      ok(
        `A@${tag} — desktop control: chips stay compact (<44px), so the touch tier is what changed`,
        chipData.length > 0 && chipData.every((c) => c.h < 44),
        `heights ${chipData.map((c) => c.h).join(", ")}`,
      );
    }
    await page.screenshot({ path: `${SHOTS}/chips-${width}.png` });
    await ctx.close();
  }
}

// ── B. lateness is anchored to today, not to the browsed week ───────────────
/**
 * Read one row per meta line, parsing the CHIP SPANS rather than the row's
 * concatenated text. The first attempt scraped `textContent`, where
 * "Thu · Wk 4" + "31 days late" runs together as "Thu · Wk 431 days late" and
 * both regexes mis-bind — the classic conflation this repo has been bitten by.
 * The lateness chip is the one carrying the `metaLate` class; the day label is
 * the first chip.
 */
const readLateness = (page) =>
  page.evaluate(() => {
    const metas = [...document.querySelectorAll('[role="dialog"] [class*="rowMeta"]')];
    const rows = [];
    for (const meta of metas) {
      const chips = [...meta.querySelectorAll("span")];
      const lateChip = chips.find((s) => /metaLate/.test(s.className));
      const dayChip = chips.find((s) => /· Wk /.test(s.textContent || ""));
      const m = (dayChip?.textContent || "").match(/^(.+?) · Wk (\d+)$/);
      rows.push({
        title:
          meta.parentElement?.querySelector('[class*="rowTitle"]')?.textContent?.trim() ||
          meta.parentElement?.textContent?.trim().slice(0, 50) ||
          "?",
        dayName: m ? m[1].trim() : "?",
        week: m ? Number(m[2]) : null,
        late: lateChip
          ? Number((lateChip.textContent || "").match(/^(\d+) days? late$/)?.[1] ?? NaN)
          : null,
      });
    }
    return rows;
  });

/** key that does NOT encode the lateness — so an unchanged key across two
 *  readings cannot smuggle in "the number happened to match". */
const rowKey = (r) => `${r.title}|${r.dayName}|Wk${r.week}`;

async function sectionB(browser) {
  console.log("\n══ B · lateness anchored to today, not to the browsed week ══");
  const ctx = await makeCtx(browser, { width: 1440, height: 950 });
  const page = await ctx.newPage();
  attach(page, "B");
  // The toggle listener attaches post-mount on the ELECTED host, so a single
  // dispatch can land before hydration and vanish. Dispatch until the CATCH-UP
  // dialog is on screen — identified by its scope chips, not by `[role=dialog]`
  // alone, because the weekly shell has dialogs of its own and waiting on the
  // generic selector once matched one of those and hung the run.
  const open = async () => {
    const chips = page.locator('[role="dialog"] button[aria-pressed]');
    for (let i = 0; i < 90; i += 1) {
      if (await chips.count()) break;
      await page
        .evaluate(() => window.dispatchEvent(new CustomEvent("catchup:toggle")))
        .catch(() => {});
      await page.waitForTimeout(1000);
    }
    return waitInteractive(page, "B");
  };

  /** Load /weekly at a given viewed week, open Catch-Up, read every row. */
  const sample = async (query) => {
    await page.goto(`${BASE}/weekly${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#main-content", { timeout: 240000 });
    if (!(await open())) return null;
    const shellWeek = await page
      .evaluate(
        () =>
          document
            .querySelector("#main-content")
            ?.textContent?.match(/Week\s+(\d+)/)?.[1] ?? null,
      )
      .catch(() => null);
    return { rows: await readLateness(page), shellWeek };
  };

  // Load 1: no ?week= — the planner opens on the CURRENT week, so the shell's
  // own "Week N" reading is today's plan week and can anchor the oracle.
  const first = await sample("");
  if (!first) {
    await ctx.close();
    return;
  }
  const before = first.rows;
  const withChip = before.filter((r) => r.late !== null).length;
  note(`current week: ${before.length} rows, ${withChip} carrying a lateness chip`);
  await page.screenshot({ path: `${SHOTS}/late-currentweek.png` });

  // POSITIVE CONTROL for the whole section: if no row carries a number, the
  // invariance below would pass vacuously.
  ok(
    "B — the modal renders lateness at all (control for the invariance test)",
    withChip > 0,
    `${withChip}/${before.length} rows`,
  );
  for (const r of before.slice(0, 6))
    note(`  ${r.dayName} · Wk ${r.week} → ${r.late} days late — ${r.title.slice(0, 45)}`);

  // ── Independent oracle ────────────────────────────────────────────────────
  // Recompute lateness OUTSIDE the app, from facts the probe fixed itself:
  // today is Friday 2026-07-31 = index 4 of the six-day week configured above,
  // and the shell reports which plan week that is. Under the previous
  // arithmetic every one of these would be exactly one higher (it measured from
  // the week's END — index 5 — instead of from today).
  const todayWeek = first.shellWeek ? Number(first.shellWeek) : null;
  // DERIVE today's column from the actual clock — never hard-code it. This
  // originally read `SCHOOL_WEEK.indexOf("fri")`, true only on the day it was
  // written (2026-07-31). Run it on a Tuesday and the app anchors to Tuesday
  // while the oracle still expects Friday: every row mismatches, the probe
  // reports a regression that is not there, and the next person "fixes" working
  // app code to satisfy a broken instrument. A false alarm from a checking tool
  // costs more than the bug it was hunting.
  const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayKey = WEEKDAY_KEYS[new Date().getDay()];
  const todayCol = SCHOOL_WEEK.indexOf(todayKey);
  const idxOf = (name) =>
    SCHOOL_WEEK.findIndex((d) => d.slice(0, 3) === name.toLowerCase().slice(0, 3));
  const mismatched = before.filter((r) => {
    if (r.week === null || todayWeek === null) return false;
    const d = idxOf(r.dayName);
    if (d < 0) return false;
    const expect = Math.max(0, (todayWeek - r.week) * SCHOOL_WEEK.length + (todayCol - d));
    return (r.late ?? 0) !== expect;
  });
  note(
    `oracle: today = ${todayKey} (col ${todayCol} of ${SCHOOL_WEEK.length}) in plan week ${todayWeek}`,
  );

  if (todayCol < 0) {
    // Today is not a school day in the configured week (this probe configures
    // Mon–Sat, so that is a Sunday). Lateness then has NO value — one of the
    // three states the null arm exists for — and the app must print nothing
    // rather than guessing 0. That is a real assertion, not a skip, so the
    // probe keeps its teeth on days it was not written on.
    const wrong = before.filter((r) => r.late !== null);
    ok(
      `B — today (${todayKey}) is not a school day, so every row's lateness is blank`,
      before.length > 0 && wrong.length === 0,
      wrong.length
        ? wrong.slice(0, 5).map((r) => `${r.dayName} Wk${r.week}: shown ${r.late}`).join(" | ")
        : `${before.length} rows, all blank`,
    );
  } else {
    ok(
      "B — every rendered lateness matches an independently computed today-anchored value",
      todayWeek !== null && before.length > 0 && mismatched.length === 0,
      mismatched.length
        ? mismatched
            .slice(0, 5)
            .map((r) => `${r.dayName} Wk${r.week}: shown ${r.late}`)
            .join(" | ")
        : `${before.length} rows, week ${todayWeek}`,
    );
  }

  // Load 2: the SAME today, three weeks earlier in the browser. /weekly syncs
  // its viewed week to `?week=`, so this is a clean reload rather than a
  // keyboard sequence whose state could be lost to an HMR recompile.
  const back = todayWeek === null ? null : await sample(`?week=${todayWeek - 3}`);
  if (!back) {
    await ctx.close();
    return;
  }
  note(`viewed week now: Week ${back.shellWeek}`);
  const after = back.rows;
  note(
    `three weeks back: ${after.length} rows, ${after.filter((r) => r.late !== null).length} carrying a chip`,
  );
  await page.screenshot({ path: `${SHOTS}/late-3weeks-back.png` });

  // Rows still in scope must carry the SAME number. (Paging back drops the
  // most recent weeks from the eligibility horizon, so `after` is a subset.)
  const beforeBy = new Map(before.map((r) => [rowKey(r), r.late]));
  const shared = after.filter((r) => beforeBy.has(rowKey(r)));
  const moved = shared.filter((r) => beforeBy.get(rowKey(r)) !== r.late);
  ok(
    "B — the eligibility horizon really moved (control: fewer rows in scope)",
    after.length < before.length && shared.length > 0,
    `${before.length} → ${after.length} rows, ${shared.length} shared`,
  );
  ok(
    "B — every shared row keeps its lateness after paging back three weeks",
    shared.length > 0 && moved.length === 0,
    moved.length
      ? moved
          .slice(0, 5)
          .map((r) => `${rowKey(r).slice(0, 40)}: ${beforeBy.get(rowKey(r))}→${r.late}`)
          .join(" | ")
      : `${shared.length} rows unchanged`,
  );

  await ctx.close();
}

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const browser = await chromium.launch({ channel: "chrome" });
try {
  if (!ONLY || ONLY === "A") await sectionA(browser);
  if (!ONLY || ONLY === "B") await sectionB(browser);
} finally {
  await browser.close();
}

console.log("\n══ console ══");
const seen = new Set();
for (const c of consoleLog) {
  const k = `${c.type}:${c.text.slice(0, 120)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  [${c.tag}] ${c.type}: ${c.text.slice(0, 220)}`);
}
if (!consoleLog.length) console.log("  (none)");

console.log("\n══ summary ══");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

// EXIT NON-ZERO ON FAILURE. Without this the script prints `FAIL` down the
// screen and still exits 0, so any runner — CI, a `&&` chain, a human reading
// the last line under `| tail` — records a pass. A probe that cannot fail is
// not a check; it is decoration that makes the suite look stronger than it is.
// This repo has shipped five instruments with that defect, every one of them
// failing toward reporting success.
//
// Zero results is also a failure, not a pass: it means the probe never got far
// enough to assert anything (server down, login refused, route never mounted),
// and `0/0 passed` must not read as a clean run.
if (failed > 0 || results.length === 0) {
  console.log(
    results.length === 0
      ? "\nFAILED — no assertions ran at all. The probe did not reach the app."
      : `\nFAILED — ${failed} assertion(s) did not pass.`,
  );
  process.exitCode = 1;
}
