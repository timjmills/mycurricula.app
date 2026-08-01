// probe-catchup-scope-chips.mjs — live verification for Catch-Up task #41.
//
//   B. The "Today" and "This week" scope chips are anchored to the CLOCK, not
//      to the week the teacher is browsing. Measured by browsing FORWARD two
//      weeks, so today's week AND the browsed week are both inside the
//      eligibility horizon: the chips must answer with today's week while the
//      browsed week's rows sit right there in "Everything" — value vs value,
//      not an absence. Under the previous code the chips answered with the
//      browsed week, so this is the exact discriminator.
//   C. When today is OUTSIDE the configured academic year, those two chips say
//      so instead of painting "All caught up for this scope 🎉". An empty list
//      that means "we could not place the clock" must not be dressed as "the
//      work is done".
//   D. No standards-gap row still shows the lib/mock per-subject unit name.
//      The old code read `UNITS[subject].name`, whose eight names are textually
//      DISJOINT from the live catalog's (mock "Unit 3 · Fractions on a Number
//      Line" vs catalog "Fractions"), so their appearance is a positive
//      fingerprint of the defect rather than a judgement call. This is a
//      narrower claim than "each row names its own unit" — deliberately: the
//      local corpus has no subject whose gaps straddle two units, so nothing
//      live can separate per-row from per-subject resolution. That case is
//      carried by tests/catchup-scope.test.ts against a purpose-built fixture.
//
// REPORT-ONLY — the only state it writes is localStorage inside its own browser
// context (academic year + school week), so the run is deterministic. Section B
// SURVEYS the corpus and then configures an academic year that puts today on a
// week which can actually carry the assertions; section C configures one that
// cannot contain today at all. Every date is derived from the clock and printed
// on every run, never written as a literal.
//
// Traps this is built against (the sibling probe-catchup-late-chips.mjs carries
// the same list, and it was earned):
//   • Dev hydration here has measured 280s under concurrent-lane load, so waits
//     poll for something SEEN TO MOVE and keep re-sending the open event rather
//     than sleeping or waiting once.
//   • Absence assertions fail open — each is printed next to a positive control
//     evaluated in the SAME reading. An empty chip is reported as a FAILURE,
//     not a pass, when the control that would make it meaningful is missing.
//   • Nothing about today is hard-coded — not the weekday, not the column, not
//     the academic year, not the plan week today falls on.
//   • channel: "chrome" — never the system-default Edge.
//
// Run: node scripts/probe-catchup-scope-chips.mjs   (dev server already on 3014)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/catchup-scope-chips";
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

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * A five-day school week DERIVED from the clock so that today is always one of
 * its columns, and today's 0-based column within it.
 *
 * `useSchoolWeek()`'s normalize() SORTS the configured days Sun-first, so the
 * probe cannot choose today's column by listing the days in some other order —
 * it can only choose which days are in the set. Taking the five consecutive
 * weekdays ENDING at today (clipped so the window always fits inside Sun…Sat)
 * therefore gives a valid configured week containing today, and today's column
 * falls out as `todayIndex - windowStart`.
 *
 * Five days, not six, because a lesson's `day` is a position in the configured
 * week and the corpus was authored against a five-day week — a sixth column
 * would be one no lesson can ever occupy, which on a Saturday left the "Today"
 * chip permanently and uninformatively empty in the first run of this probe.
 */
const TODAY_INDEX = new Date().getDay();
const WINDOW_START = Math.min(Math.max(TODAY_INDEX - 4, 0), 2);
const SCHOOL_WEEK = WEEKDAY_KEYS.slice(WINDOW_START, WINDOW_START + 5);
const TODAY_KEY = WEEKDAY_KEYS[TODAY_INDEX];
const TODAY_COL = TODAY_INDEX - WINDOW_START;

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * An academic year that cannot contain today, DERIVED from the clock. A literal
 * "2030-06-01" works only until the calendar reaches it; that is the same shape
 * as the `indexOf("fri")` oracle 41aab70 had to fix — an instrument that
 * silently stops testing what it claims to test, and then reports a pass for it.
 *
 * There is no matching IN_RANGE constant: section B does not guess where today
 * should stand, it SURVEYS the corpus and derives a start date that puts today
 * on a week which can actually carry the assertions (see surveyWeeks).
 */
const OUT_OF_RANGE = { yearStart: iso(shift(3650)), yearEnd: iso(shift(4015)) };

