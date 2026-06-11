import { describe, it, expect } from "vitest";

import {
  buildWeeklyLink,
  buildDailyLink,
  buildSubjectLink,
  parseWeeklyParams,
  parseDailyParams,
  parseUnitHash,
} from "@/lib/deep-links";

// Tests for the deep-link URL scheme (6.12.26 UX roadmap item 07). All units
// are pure (URLSearchParams only — no React, no window), so they run under
// node like the rest of this suite.

/** Pull the query string off a builder's root-relative URL. */
function queryOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}

describe("weekly links — build → parse round trip", () => {
  it("round-trips a full link (week + subject + lesson + grade)", () => {
    const link = {
      week: 14,
      subject: "math" as const,
      lesson: "les-014-m2",
      grade: "5",
    };
    const url = buildWeeklyLink(link);
    expect(url.startsWith("/weekly?")).toBe(true);
    expect(parseWeeklyParams(queryOf(url))).toEqual(link);
  });

  it("omits absent optional params from the URL", () => {
    const url = buildWeeklyLink({ week: 14 });
    expect(url).toBe("/weekly?week=14");
    expect(parseWeeklyParams(queryOf(url))).toEqual({ week: 14 });
  });

  it("rejects a missing or invalid week (required field ⇒ null)", () => {
    expect(parseWeeklyParams(new URLSearchParams(""))).toBeNull();
    expect(parseWeeklyParams(new URLSearchParams("week=abc"))).toBeNull();
    expect(parseWeeklyParams(new URLSearchParams("week=0"))).toBeNull();
    expect(parseWeeklyParams(new URLSearchParams("week=-3"))).toBeNull();
    expect(parseWeeklyParams(new URLSearchParams("week=2.5"))).toBeNull();
  });

  it("drops an unknown subject but keeps the rest (optional field ⇒ omit)", () => {
    const parsed = parseWeeklyParams(
      new URLSearchParams("week=14&subject=potions&grade=5"),
    );
    expect(parsed).toEqual({ week: 14, grade: "5" });
  });

  it("accepts every one of the 8 locked subject ids", () => {
    const ids = [
      "math",
      "reading",
      "writing",
      "grammar",
      "spelling",
      "ufli",
      "explorers",
      "sel",
    ] as const;
    for (const subject of ids) {
      const parsed = parseWeeklyParams(queryOf(buildWeeklyLink({ week: 1, subject }))); // prettier-ignore
      expect(parsed?.subject).toBe(subject);
    }
  });

  it("URL-encodes lesson ids with reserved characters and round-trips them", () => {
    const lesson = "les 14/m&2+x";
    const url = buildWeeklyLink({ week: 14, lesson });
    expect(url).not.toContain("les 14"); // raw space must be encoded
    expect(parseWeeklyParams(queryOf(url))?.lesson).toBe(lesson);
  });

  it("passes an arbitrary grade slug through verbatim", () => {
    const url = buildWeeklyLink({ week: 3, grade: "grade-5b" });
    expect(parseWeeklyParams(queryOf(url))?.grade).toBe("grade-5b");
  });
});

describe("daily links — build → parse round trip", () => {
  it("round-trips a full link (date + lesson + grade)", () => {
    const link = { date: "2026-09-14", lesson: "les-014-m2", grade: "5" };
    const url = buildDailyLink(link);
    expect(url.startsWith("/daily?")).toBe(true);
    expect(parseDailyParams(queryOf(url))).toEqual(link);
  });

  it("omits absent optional params from the URL", () => {
    const url = buildDailyLink({ date: "2026-09-14" });
    expect(url).toBe("/daily?date=2026-09-14");
    expect(parseDailyParams(queryOf(url))).toEqual({ date: "2026-09-14" });
  });

  it("rejects a missing or malformed date (required field ⇒ null)", () => {
    expect(parseDailyParams(new URLSearchParams(""))).toBeNull();
    expect(parseDailyParams(new URLSearchParams("date=tomorrow"))).toBeNull();
    expect(parseDailyParams(new URLSearchParams("date=2026-9-14"))).toBeNull();
    expect(parseDailyParams(new URLSearchParams("date=14-09-2026"))).toBeNull();
    expect(
      parseDailyParams(new URLSearchParams("date=2026-09-14T08:00")),
    ).toBeNull();
  });

  it("keeps the date when an optional field is empty (dropped, not fatal)", () => {
    const parsed = parseDailyParams(
      new URLSearchParams("date=2026-09-14&lesson="),
    );
    expect(parsed).toEqual({ date: "2026-09-14" });
  });

  it("URL-encodes lesson ids and round-trips them", () => {
    const lesson = "unit 3 — day 2?";
    const url = buildDailyLink({ date: "2026-09-14", lesson });
    expect(parseDailyParams(queryOf(url))?.lesson).toBe(lesson);
  });
});

describe("subject links — build + unit hash", () => {
  it("builds a bare subject link without a hash", () => {
    expect(buildSubjectLink({ subject: "math" })).toBe("/subject/math");
  });

  it("builds and parses the #unit-N hash round trip", () => {
    const url = buildSubjectLink({ subject: "math", unit: 3 });
    expect(url).toBe("/subject/math#unit-3");
    const hash = url.slice(url.indexOf("#"));
    expect(parseUnitHash(hash)).toBe(3);
  });

  it("accepts the fragment with or without the leading #", () => {
    expect(parseUnitHash("#unit-12")).toBe(12);
    expect(parseUnitHash("unit-12")).toBe(12);
  });

  it("rejects malformed unit hashes", () => {
    expect(parseUnitHash("")).toBeNull();
    expect(parseUnitHash("#unit-")).toBeNull();
    expect(parseUnitHash("#unit-abc")).toBeNull();
    expect(parseUnitHash("#unit-0")).toBeNull();
    expect(parseUnitHash("#unit--3")).toBeNull();
    expect(parseUnitHash("#section-3")).toBeNull();
  });
});

describe("review-gate hardening (M4 + L6)", () => {
  it("rejects impossible calendar dates", () => {
    for (const bad of [
      "2026-99-99",
      "2026-00-10",
      "2026-13-01",
      "2026-02-00",
    ]) {
      const params = new URLSearchParams({ date: bad });
      expect(parseDailyParams(params)).toBeNull();
    }
  });

  it("caps absurd week numbers in the parser", () => {
    expect(
      parseWeeklyParams(new URLSearchParams({ week: "100000000000000000000" })),
    ).toBeNull();
    expect(parseWeeklyParams(new URLSearchParams({ week: "99" }))).toEqual({
      week: 99,
    });
  });

  it("builders throw on inputs their own parsers would reject", () => {
    expect(() => buildWeeklyLink({ week: 0 })).toThrow();
    expect(() => buildWeeklyLink({ week: 1.5 })).toThrow();
    expect(() => buildDailyLink({ date: "2026-99-99" })).toThrow();
    expect(() => buildSubjectLink({ subject: "math", unit: 0 })).toThrow();
  });
});
