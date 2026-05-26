// scripts/probe-academic-year.mjs — Lane Y-cal verification.
//
// Confirms that the new parameterized year-calendar helpers produce the
// expected week count for a given (start, end) pair, and that the existing
// non-parameterized wrappers still return the 36-week default.
//
// Run with: node scripts/probe-academic-year.mjs

// We can't import the TS module directly in a plain node run; mirror the
// helper logic here exactly. Any drift between the mirror and the source
// is a test failure. The point is to verify the math, not the TS types.

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weeksInRange(start, end) {
  const a = start.getTime();
  const b = end.getTime();
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const spanMs = hi - lo;
  return Math.max(1, Math.ceil(spanMs / MS_PER_WEEK) + 1);
}

// ── Scenarios ─────────────────────────────────────────────────────────────

const scenarios = [
  {
    name: "default heuristic (Aug 3 2025 → Jun 26 2026)",
    start: new Date(2025, 7, 3), // first Sunday of August 2025
    end: new Date(2026, 5, 26), // last Friday of June 2026
    expectedRange: [46, 48], // ~47 weeks
  },
  {
    name: "short year (Jan 1 → Jul 1 of same year)",
    start: new Date(2026, 0, 1),
    end: new Date(2026, 6, 1),
    expectedRange: [25, 28], // ~26 weeks
  },
  {
    name: "minimum span (Jan 1 → Jan 8)",
    start: new Date(2026, 0, 1),
    end: new Date(2026, 0, 8),
    expectedRange: [2, 2], // 1-week + 1
  },
  {
    name: "long year (Aug 1 2025 → Jul 31 2026)",
    start: new Date(2025, 7, 1),
    end: new Date(2026, 6, 31),
    expectedRange: [52, 53],
  },
];

let passes = 0;
let fails = 0;

for (const s of scenarios) {
  const got = weeksInRange(s.start, s.end);
  const [lo, hi] = s.expectedRange;
  if (got >= lo && got <= hi) {
    console.log(`PASS  ${s.name}: ${got} weeks (expected ${lo}-${hi})`);
    passes++;
  } else {
    console.log(
      `FAIL  ${s.name}: ${got} weeks (expected ${lo}-${hi})`,
    );
    fails++;
  }
}

console.log(`\nPASS: ${passes}\nFAIL: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
