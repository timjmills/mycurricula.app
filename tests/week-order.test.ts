import { describe, it, expect } from "vitest";

import { orderedWeekdaysFrom } from "@/lib/week-order";
import {
  DEFAULT_SCHOOL_WEEK,
  WEEKDAY_ORDER,
  SCHOOL_WEEK_PRESETS,
  detectSchoolWeekPreset,
} from "@/lib/use-school-week";

// Tests for the ordered-week contract (audit finding #16). These exercise the
// pure helpers/constants only — the React hooks (useSchoolWeek /
// useOrderedWeekdays) are not invoked under node.

describe("school week — default configuration", () => {
  it("defaults to Sun–Thu = 5 days", () => {
    expect(DEFAULT_SCHOOL_WEEK.length).toBe(5);
    expect([...DEFAULT_SCHOOL_WEEK]).toEqual(["sun", "mon", "tue", "wed", "thu"]);
  });

  it("knows all seven weekdays in Sun-first order", () => {
    expect([...WEEKDAY_ORDER]).toEqual([
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ]);
  });
});

describe("orderedWeekdaysFrom — preserves configured order + indexes", () => {
  it("returns the configured days in order with 0-based indexes and labels", () => {
    const out = orderedWeekdaysFrom([...DEFAULT_SCHOOL_WEEK]);
    expect(out.length).toBe(5);
    expect(out.map((d) => d.token)).toEqual(["sun", "mon", "tue", "wed", "thu"]);
    expect(out.map((d) => d.index)).toEqual([0, 1, 2, 3, 4]);
    expect(out[0].label).toBe("Sun");
    expect(out[0].longLabel).toBe("Sunday");
    expect(out[4].longLabel).toBe("Thursday");
  });

  it("respects a non-default (Mon–Fri) week without reordering to Sun-first", () => {
    const out = orderedWeekdaysFrom(["mon", "tue", "wed", "thu", "fri"]);
    expect(out.map((d) => d.token)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    // index is positional within the configured week, not absolute Sun=0.
    expect(out[0].index).toBe(0);
    expect(out[0].label).toBe("Mon");
  });

  it("supports a custom short (3-day) week", () => {
    const out = orderedWeekdaysFrom(["sun", "tue", "thu"]);
    expect(out.length).toBe(3);
    expect(out.map((d) => d.index)).toEqual([0, 1, 2]);
  });
});

describe("detectSchoolWeekPreset — matches presets order-insensitively", () => {
  it("detects sunThu / monFri presets", () => {
    expect(detectSchoolWeekPreset([...SCHOOL_WEEK_PRESETS.sunThu])).toBe(
      "sunThu",
    );
    expect(detectSchoolWeekPreset([...SCHOOL_WEEK_PRESETS.monFri])).toBe(
      "monFri",
    );
  });

  it("returns 'custom' for a non-matching selection", () => {
    expect(detectSchoolWeekPreset(["sun", "tue", "thu"])).toBe("custom");
  });
});
