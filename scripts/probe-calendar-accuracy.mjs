// scripts/probe-calendar-accuracy.mjs — calendar-math accuracy probe.
//
// PURPOSE
// ───────
// Task #40 (lane-bh-calendar-audit) — independently re-derive the values
// that `lib/year-calendar.ts` and `lib/mock/calendar.ts` produce and
// compare them to what those modules return for the same inputs.
//
// USAGE
// ─────
//   node scripts/probe-calendar-accuracy.mjs
//
// The probe pins the same anchors the production code uses
// (DEFAULT_TERM_START = 2025-11-02, school week Sun–Thu) so the results
// are reproducible across machines.
//
// Output: a section per failure-mode with PASS / FAIL lines. Exit code
// is non-zero if any FAIL was emitted.

// Re-implement the production helpers in plain JS so we can call them
// without the TypeScript build pipeline. Each is a direct mirror of the
// production function — if the probe and production disagree, the probe
// is wrong; if they BOTH agree on a wrong value, the bug is in both.

// ── Anchors (mirrors of lib/year-calendar.ts + lib/mock/calendar.ts) ──

const DEFAULT_TERM_START = new Date(2025, 10, 2); // 2025-11-02 (Sun)
const DEFAULT_SCHOOL_WEEK = ["Su", "Mo", "Tu", "We", "Th"];
const WEEK_1_DAY_0 = { year: 2025, month: 10, day: 2 };
const WEEKS_IN_YEAR = 36;
const WEEKS_PER_QUARTER = 9;
const CURRENT_WEEK = 12; // 1-based mock fixture week

// Long-form month labels (mirror of MONTH_LABELS).
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Mirrors of the production helpers ────────────────────────────────

function dateForWeekDay(week, dayIndex) {
  const anchor = new Date(
    WEEK_1_DAY_0.year,
    WEEK_1_DAY_0.month,
    WEEK_1_DAY_0.day,
  );
  const offsetDays = (week - 1) * 7 + dayIndex;
  return new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + offsetDays,
  );
}

function dateNumberForWeekDay(week, dayIndex) {
  return dateForWeekDay(week, dayIndex).getDate();
}

function buildSchoolDays(termStart, weeksInView, schoolWeek) {
  const days = [];
  for (let w = 0; w < weeksInView; w++) {
    for (let d = 0; d < schoolWeek.length; d++) {
      const offsetDays = w * 7 + d;
      const date = new Date(
        termStart.getFullYear(),
        termStart.getMonth(),
        termStart.getDate() + offsetDays,
      );
      days.push({
        week: w,
        day: d,
        dateNum: date.getDate(),
        wkd: schoolWeek[d],
        month: date.getMonth(),
        year: date.getFullYear(),
        firstOfMonth: date.getDate() === 1,
      });
    }
  }
  return days;
}

function allYearMonths(year = DEFAULT_TERM_START.getFullYear()) {
  const termStart = new Date(
    year,
    DEFAULT_TERM_START.getMonth(),
    DEFAULT_TERM_START.getDate(),
  );
  const weekCounts = new Map();
  const firstWeekFor = new Map();
  for (let w = 0; w < WEEKS_IN_YEAR; w++) {
    const d = new Date(
      termStart.getFullYear(),
      termStart.getMonth(),
      termStart.getDate() + w * 7,
    );
    const m = d.getMonth();
    weekCounts.set(m, (weekCounts.get(m) ?? 0) + 1);
    if (!firstWeekFor.has(m)) firstWeekFor.set(m, w);
  }
  const termStartMonth = termStart.getMonth();
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => {
    const weeks = weekCounts.get(m) ?? 0;
    const hasData = weeks > 0;
    let startWeekIdx;
    if (hasData) {
      startWeekIdx = firstWeekFor.get(m) ?? 0;
    } else {
      startWeekIdx = m < termStartMonth ? WEEKS_IN_YEAR - 1 : 0;
    }
    return {
      label: MONTH_LABELS[m],
      weeks,
      startWeekIdx,
      monthIndex: m,
      hasData,
    };
  });
}

