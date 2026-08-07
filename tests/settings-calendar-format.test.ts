// Tests for lib/settings-calendar-format — the pure copy helpers behind the
// Settings → Calendar Undo toasts (audit 2026-07-31 §C1).
//
// These strings are the ONLY feedback a teacher gets for a change that
// auto-persists with no Save button, so a wrong date or a wrong weekday list
// is a wrong statement about a write that already happened.
//
// Imports the module — it does not read any file from disk, so there is no
// "test reads a file it wasn't committed with" hazard here.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatIsoDate, summarizeWeek } from "@/lib/settings-calendar-format";
import type { Weekday } from "@/lib/use-school-week";

describe("formatIsoDate", () => {
  // ── Timezone pin ────────────────────────────────────────────────────────
  // The UTC-shift bug is only OBSERVABLE from a negative UTC offset: parsing
  // "2026-03-05" as UTC midnight still lands on the 5th anywhere east of
  // Greenwich. This dev machine runs at UTC+1, so an unpinned assertion
  // passes whether or not the bug is present — it was written that way first
  // and a mutation test caught it passing against a deliberately broken
  // implementation. Pinning to a western zone makes the check real
  // everywhere, including CI, whose timezone we do not control.
  //
  // Node re-reads process.env.TZ per Date operation (verified on this
  // runtime), so setting it here genuinely changes the zone under test.
  const REAL_TZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York"; // UTC-5 / -4
  });
  afterAll(() => {
    if (REAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = REAL_TZ;
  });

  it("is actually running in a negative-offset zone", () => {
    // Guards the guard. If a future runtime stops honouring a runtime TZ
    // change, the pin above would silently no-op and the next assertion
    // would go back to being vacuous — failing OPEN. This fails LOUD
    // instead. getTimezoneOffset is positive for zones west of UTC.
    expect(new Date(2026, 2, 5).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it("renders the LOCAL calendar date, not a UTC-shifted one", () => {
    // The regression this guards: `new Date("2026-03-05")` is UTC midnight,
    // which is 2026-03-04 in the pinned zone. Constructing from (y, m-1, d)
    // keeps the day the teacher actually typed.
    const out = formatIsoDate("2026-03-05");
    expect(out).toContain("5");
    expect(out).not.toContain("4");
  });

  it("includes the year and a month name", () => {
    const out = formatIsoDate("2026-03-05");
    expect(out).toContain("2026");
    // toLocaleDateString with month:"short" never emits a bare number here.
    expect(out).toMatch(/[A-Za-z]{3}/);
  });

  it("returns malformed input unchanged instead of 'Invalid Date'", () => {
    expect(formatIsoDate("")).toBe("");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
    expect(formatIsoDate("2026-03")).toBe("2026-03");
  });

  it("rejects zero month and zero day (outside the 1-based calendar)", () => {
    expect(formatIsoDate("2026-00-05")).toBe("2026-00-05");
    expect(formatIsoDate("2026-03-00")).toBe("2026-03-00");
  });

  it("rejects impossible calendar dates instead of rolling them over (§4a Low)", () => {
    // JS Date happily normalizes Feb 31 → Mar 3; displaying that would show
    // a real date the stored string never said. Must come back verbatim.
    expect(formatIsoDate("2026-02-31")).toBe("2026-02-31");
    expect(formatIsoDate("2026-13-05")).toBe("2026-13-05");
    expect(formatIsoDate("2025-02-29")).toBe("2025-02-29"); // not a leap year
  });

  it("accepts a real leap day", () => {
    expect(formatIsoDate("2028-02-29")).toContain("2028");
  });

  it("rejects near-miss shapes: trailing junk and off-width segments", () => {
    expect(formatIsoDate("2026-03-05x")).toBe("2026-03-05x");
    expect(formatIsoDate("02026-03-05")).toBe("02026-03-05");
    expect(formatIsoDate("2026-3-05")).toBe("2026-3-05");
    expect(formatIsoDate(" 2026-03-05")).toBe(" 2026-03-05");
  });
});

describe("summarizeWeek", () => {
  it("emits Sun-first order regardless of the input order", () => {
    // The point of the helper: the teacher may click Thu before Sun, and the
    // sentence must still read Sun-first.
    const clicked: Weekday[] = ["thu", "sun", "wed", "mon", "tue"];
    expect(summarizeWeek(clicked)).toBe("Sun, Mon, Tue, Wed, Thu");
  });

  it("summarises a Mon–Fri week", () => {
    expect(summarizeWeek(["mon", "tue", "wed", "thu", "fri"])).toBe(
      "Mon, Tue, Wed, Thu, Fri",
    );
  });

  it("handles a non-5-day week — CLAUDE.md §1 forbids assuming five", () => {
    expect(summarizeWeek(["mon", "wed", "fri"])).toBe("Mon, Wed, Fri");
    expect(summarizeWeek(["sun", "mon", "tue", "wed", "thu", "fri"])).toBe(
      "Sun, Mon, Tue, Wed, Thu, Fri",
    );
  });

  it("collapses duplicates", () => {
    expect(summarizeWeek(["mon", "mon", "tue"])).toBe("Mon, Tue");
  });

  it("renders a sentence-safe phrase when the set is empty", () => {
    // Must never return "" — the caller interpolates this mid-sentence.
    expect(summarizeWeek([])).toBe("no school days");
  });

  it("summarises a single day without a trailing separator", () => {
    expect(summarizeWeek(["wed"])).toBe("Wed");
  });
});