/**
 * `UNITS[subject].name` from lib/mock, keyed by the subject label the gap row
 * renders in bold — the EXACT string the pre-fix `standardGaps` would have
 * printed for a gap in that subject, whatever unit the lesson was really in.
 *
 * This is what makes section D discriminating without needing the corpus to
 * co-operate. None of these eight strings appears in the live catalog
 * (ALL_UNITS calls the same bands "Fractions", "Realistic Fiction", …), so a
 * row showing the catalog's name for its subject is positive evidence that the
 * name came from the injected per-lesson lookup and not from the fixture map.
 */
const MOCK_UNIT_BY_SUBJECT = {
  Math: "Unit 3 · Fractions on a Number Line",
  Reading: "Unit 2 · Realistic Fiction",
  Writing: "Unit 3 · Personal Narrative",
  Grammar: "Unit 2 · Verb Tense & Agreement",
  Spelling: "List 12 · Greek Roots",
  UFLI: "Lessons 84–92 · Multisyllabic Words",
  Explorers: "Unit 2 · Ancient Egypt",
  SEL: "Unit 2 · Conflict & Resolution",
};

const makeCtx = async (browser, { yearStart, yearEnd }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    deviceScaleFactor: 1,
  });
  ctx.setDefaultNavigationTimeout(180000);
  await ctx.addInitScript(
    ([days, start, end]) => {
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
    [SCHOOL_WEEK, yearStart, yearEnd],
  );
  await ctx.route("**/rest/v1/teacher_preferences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 3,
    timeout: 180000,
  });
  return ctx;
};

/**
 * Dispatch catchup:toggle until the CATCH-UP dialog is up — identified by its
 * scope chips, not `[role=dialog]` alone (the weekly shell has dialogs of its
 * own, and waiting on the generic selector once matched one and hung a run).
 *
 * The dispatch fires on EVERY iteration rather than for a first phase only.
 * The toggle listener attaches post-hydration, and hydration on this dev server
 * has been measured at 280s under concurrent-lane load; the first draft of this
 * probe dispatched for 90s and then merely WAITED, so it sat out the remaining
 * 190s waiting for an event nobody was still sending, and died on a timeout
 * that looked like an app failure. The dialog appearing is itself proof the
 * listener ran, i.e. that the page has hydrated.
 */