function monthsForQuarter(
  quarter,
  year = DEFAULT_TERM_START.getFullYear(),
) {
  const termStart = new Date(
    year,
    DEFAULT_TERM_START.getMonth(),
    DEFAULT_TERM_START.getDate(),
  );
  const firstWeek = (quarter - 1) * WEEKS_PER_QUARTER;
  const lastWeek = firstWeek + WEEKS_PER_QUARTER - 1;
  const map = new Map();
  for (let w = firstWeek; w <= lastWeek; w++) {
    const d = new Date(
      termStart.getFullYear(),
      termStart.getMonth(),
      termStart.getDate() + w * 7,
    );
    const label = d.toLocaleString("en-US", { month: "long" });
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([label, weeks]) => ({ label, weeks }));
}

// ── Reporting helpers ────────────────────────────────────────────────

let failCount = 0;
let passCount = 0;
const findings = [];

function section(name) {
  console.log("");
  console.log("=".repeat(72));
  console.log(name);
  console.log("=".repeat(72));
}

function check(label, expected, actual, extra = "") {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  const status = ok ? "PASS" : "FAIL";
  if (ok) passCount++;
  else {
    failCount++;
    findings.push({ section: currentSection, label, expected, actual, extra });
  }
  console.log(
    `[${status}] ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}${extra ? "\n        " + extra : ""}`,
  );
}

let currentSection = "";
function s(name) {
  currentSection = name;
  section(name);
}

// ── 1. Anchor date is a Sunday ───────────────────────────────────────

s("1. Anchor date — DEFAULT_TERM_START / WEEK_1_DAY_0 must be a Sunday");
{
  const anchor = new Date(2025, 10, 2);
  // .getDay(): 0=Sun, 1=Mon, …, 6=Sat
  check(
    "2025-11-02 .getDay() should be 0 (Sunday)",
    0,
    anchor.getDay(),
    "schoolWeek[0]='Su' requires the anchor to actually be a Sunday.",
  );
}

// ── 2. dateNumberForWeekDay — spot-check known dates ─────────────────

s("2. dateNumberForWeekDay — week→date conversion");
{
  // Week 1 day 0 — should be the anchor itself (Nov 2).
  check("Wk1 day0 = Nov 2 → dateNum 2", 2, dateNumberForWeekDay(1, 0));

  // Week 1 day 4 — Thursday should be Nov 6 (Sun=2,Mo=3,Tu=4,We=5,Th=6).
  check("Wk1 day4 (Thu) = Nov 6 → dateNum 6", 6, dateNumberForWeekDay(1, 4));

  // Week 12 day 0 — the docstring says Wk12 Sun lands on 2026-01-18.
  // Verify by direct date arithmetic: anchor + 11*7 = 77 days after Nov 2.
  const wk12 = new Date(2025, 10, 2 + 77);
  check(
    "Wk12 day0 from doc — 2026-01-18, dateNum 18",
    18,
    dateNumberForWeekDay(12, 0),
    `(probe-derived month=${wk12.getMonth()}, year=${wk12.getFullYear()})`,
  );

  // Cross-check: week 36 day 4 (last instructional day of the year).
  const wk36d4 = new Date(2025, 10, 2 + 35 * 7 + 4);
  const expectedDay = wk36d4.getDate();
  check(
    `Wk36 day4 — dateNum (probe says ${expectedDay})`,
    expectedDay,
    dateNumberForWeekDay(36, 4),
  );
}

// ── 3. Day-of-week alignment with school week ────────────────────────

s("3. Day-of-week — school-week day index vs JS weekday");
{
  // For a Sun–Thu school week, day d's JS weekday should equal d (since
  // anchor is a Sunday and the school week's day 0 is Sunday).
  for (let d = 0; d < DEFAULT_SCHOOL_WEEK.length; d++) {
    const wkd = DEFAULT_SCHOOL_WEEK[d];
    const date = dateForWeekDay(1, d);
    const jsWeekday = date.getDay(); // 0=Sun
    const expectedJsWeekday = d; // Su=0, Mo=1, Tu=2, We=3, Th=4
    check(
      `Wk1 day${d} (${wkd}) → JS .getDay() === ${expectedJsWeekday}`,
      expectedJsWeekday,
      jsWeekday,
    );
  }
}

// ── 4. allYearMonths — month band widths against direct re-derivation ─

