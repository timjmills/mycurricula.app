import { describe, it, expect } from "vitest";

import { dayEmptyKind, type DayEmptyKind } from "@/components/day-v2/day-empty";
import { plannerDataStateFromHydration } from "@/lib/planner-store";

// Regression tests for the /daily false-empty (live production Major,
// 2026-07-25): DayA/DayB/DayC each branched on `dayLessons.length === 0` alone,
// so for the ~9.5–11.6s Supabase hydrate /daily asserted "No lessons planned for
// this day." on a teacher's real timetable. Reproduced 4/4 on production.
//
// These exercise the pure decision only — vitest runs `environment: "node"` and
// cannot render React, so the three frames' JSX is out of reach here. What IS in
// reach is the rule they all now delegate to, which is where the bug actually
// lived. The §4a reviewer asked for coverage of all three hydration states and
// of the "no selection but the day HAS lessons" path; both are below.

describe("dayEmptyKind — loading is never reported as empty", () => {
  it("reports loading while the hydrate is in flight, empty day or not", () => {
    expect(dayEmptyKind("pending", false)).toBe<DayEmptyKind>("loading");
    expect(dayEmptyKind("pending", true)).toBe<DayEmptyKind>("loading");
  });

  it("never returns 'empty' for a pending store — the shipped bug", () => {
    expect(dayEmptyKind("pending", false)).not.toBe("empty");
  });

  it("maps the store's own hydration phases, not a hand-copied list", () => {
    // Pins this to the store's mapping: if "idle"/"loading" ever stopped
    // meaning "pending", the guard would silently go back to asserting empty.
    for (const phase of ["idle", "loading"] as const) {
      expect(dayEmptyKind(plannerDataStateFromHydration(phase), false)).toBe(
        "loading",
      );
    }
  });
});

describe("dayEmptyKind — a failed hydrate is not an empty day", () => {
  it("reports error rather than empty", () => {
    expect(dayEmptyKind("error", false)).toBe<DayEmptyKind>("error");
    expect(dayEmptyKind("error", true)).toBe<DayEmptyKind>("error");
  });

  it("agrees with the store's error phase", () => {
    expect(dayEmptyKind(plannerDataStateFromHydration("error"), false)).toBe(
      "error",
    );
  });
});

describe("dayEmptyKind — a genuinely empty day STILL says so", () => {
  // The failure mode opposite the one being fixed, and the likelier mistake:
  // replacing the lie with a permanent skeleton passes any test that only
  // checks the false message is gone, and strands an empty day loading forever.
  it("reports empty once settled with no lessons", () => {
    expect(dayEmptyKind("settled", false)).toBe<DayEmptyKind>("empty");
  });

  it("treats both settled hydration phases as settled", () => {
    for (const phase of ["ready", "empty"] as const) {
      expect(dayEmptyKind(plannerDataStateFromHydration(phase), false)).toBe(
        "empty",
      );
    }
  });
});

describe("dayEmptyKind — never claims empty when the day has lessons", () => {
  // DayB/DayC render this slot when pickFocus() returns undefined. That happens
  // today only for an empty day, but the component takes `hasLessons` directly
  // so a future change to that fallback chain degrades to silence, not to a
  // fresh false-empty (§4a Medium).
  it("says nothing when lessons exist", () => {
    expect(dayEmptyKind("settled", true)).toBe<DayEmptyKind>("none");
  });

  it("is exhaustive — every (state, hasLessons) pair has a defined answer", () => {
    const states = ["pending", "error", "settled"] as const;
    const kinds = new Set<DayEmptyKind>();
    for (const s of states) {
      for (const has of [true, false]) {
        const kind = dayEmptyKind(s, has);
        expect(["loading", "error", "empty", "none"]).toContain(kind);
        kinds.add(kind);
      }
    }
    // All four arms are reachable; a collapsed branch would drop one.
    expect(kinds.size).toBe(4);
  });
});