async function openModal(page, label) {
  const t0 = Date.now();
  const chips = page.locator('[role="dialog"] button[aria-pressed]');
  for (let i = 0; i < 600; i += 1) {
    if ((await chips.count().catch(() => 0)) > 0) {
      note(`${label}: modal open after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return true;
    }
    await page
      .evaluate(() => window.dispatchEvent(new CustomEvent("catchup:toggle")))
      .catch(() => {});
    await page.waitForTimeout(1000);
  }
  ok(`${label} — the Catch-Up modal opened`, false, "toggle never produced a dialog");
  return false;
}

/** Close the modal and confirm it is gone — the week shortcuts below are
 *  deliberately suppressed while any dialog is up (use-keyboard-shortcuts). */
async function closeModal(page) {
  for (let i = 0; i < 30; i += 1) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return true;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  return false;
}

/** Click a scope chip by its visible label and wait for aria-pressed to stick. */
async function pickScope(page, label) {
  const chip = page.locator(
    `[role="dialog"] button[aria-pressed]:text-is("${label}")`,
  );
  for (let i = 0; i < 30; i += 1) {
    await chip.click({ force: true }).catch(() => {});
    if ((await chip.getAttribute("aria-pressed")) === "true") return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** One entry per lesson row: the day chip parsed into its weekday + plan week. */
const readRows = (page) =>
  page.evaluate(() => {
    const metas = [
      ...document.querySelectorAll('[role="dialog"] [class*="rowMeta"]'),
    ];
    return metas.map((meta) => {
      const chips = [...meta.querySelectorAll("span")];
      const dayChip = chips.find((s) => /· Wk /.test(s.textContent || ""));
      const m = (dayChip?.textContent || "").match(/^(.+?) · Wk (\d+)$/);
      return {
        title:
          meta.parentElement
            ?.querySelector('[class*="rowTitle"]')
            ?.textContent?.trim() || "?",
        dayName: m ? m[1].trim() : "?",
        week: m ? Number(m[2]) : null,
      };
    });
  });

/** The empty-state heading currently painted inside the modal, or null. */
const readEmptyHeading = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[role="dialog"] [role="status"]');
    return el ? (el.getAttribute("aria-label") || "").trim() : null;
  });

/** Standards-gap rows: the code, and the "(unit)" suffix if the row carries one. */
const readGaps = (page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="dialog"] [class*="gapRow"]')];
    return rows.map((row) => {
      const text = row.querySelector('[class*="gapText"]')?.textContent || "";
      const subject = row.querySelector("b")?.textContent?.trim() || null;
      // The row renders `<b>Subject</b> · desc (unit)`, so the unit is the LAST
      // parenthesised group — a desc containing brackets cannot steal it.
      const m = text.match(/\(([^()]*)\)\s*$/);
      return {
        code: row.querySelector('[class*="gapCode"]')?.textContent?.trim() || "?",
        subject,
        unit: m ? m[1].trim() : null,
      };
    });
  });

/** The plan week the weekly shell is currently showing. */
const shellWeek = (page) =>
  page
    .evaluate(
      () =>
        document.querySelector("#main-content")?.textContent?.match(/Week\s+(\d+)/)?.[1] ??
        null,
    )
    .then((w) => (w === null ? null : Number(w)))
    .catch(() => null);

/**
 * Advance the browsed week by `n` with the `]` shortcut — client-side, with the
 * modal closed (the shortcut dispatcher ignores keys while a dialog is up).
 *
 * Deliberately NOT a reload to `?week=N`. Reloading costs a full hydration,
 * which measured 280s here, and doing it twice per section put the run past
 * every timeout. Paging in-session is also the truer reproduction: the reported
 * bug is what happens when a teacher pages the planner, not when they deep-link.
 */
async function pageForward(page, n) {
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press("]");
    await page.waitForTimeout(600);
  }
  return shellWeek(page);
}

// ── B. the chips answer to the clock, not to the browsed week ───────────────

/** The plan week section B measured with today IN range. Section C's control
 *  compares against it: with today OUT of range the app must clamp to Week 1,
 *  and that is only evidence if the in-range run landed somewhere else. */
let inRangeTodayWeek = null;

/**
 * Discover WHERE the uncovered lessons actually are, then configure the
 * academic year so that TODAY lands on a week that has some.
 *
 * The first version of this section configured a fixed year, found today on
 * plan week 9, and week 9 turned out to hold zero uncovered lessons in the
 * local corpus. Every clock-anchored assertion then had nothing to measure —
 * and, correctly, failed rather than reporting a pass, because "the chip
 * showed no row from the browsed week" is trivially true of a chip showing no
 * rows at all. Rather than leave the live oracle blind, the probe now READS
 * the corpus and moves the academic year to meet it.
 *
 * Moving the year is sound: `resolveCurrentWeek` is
 * `floor(daysSince(yearStart)/7) + 1`, so a start date of `today - (W-1)*7`
 * puts today on plan week W exactly. Lesson week NUMBERS are stored on the
 * lessons and do not move with the year — only the mapping from the calendar
 * onto them does. Nothing about the code under test is configured here; the
 * probe is choosing where to stand, not what it is looking at.
 */
async function surveyWeeks(browser) {
  const provisional = { yearStart: iso(shift(-56)), yearEnd: iso(shift(300)) };
  const ctx = await makeCtx(browser, provisional);
  const page = await ctx.newPage();
  attach(page, "survey");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content", { timeout: 240000 });
  if (!(await openModal(page, "survey"))) {
    await ctx.close();
    return null;
  }
  // Widen the eligibility horizon (`lesson.week <= browsed`) so the survey sees
  // most of the corpus rather than just the weeks before today.
  if (!(await closeModal(page))) {
    await ctx.close();
    return null;
  }
  const wideWeek = await pageForward(page, 16);
  if (!(await openModal(page, "survey@wide"))) {
    await ctx.close();
    return null;
  }
  if (!(await pickScope(page, "Everything"))) {
    await ctx.close();
    return null;
  }
  const rows = await readRows(page);
  note(`survey: horizon Wk ${wideWeek} — ${rows.length} uncovered rows in scope`);
  await ctx.close();
  return rows;
}

async function sectionB(browser) {
  console.log("\n══ B · scope chips anchored to today, not the browsed week ══");
  note(
    `today = ${TODAY_KEY}; configured school week ${SCHOOL_WEEK.join("·")} → today is column ${TODAY_COL}`,
  );

  // ── Choose where today should stand, from the corpus ─────────────────────
  const survey = await surveyWeeks(browser);
  if (!survey) {
    ok("B — surveyed the corpus to place today", false, "survey never completed");
    return;
  }
  const byWeek = new Map();
  for (const r of survey) {
    if (r.week === null) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, []);
    byWeek.get(r.week).push(r);
  }
  const colOf = (name) =>
    SCHOOL_WEEK.findIndex(
      (d) => d.slice(0, 3) === (name || "").toLowerCase().slice(0, 3),
    );
  // A week can carry today's assertions only if it holds a row ON today's
  // column (so "Today" has something to show) AND a row on another column (so
  // "Today" has something to EXCLUDE — otherwise the filter is untested).
  const candidates = [...byWeek.entries()]
    .filter(([week, rows]) => {
      const cols = new Set(rows.map((r) => colOf(r.dayName)));
      return cols.has(TODAY_COL) && cols.size > 1 && byWeek.has(week + 1);
    })
    .sort((a, b) => b[1].length - a[1].length);
  note(
    `survey: weeks with rows — ${[...byWeek.entries()].map(([w, r]) => `Wk${w}:${r.length}`).join(" ")}`,
  );
  ok(
    "B — the corpus contains a week that can carry the oracle (today's column + another, with a later week too)",
    candidates.length > 0,
    candidates.length
      ? `${candidates.length} candidate week(s), using Wk ${candidates[0][0]}`
      : `none — no week holds an uncovered lesson on column ${TODAY_COL} alongside another column`,
  );
  if (!candidates.length) return;
  const targetWeek = candidates[0][0];
  // Browse forward to the nearest LATER week that also has rows, so the wrong
  // answer is genuinely available on screen.
  const offset = [1, 2, 3].find((k) => byWeek.has(targetWeek + k));
  if (!offset) {
    ok("B — a later week with rows exists to browse to", false, `none within 3 of Wk ${targetWeek}`);
    return;
  }

  // ── Stand there ──────────────────────────────────────────────────────────
  const anchored = {
    yearStart: iso(shift(-(targetWeek - 1) * 7)),
    yearEnd: iso(shift(300)),
  };
  note(
    `placing today on plan week ${targetWeek}: academic year ${anchored.yearStart} … ${anchored.yearEnd}`,
  );
  const ctx = await makeCtx(browser, anchored);
  const page = await ctx.newPage();
  attach(page, "B");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content", { timeout: 240000 });
  // One hydration for the whole section: opening the modal proves the page has
  // hydrated (the toggle listener attaches post-mount), and nothing reloads
  // after this point.
  if (!(await openModal(page, "B"))) {
    await ctx.close();
    return;
  }
  const todayWeek = await shellWeek(page);
  inRangeTodayWeek = todayWeek; // section C's control reads this
  ok(
    "B — the academic year really put today on the surveyed week",
    todayWeek === targetWeek,
    `wanted Wk ${targetWeek}, planner opened on Wk ${todayWeek}`,
  );
  if (todayWeek !== targetWeek) {
    await ctx.close();
    return;
  }

  // Browse FORWARD. Both today's week and the browsed week are then inside
  // `deriveCatchupItems`' horizon (week <= browsed), which is what makes this
  // value-vs-value: the wrong answer is available and was what shipped.
  const browsed = todayWeek + offset;
  if (!(await closeModal(page))) {
    ok("B — could close the modal to page the planner", false, "dialog stayed up");
    await ctx.close();
    return;
  }
  const landedOn = await pageForward(page, offset);
  ok(
    "B — the planner really moved to a LATER week than today (control)",
    landedOn === browsed,
    `today Wk ${todayWeek}, browsing Wk ${landedOn} (wanted ${browsed})`,
  );
  if (landedOn !== browsed) {
    await ctx.close();
    return;
  }
  if (!(await openModal(page, "B@browsed"))) {
    await ctx.close();
    return;
  }

  // The horizon's contents, before touching a clock-anchored chip. This is the
  // positive control for every assertion below: it must contain rows in the
  // BROWSED week, otherwise "the chips don't show the browsed week" is true of
  // a set that never had any.
  if (!(await pickScope(page, "Everything"))) {
    ok("B — could select the Everything scope", false, "chip never pressed");
    await ctx.close();
    return;
  }
  const all = await readRows(page);
  const atBrowsed = all.filter((r) => r.week === browsed);
  const atToday = all.filter((r) => r.week === todayWeek);
  note(
    `Everything: ${all.length} rows — ${atToday.length} in today's week ${todayWeek}, ${atBrowsed.length} in the browsed week ${browsed}`,
  );
  await page.screenshot({ path: `${SHOTS}/everything-browsed-forward.png` });
  ok(
    "B — the browsed week HAS rows of its own (control: the wrong answer was available)",
    atBrowsed.length > 0,
    `${atBrowsed.length} rows at Wk ${browsed}`,
  );
  ok(
    "B — today's week has rows in scope (control: the right answer was available)",
    atToday.length > 0,
    `${atToday.length} rows at Wk ${todayWeek}`,
  );

  // ── "This week" ──────────────────────────────────────────────────────────
  if (!(await pickScope(page, "This week"))) {
    ok("B — could select the This week scope", false, "chip never pressed");
    await ctx.close();
    return;
  }
  const weekRows = await readRows(page);
  const weekHeading = await readEmptyHeading(page);
  const wrongWeek = weekRows.filter((r) => r.week !== todayWeek);
  note(
    `This week: ${weekRows.length} rows — weeks ${[...new Set(weekRows.map((r) => r.week))].join(", ") || "none"}${weekHeading ? ` — empty state: "${weekHeading}"` : ""}`,
  );
  await page.screenshot({ path: `${SHOTS}/thisweek-browsed-forward.png` });
  // Each behavioural assertion below carries its OWN prerequisite in its pass
  // condition, rather than leaning on the separate control assertions above.
  // Those controls fail the run, but they do not make a neighbouring PASS
  // earned — and a PASS line is read on its own, out of context, by whoever
  // greps the summary. So "shows today's week" is only allowed to pass when
  // there was a today's week to show AND a browsed week it could have shown
  // instead.
  const browsedShown = weekRows.filter((r) => r.week === browsed).length;
  ok(
    "B — 'This week' shows TODAY's week, never the browsed week",
    atToday.length > 0 &&
      atBrowsed.length > 0 &&
      weekRows.length > 0 &&
      wrongWeek.length === 0,
    atToday.length === 0 || atBrowsed.length === 0
      ? `prerequisite missing: ${atToday.length} today-week rows, ${atBrowsed.length} browsed-week rows in scope`
      : weekRows.length === 0
        ? "no rows at all — vacuous, treat as a failure"
        : wrongWeek.length
          ? `${wrongWeek.length} rows off today's week: ${[...new Set(wrongWeek.map((r) => `Wk${r.week}`))].join(", ")}`
          : `${weekRows.length} rows, all Wk ${todayWeek}`,
  );
  // The pre-fix answer, named explicitly: it was ON SCREEN under Everything and
  // is absent here.
  ok(
    "B — and specifically excludes the browsed week's rows that Everything showed",
    atBrowsed.length > 0 && weekRows.length > 0 && browsedShown === 0,
    atBrowsed.length === 0
      ? "prerequisite missing: the browsed week had no rows to exclude"
      : weekRows.length === 0
        ? "no rows at all — vacuous, treat as a failure"
        : `${atBrowsed.length} browsed-week rows available, ${browsedShown} shown`,
  );

  // ── "Today" ──────────────────────────────────────────────────────────────
  if (!(await pickScope(page, "Today"))) {
    ok("B — could select the Today scope", false, "chip never pressed");
    await ctx.close();
    return;
  }
  const todayRows = await readRows(page);
  note(
    `Today: ${todayRows.length} rows — ${todayRows.map((r) => `${r.dayName} Wk${r.week}`).join(", ") || "none"}`,
  );
  await page.screenshot({ path: `${SHOTS}/today-browsed-forward.png` });
  const offTodayRows = todayRows.filter(
    (r) => r.week !== todayWeek || colOf(r.dayName) !== TODAY_COL,
  );
  // Paired with its control: "Everything" holds rows on OTHER columns of
  // today's week, so an all-today result is a filter doing work rather than an
  // input that only ever had one column in it. The surveyed week was chosen to
  // guarantee this, and the guarantee is re-asserted here against live data.
  const otherCols = atToday.filter((r) => colOf(r.dayName) !== TODAY_COL);
  ok(
    "B — 'Today' shows only today's own week AND today's own column",
    otherCols.length > 0 &&
      atBrowsed.length > 0 &&
      todayRows.length > 0 &&
      offTodayRows.length === 0,
    otherCols.length === 0 || atBrowsed.length === 0
      ? `prerequisite missing: ${otherCols.length} rows on other columns, ${atBrowsed.length} browsed-week rows — nothing to exclude`
      : todayRows.length === 0
        ? "no rows at all — vacuous, treat as a failure"
        : offTodayRows.length
          ? offTodayRows.slice(0, 5).map((r) => `${r.dayName} Wk${r.week}`).join(" | ")
          : `${todayRows.length} rows, all ${TODAY_KEY} (col ${TODAY_COL}) Wk ${todayWeek}`,
  );
  ok(
    "B — other columns of today's week existed to be excluded (control)",
    otherCols.length > 0,
    `${otherCols.length} rows on other columns of Wk ${todayWeek}`,
  );

  // Section D rides the SAME page — it needs the in-range year this context
  // already has, and a second context would cost another full hydration.
  await sectionD(page);

  await ctx.close();
}

// ── C. today outside the configured year says so ────────────────────────────

async function sectionC(browser) {
  console.log("\n══ C · today outside the academic year is not 'all caught up' ══");
  // A year that cannot contain today, so `currentWeekBasis` is a CLAMP.
  const ctx = await makeCtx(browser, OUT_OF_RANGE);
  note(`academic year (cannot contain today): ${OUT_OF_RANGE.yearStart} … ${OUT_OF_RANGE.yearEnd}`);
  const page = await ctx.newPage();
  attach(page, "C");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content", { timeout: 240000 });
  if (!(await openModal(page, "C"))) {
    await ctx.close();
    return;
  }

  // POSITIVE CONTROL that the out-of-year state was actually REACHED, before
  // reading any wording. Without it, "the chips print the missing-anchor
  // message" would also pass on a build that ignored the injected academic year
  // entirely and printed that message unconditionally. `before-start` clamps
  // the current week to 1 (lib/school-week-now), and the in-range run in
  // section B landed elsewhere — so the two readings together show the setting
  // took effect and moved the app.
  const clampedWeek = await shellWeek(page);
  const reachedOutOfYear =
    clampedWeek === 1 && inRangeTodayWeek !== null && inRangeTodayWeek !== 1;
  note(
    `shell week with today out of range: ${clampedWeek} (in-range run was ${inRangeTodayWeek})`,
  );
  ok(
    "C — the injected academic year really put today out of range (control: clamped to Week 1)",
    reachedOutOfYear,
    `out-of-range Wk ${clampedWeek}, in-range Wk ${inRangeTodayWeek}`,
  );

  const MISSING = /isn’t inside your school year/;
  const readings = {};
  for (const label of ["This week", "Today", "Everything"]) {
    if (!(await pickScope(page, label))) {
      ok(`C — could select the ${label} scope`, false, "chip never pressed");
      await ctx.close();
      return;
    }
    readings[label] = {
      rows: (await readRows(page)).length,
      heading: await readEmptyHeading(page),
    };
    note(
      `${label}: ${readings[label].rows} rows — empty state: "${readings[label].heading ?? "(rows rendered)"}"`,
    );
    await page.screenshot({
      path: `${SHOTS}/outofyear-${label.replace(/\s+/g, "-").toLowerCase()}.png`,
    });
  }

  // The discriminating pair, read in one go: the clock-anchored chips must say
  // the anchor is missing, and the clock-INDEPENDENT chip must not — otherwise
  // the message is just what this build always prints.
  const anchored = ["This week", "Today"].filter((l) =>
    MISSING.test(readings[l].heading ?? ""),
  );
  // Carries BOTH its prerequisites in the pass condition: the app must have
  // actually entered the out-of-year state, and the message must be
  // scope-specific rather than printed on everything. Either alone would let
  // this line read PASS on evidence it does not have.
  const scopeSpecific = !MISSING.test(readings.Everything.heading ?? "");
  ok(
    "C — 'This week' and 'Today' report the missing anchor instead of 'All caught up'",
    reachedOutOfYear && scopeSpecific && anchored.length === 2,
    !reachedOutOfYear
      ? "prerequisite missing: the app never entered the out-of-year state"
      : !scopeSpecific
        ? "prerequisite missing: Everything prints the same message, so it is unconditional"
        : anchored.length === 2
          ? "both"
          : `only: ${anchored.join(", ") || "neither"} — headings ${JSON.stringify(readings)}`,
  );
  ok(
    "C — 'Everything' does NOT report it (control: the message is scope-specific)",
    scopeSpecific,
    `Everything: ${readings.Everything.rows} rows, "${readings.Everything.heading ?? "(rows rendered)"}"`,
  );

  await ctx.close();
}

// ── D. standards-gap rows name their own unit ───────────────────────────────

async function sectionD(page) {
  console.log("\n══ D · standards-gap rows name their OWN unit ══");
  // Widen the eligibility horizon first. `standardGaps` scopes to
  // `week <= browsed`, so at section B's browsed week each subject's gaps all
  // sit inside ONE unit band and the per-row assertion below cannot tell a
  // per-row lookup from a per-subject one. That is a property of the corpus,
  // not of the code — and a probe that fails on it would be crying wolf, while
  // one that passes on it would be claiming evidence it does not have. Paging
  // out to where a subject's gaps straddle a unit boundary gets real evidence
  // instead of either.
  if (!(await closeModal(page))) {
    ok("D — could close the modal to widen the horizon", false, "dialog stayed up");
    return;
  }
  const wide = await pageForward(page, 16);
  note(`gap horizon widened to Wk ${wide}`);
  if (!(await openModal(page, "D@wide"))) return;
  if (!(await pickScope(page, "Standards gaps"))) {
    ok("D — could select the Standards gaps scope", false, "chip never pressed");
    return;
  }
  const gaps = await readGaps(page);
  await page.screenshot({ path: `${SHOTS}/standards-gaps.png` });

  const named = gaps.filter((g) => g.unit);
  // A row is EVIDENCE when its subject has a known mock name to be compared
  // against; a row whose subject label this probe does not recognise proves
  // nothing either way and must not be counted as passing.
  const comparable = named.filter((g) => MOCK_UNIT_BY_SUBJECT[g.subject]);
  const showingMock = comparable.filter(
    (g) => g.unit === MOCK_UNIT_BY_SUBJECT[g.subject],
  );
  const bySubject = new Map();
  for (const g of named) {
    if (!bySubject.has(g.subject)) bySubject.set(g.subject, new Set());
    bySubject.get(g.subject).add(g.unit);
  }
  note(`${gaps.length} gap rows, ${named.length} carrying a unit name`);
  for (const [subj, units] of bySubject)
    note(`  ${subj}: ${units.size} distinct unit(s) — ${[...units].join(" | ")}`);

  // THE DISCRIMINATOR, per row and per subject. The pre-fix code could print
  // exactly ONE unit name for a given subject — `UNITS[subject].name` — so for
  // every row here, "the name shown is NOT that subject's fixture name" is
  // positive evidence that the name was resolved from the injected catalog via
  // the row's own lesson. Absence and its control are one expression: rows must
  // exist, must be named, must be comparable, and none may show the fixture
  // string.
  // EVERY row, not merely every row this probe happened to be able to check.
  // Validating only the comparable subset would let a regression that stripped
  // the unit suffix off most rows pass on the strength of the one row left —
  // the assertion would still read PASS while claiming something about "every
  // gap row". So an unnamed row, or one whose subject label is not in the
  // fixture map, fails the assertion and is named in the detail.
  const unnamed = gaps.filter((g) => !g.unit);
  const unknownSubject = named.filter((g) => !MOCK_UNIT_BY_SUBJECT[g.subject]);
  // NAMED for exactly what it proves. It does NOT prove per-row ownership —
  // a hypothetical regression to some OTHER fixed per-subject name would slip
  // past it, and this corpus cannot tell the two apart (see the note below).
  // What it does prove is that the reported defect is gone from the live
  // surface: no row still carries the lib/mock per-subject string. The per-row
  // claim is carried by tests/catchup-scope.test.ts, against a fixture built
  // with two units in one subject for precisely that purpose.
  ok(
    "D — no gap row still shows its subject's legacy lib/mock fixture name (all rows named + comparable)",
    gaps.length > 0 &&
      unnamed.length === 0 &&
      unknownSubject.length === 0 &&
      comparable.length === gaps.length &&
      showingMock.length === 0,
    gaps.length === 0
      ? "no gap rows at all — vacuous, treat as a failure"
      : unnamed.length
        ? `${unnamed.length} of ${gaps.length} rows carry NO unit name: ${unnamed.map((g) => g.code).join(", ")}`
        : unknownSubject.length
          ? `${unknownSubject.length} row(s) in a subject this probe cannot compare: ${[...new Set(unknownSubject.map((g) => g.subject))].join(", ")}`
          : showingMock.length
            ? `${showingMock.length} row(s) show the fixture name: ${showingMock.map((g) => `${g.subject}→${g.unit}`).join(" | ")}`
            : `all ${gaps.length} rows named and comparable, none matching its subject's fixture name`,
  );

  // NOT an assertion, deliberately. The sharpest live signature of the defect
  // would be several gaps in ONE subject all claiming one unit — but this
  // corpus cannot show it either way: the gap set is 8 standards across 4
  // subjects and does not grow when the horizon is widened to week 29, and each
  // subject's gaps sit inside a single unit band. Asserting it would fail on a
  // correct app for a fixture reason, and this repo has already been taught
  // what a check that cries wolf costs. The per-subject discriminator above
  // carries the live case; tests/catchup-scope.test.ts carries the multi-unit
  // one against a fixture built for it.
  const multiRow = [...bySubject.keys()].filter(
    (subj) => named.filter((g) => g.subject === subj).length > 1,
  );
  const multiUnit = [...bySubject.entries()].filter(([, u]) => u.size > 1);
  note(
    `multi-gap subjects: ${multiRow.join(", ") || "none"}; spanning >1 unit: ${
      multiUnit.map(([s, u]) => `${s}(${u.size})`).join(", ") || "none"
    } — this corpus cannot discriminate per-row from per-subject on its own, which is why the assertion above compares against the fixture STRING instead`,
  );
}

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const browser = await chromium.launch({ channel: "chrome" });
// A section that THROWS must record a failure, not vanish. Without this an
// uncaught error skips the summary and the exit-code guard below entirely, so
// the run produces no verdict at all — the same fail-open shape the guard
// exists to close.
const run = async (name, fn) => {
  try {
    await fn(browser);
  } catch (e) {
    ok(`${name} — section completed without throwing`, false, String(e).slice(0, 300));
  }
};
try {
  if (!ONLY || ONLY === "B") await run("B", sectionB);
  if (!ONLY || ONLY === "C") await run("C", sectionC);
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

// Console output is COLLECTED above and ASSERTED here. Collecting without
// asserting is the fail-open shape this repo keeps re-discovering: the probe
// prints an uncaught React exception, exits 0, and the run reads as clean.
//
// Errors and page exceptions only — dev `warning`s are printed but not failed
// on, because a Next dev server emits plenty that predate this change, and an
// instrument that cries wolf on unrelated noise gets ignored, which guards
// nothing.
//
// The allowlist is EMPTY, and that is a decision, not an oversight. It briefly
// held `ChunkLoadError` and the compile `SyntaxError` on the grounds that this
// repo runs one dev server across several lanes, so a sibling saving a
// half-written file makes Next recompile and the browser fetch a chunk that
// momentarily does not exist — a build state, not an app fault. Excusing them
// was wrong for two reasons. It cannot tell that transient case from a real
// route that will not load for a user; and empirically the two always arrived
// together here — every run that logged a chunk error ALSO failed sections
// outright, while both clean runs logged none. So the entries bought no signal
// and cost the check its teeth. A run that overlaps another lane's edit now
// fails loudly, which is right: its measurements are not trustworthy either.
//
// Anything added here later must name the reason and must have been SEEN
// first, rather than pre-excused.
const CONSOLE_ALLOW = [];
const hardErrors = consoleLog.filter(
  (c) =>
    (c.type === "error" || c.type === "pageerror") &&
    !CONSOLE_ALLOW.some((re) => re.test(c.text)),
);
ok(
  "no uncaught page errors or console errors during the run",
  hardErrors.length === 0,
  hardErrors.length
    ? hardErrors.slice(0, 5).map((c) => `[${c.tag}] ${c.type}: ${c.text.slice(0, 140)}`).join(" | ")
    : `${consoleLog.length} console entries, none an error`,
);

console.log("\n══ summary ══");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

// EXIT NON-ZERO ON FAILURE. Without this the script prints `FAIL` down the
// screen and still exits 0, so any runner — CI, a `&&` chain, a human reading
// the last line under `| tail` — records a pass. Zero results is also a
// failure, not a clean `0/0`: it means the probe never reached the app.
if (failed > 0 || results.length === 0) {
  console.log(
    results.length === 0
      ? "\nFAILED — no assertions ran at all. The probe did not reach the app."
      : `\nFAILED — ${failed} assertion(s) did not pass.`,
  );
  process.exitCode = 1;
}