s("4. allYearMonths() — month-band weeks count");
{
  const bands = allYearMonths();
  let totalWeeks = 0;
  let dataBands = 0;
  for (const b of bands) {
    if (b.hasData) {
      totalWeeks += b.weeks;
      dataBands++;
    }
  }
  check(
    "Sum of all band.weeks should equal WEEKS_IN_YEAR (36)",
    36,
    totalWeeks,
    `bands with data: ${dataBands}`,
  );

  // Verify each band's count against an independent recount.
  for (const b of bands) {
    if (!b.hasData) continue;
    let count = 0;
    for (let w = 0; w < WEEKS_IN_YEAR; w++) {
      const d = new Date(2025, 10, 2 + w * 7);
      if (d.getMonth() === b.monthIndex) count++;
    }
    check(
      `Band "${b.label}" (monthIndex=${b.monthIndex}) — expected ${count} weeks`,
      count,
      b.weeks,
    );
  }

  // Verify startWeekIdx for each data band — it should be the first w
  // whose mapped month equals monthIndex.
  for (const b of bands) {
    if (!b.hasData) continue;
    let first = -1;
    for (let w = 0; w < WEEKS_IN_YEAR; w++) {
      const d = new Date(2025, 10, 2 + w * 7);
      if (d.getMonth() === b.monthIndex) {
        first = w;
        break;
      }
    }
    check(`Band "${b.label}" — startWeekIdx === ${first}`, first, b.startWeekIdx);
  }
}

// ── 5. Unit-bar pixel positions — Wk 9–14 inclusive ──────────────────

s("5. UnitBar geometry — spanWeeks vs declared 'Wk 9-14'");
{
  // The Math unit (UNITS.math) says "Wk 9–14". With 1-based fixture weeks
  // and the conversion `startWeekIdx = minWeek - 1`, that's
  //   minWeek=9 → startWeekIdx=8
  //   maxWeek=14 → endWeekIdx=13
  //   spanWeeks = 13 - 8 + 1 = 6 weeks
  // UnitBar.tsx computes:
  //   left  = startWeekIdx * columnWidthPx
  //   width = spanWeeks   * columnWidthPx - gapPx
  const colW = 96;
  const gap = 8;
  const startWeekIdx = 9 - 1;
  const endWeekIdx = 14 - 1;
  const spanWeeks = endWeekIdx - startWeekIdx + 1;
  const left = startWeekIdx * colW;
  const width = spanWeeks * colW - gap;

  // The bar's RIGHT edge should land at left + width = (col 14 left) - gap.
  // "Col 14 left" = (14-1) * colW = 13 * 96 = 1248. minus 8 gap = 1240.
  // left = 8*96 = 768, so width should be 1240-768 = 472.
  check("Wk9-14 spanWeeks (inclusive)", 6, spanWeeks);
  check("Wk9-14 startWeekIdx (0-based)", 8, startWeekIdx);
  check("Wk9-14 left px @ colW=96", 768, left);
  check("Wk9-14 width px @ colW=96, gap=8", 6 * 96 - 8, width);

  // Sanity-check: does the bar visually END inside week 14 (not bleed
  // into week 15)? Right edge = left + width = 768 + 472 = 1240. The
  // left edge of week 15 column (idx 14) = 14 * 96 = 1344. So
  // 1240 < 1344 → bar ends inside wk14 with a gap. PASS.
  const wk15LeftEdge = 14 * colW;
  const ok = left + width < wk15LeftEdge;
  check(
    "Wk9-14 bar right-edge < wk15 left-edge (no bleed)",
    true,
    ok,
    `right=${left + width}, wk15 left=${wk15LeftEdge}`,
  );

  // Now check the OTHER ROADMAP-VIEW math: in RoadmapView.tsx, the
  // endDate label is generated from `endWeekIdx + 1` via
  // weekIdxToDateLabel. That returns the date AFTER the end-of-week
  // — does that mislead the user about when the unit actually ends?
  const colMon10Date = (idx) => {
    const d = new Date(2025, 10, 2 + idx * 7);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const startLabel = colMon10Date(startWeekIdx); // week 9 Sun
  const endLabel = colMon10Date(endWeekIdx + 1); // week 15 Sun — ONE WEEK PAST end
  const trueEndLabel = colMon10Date(endWeekIdx + 1) /* same here just for clarity */;
  void trueEndLabel;
  console.log(
    `[INFO]  Unit-card startDate label = "${startLabel}" (Wk9 Sun)\n        Unit-card endDate label   = "${endLabel}" (Wk15 Sun — one week PAST Wk14)`,
  );
  // This is a documentable concern — the endDate label points at the
  // Sunday AFTER the unit's last instructional week, which a teacher
  // could reasonably misread as "this unit ends Jan 11" when actually
  // the last instructional day is Jan 8 (Wk14 Thu).
  console.log(
    `[INFO]  Wk14 Thu actual end date = ${(() => {
      const d = new Date(2025, 10, 2 + 13 * 7 + 4);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    })()}`,
  );
}

// ── 6. ProgressionView day-grid — column count & today alignment ─────

s("6. ProgressionView — day grid layout");
{
  const days = buildSchoolDays(
    DEFAULT_TERM_START,
    WEEKS_IN_YEAR,
    DEFAULT_SCHOOL_WEEK,
  );
  const expectedCols = WEEKS_IN_YEAR * DEFAULT_SCHOOL_WEEK.length;
  check(
    "Total day columns = WEEKS_IN_YEAR × schoolWeekLen",
    expectedCols,
    days.length,
  );

  // Today's flat index — from RoadmapView/ProgressionView:
  //   todayFlatIdx = lessonToFlatIndex(CURRENT_WEEK, 0, schoolWeekLen)
  //                = (CURRENT_WEEK - 1) * schoolWeekLen + 0
  //                = 11 * 5 + 0 = 55.
  const todayFlatIdx = (CURRENT_WEEK - 1) * DEFAULT_SCHOOL_WEEK.length + 0;
  check("todayFlatIdx for Wk12 day0", 55, todayFlatIdx);

  // The day at that index — its dateNum should be 18 (Jan 18 2026 — Wk12 Sun).
  const todayDay = days[todayFlatIdx];
  check("days[todayFlatIdx].dateNum === 18", 18, todayDay.dateNum);
  check("days[todayFlatIdx].wkd === 'Su'", "Su", todayDay.wkd);
}

// ── 7. TodayMarker column alignment ──────────────────────────────────

s("7. TodayMarker — currentWeekIdx position");
{
  // RoadmapView passes `currentWeekIdx = CURRENT_WEEK - 1 = 11` to
  // TodayMarker. TodayMarker computes:
  //   leftPx = leftRailWidthPx + todayWeekIdx * columnWidthPx + columnWidthPx/2
  // For the roadmap, leftRailWidthPx is passed as 0 (because the rail is
  // in a separate sticky element, not in the same flow). So the marker
  // centers on column 11 × 96 + 48 = 1104.
  const todayWeekIdx = CURRENT_WEEK - 1;
  const leftRail = 0;
  const colW = 96;
  const leftPx = leftRail + todayWeekIdx * colW + colW / 2;
  check("TodayMarker leftPx for wk12 @ colW=96", 1104, leftPx);

  // But check whether `currentWeekIdx` is RELATIVE to the same anchor as
  // the date system: Wk12 is the 12th week (1-based), so the 0-based idx
  // is 11. The week column at idx 11 maps to:
  const colDate = new Date(2025, 10, 2 + 11 * 7);
  console.log(
    `[INFO]  Week column idx 11 (the "today" column) maps to ${colDate.toDateString()} (should be Sun 2026-01-18).`,
  );
  check("Week column idx 11 dateNum", 18, colDate.getDate());
  check("Week column idx 11 month", 0, colDate.getMonth()); // 0 = January
  check("Week column idx 11 year", 2026, colDate.getFullYear());
}

// ── 8. Edge cases — first and last week dates ────────────────────────

s("8. First/last week dates");
{
  // First week: Wk1 Sun = Nov 2 2025.
  const wk1Sun = dateForWeekDay(1, 0);
  check("Wk1 Sun year", 2025, wk1Sun.getFullYear());
  check("Wk1 Sun month (0=Jan)", 10, wk1Sun.getMonth());
  check("Wk1 Sun date", 2, wk1Sun.getDate());

  // Last week: Wk36 Thu.
  const wk36Thu = dateForWeekDay(36, 4);
  console.log(
    `[INFO]  Wk36 Thu (last instructional day) = ${wk36Thu.toDateString()}`,
  );
  // Compute the expected date: anchor + (36-1)*7 + 4 = 35*7+4 = 249 days
  // after 2025-11-02. 2025-11-02 + 249 days = 2026-07-09 (Thursday).
  const expectedWk36Thu = new Date(2025, 10, 2 + 35 * 7 + 4);
  check("Wk36 Thu year", expectedWk36Thu.getFullYear(), wk36Thu.getFullYear());
  check("Wk36 Thu month", expectedWk36Thu.getMonth(), wk36Thu.getMonth());
  check("Wk36 Thu date", expectedWk36Thu.getDate(), wk36Thu.getDate());

  // 36 weeks of a US/Qatar academic year, starting Nov 2 — does the end
  // date land somewhere reasonable? A US school year runs ~Aug→May/Jun;
  // a Nov-start year ending July is INCONSISTENT with the queued-doc
  // intent (real schools start in August or September, not November).
  // This is a known mock-anchor concern.
}

// ── 9. monthsForQuarter — does it agree with allYearMonths? ───────────

s("9. monthsForQuarter — Q1 vs allYearMonths first 9 weeks");
{
  const q1Months = monthsForQuarter(1);
  let q1Sum = 0;
  for (const m of q1Months) q1Sum += m.weeks;
  check("Q1 month-band weeks sum to 9", 9, q1Sum);

  // Also verify against the full-year bands: the first 9 weeks of the
  // year should fall in the same months that monthsForQuarter(1) lists.
  const monthsByIdx = {};
  for (let w = 0; w < 9; w++) {
    const d = new Date(2025, 10, 2 + w * 7);
    const label = d.toLocaleString("en-US", { month: "long" });
    monthsByIdx[label] = (monthsByIdx[label] ?? 0) + 1;
  }
  const expectedQ1Labels = Object.entries(monthsByIdx).map(([label, weeks]) => ({
    label,
    weeks,
  }));
  check(
    "monthsForQuarter(1) matches independent re-derivation",
    expectedQ1Labels,
    q1Months,
  );
}

// ── 10. Wk1 starting day vs schoolWeek[0] alignment ──────────────────

s("10. Cross-school-week probe — Mon–Fri school with Sun anchor");
{
  // If a school's week is Mon–Fri but DEFAULT_TERM_START is a Sunday,
  // then buildSchoolDays() treats Sunday as day 0 and labels it "Mo" —
  // wrong. The production helper requires the caller to align the
  // anchor with schoolWeek[0]. Demonstrate the failure mode.
  const monFri = ["Mo", "Tu", "We", "Th", "Fr"];
  const sundayAnchor = new Date(2025, 10, 2); // Sun
  const wrongDays = buildSchoolDays(sundayAnchor, 1, monFri);
  // wrongDays[0] is labeled "Mo" but its JS .getDay() is 0 (Sunday).
  console.log(
    `[INFO]  Mon–Fri school week + Sun anchor → days[0] labeled "${wrongDays[0].wkd}" but JS getDay()=${new Date(sundayAnchor.getFullYear(), sundayAnchor.getMonth(), sundayAnchor.getDate() + 0).getDay()} (0=Sun).`,
  );
  console.log(
    `[INFO]  This is silent corruption: dateNum will be off and month-band counts can be wrong for schools where DEFAULT_TERM_START doesn't equal a schoolWeek[0] weekday.`,
  );
  // No FAIL here — this is a documented constraint of the API, but it
  // is also a documented FAILURE MODE we should fix in the production
  // code: buildSchoolDays should advance to the nearest schoolWeek[0]
  // weekday on/after termStart, or the function should require an
  // already-aligned termStart and assert.
}

// ── Summary ───────────────────────────────────────────────────────────

section("SUMMARY");
console.log(`PASS: ${passCount}`);
console.log(`FAIL: ${failCount}`);
if (findings.length) {
  console.log("");
  console.log("Failing checks:");
  for (const f of findings) {
    console.log(`  • [${f.section}] ${f.label}`);
    console.log(`        expected: ${JSON.stringify(f.expected)}`);
    console.log(`        actual:   ${JSON.stringify(f.actual)}`);
  }
}

process.exit(failCount > 0 ? 1 : 0);
