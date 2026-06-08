// Unit tests for the pure title-collision + width-clamp helpers in
// lib/teach/supabase-source.ts. Once Teach runs on Supabase these guard the
// uniq_boards_{personal,team}_lesson_title indexes (a collision after the
// delete-then-reinsert flows would corrupt a board set) and the persisted
// canvas width. They import the REAL source helpers (not copies) so the suite
// catches any future drift.
import { describe, it, expect } from "vitest";
import {
  clampWidth,
  firstFreeTitle,
  suffixSequence,
  copySequence,
  stripNames,
} from "../lib/teach/supabase-source";

describe("suffixSequence + firstFreeTitle (personal/team title de-dup)", () => {
  it("returns the bare title when free", () => {
    expect(firstFreeTitle(new Set(), suffixSequence("Whiteboard"))).toBe(
      "Whiteboard",
    );
  });
  it("first collision → ' (2)' (not ' (1)')", () => {
    expect(
      firstFreeTitle(new Set(["Whiteboard"]), suffixSequence("Whiteboard")),
    ).toBe("Whiteboard (2)");
  });
  it("walks past a run of taken titles", () => {
    expect(
      firstFreeTitle(
        new Set(["Whiteboard", "Whiteboard (2)", "Whiteboard (3)"]),
        suffixSequence("Whiteboard"),
      ),
    ).toBe("Whiteboard (4)");
  });
  it("fills an interior gap (does not skip)", () => {
    expect(
      firstFreeTitle(
        new Set(["Whiteboard", "Whiteboard (2)"]),
        suffixSequence("Whiteboard"),
      ),
    ).toBe("Whiteboard (3)");
  });
  it("title already ending in (2) is left bare when free", () => {
    expect(
      firstFreeTitle(new Set(["Board"]), suffixSequence("Board (2)")),
    ).toBe("Board (2)");
  });
  it("title already ending in (2) AND taken → ' (2) (2)'", () => {
    expect(
      firstFreeTitle(new Set(["Board (2)"]), suffixSequence("Board (2)")),
    ).toBe("Board (2) (2)");
  });
});

describe("copySequence (duplicateBoard)", () => {
  it("first copy → '(copy)'", () => {
    expect(firstFreeTitle(new Set(), copySequence("Lesson Plan"))).toBe(
      "Lesson Plan (copy)",
    );
  });
  it("second copy → '(copy 2)' when '(copy)' is taken", () => {
    expect(
      firstFreeTitle(
        new Set(["Lesson Plan (copy)"]),
        copySequence("Lesson Plan"),
      ),
    ).toBe("Lesson Plan (copy 2)");
  });
  it("third copy → '(copy 3)'", () => {
    expect(
      firstFreeTitle(
        new Set(["Lesson Plan (copy)", "Lesson Plan (copy 2)"]),
        copySequence("Lesson Plan"),
      ),
    ).toBe("Lesson Plan (copy 3)");
  });
});

describe("clampWidth (canvas width 230–640, NaN-safe)", () => {
  it("NaN → 320 fallback", () => expect(clampWidth(NaN)).toBe(320));
  it("+Infinity → 320", () => expect(clampWidth(Infinity)).toBe(320));
  it("-Infinity → 320", () => expect(clampWidth(-Infinity)).toBe(320));
  it("below range clamps up to 230", () => expect(clampWidth(10)).toBe(230));
  it("above range clamps down to 640", () =>
    expect(clampWidth(9999)).toBe(640));
  it("in-range value is rounded", () => expect(clampWidth(412.6)).toBe(413));
  it("boundaries pass through", () => {
    expect(clampWidth(230)).toBe(230);
    expect(clampWidth(640)).toBe(640);
  });
});

describe("pushBoardsToTeam in-memory title resolution (composed primitives)", () => {
  // Mirrors how pushBoardsToTeam resolves all titles against an accumulating
  // set BEFORE the destructive delete, using the real firstFreeTitle/suffix.
  function resolve(titles: string[]): string[] {
    const taken = new Set<string>();
    return titles.map((t) => {
      const title = firstFreeTitle(taken, suffixSequence(t));
      taken.add(title);
      return title;
    });
  }
  it("dedups identical titles within the pushed set", () => {
    expect(resolve(["Whiteboard", "Whiteboard", "Whiteboard"])).toEqual([
      "Whiteboard",
      "Whiteboard (2)",
      "Whiteboard (3)",
    ]);
  });
  it("distinct titles pass through, order preserved", () => {
    expect(resolve(["Warm-Up", "Mini Lesson", "Exit Ticket"])).toEqual([
      "Warm-Up",
      "Mini Lesson",
      "Exit Ticket",
    ]);
  });
  it("mixed + pre-suffixed collisions all stay unique", () => {
    const out = resolve(["A", "A (2)", "A"]);
    expect(out).toEqual(["A", "A (2)", "A (3)"]);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("stripNames (recursive structure-only privacy strip — audit F10/H3)", () => {
  it("drops top-level name-bearing keys, keeps structure", () => {
    expect(stripNames({ names: ["a", "b"], count: 3 })).toEqual({ count: 3 });
  });
  it("drops name-bearing keys nested in objects AND arrays at any depth", () => {
    expect(
      stripNames({ groups: [{ id: "g1", members: ["x", "y"] }], slots: 2 }),
    ).toEqual({ groups: [{ id: "g1" }], slots: 2 });
  });
  it("strips every NAME_BEARING_KEY (case-insensitive)", () => {
    expect(
      stripNames({
        Names: 1,
        ROSTER: 2,
        students: 3,
        studentNames: 4,
        Members: 5,
        keep: 6,
      }),
    ).toEqual({ keep: 6 });
  });
  it("leaves non-name structure untouched", () => {
    const input = { layout: { cols: 2, labels: ["A", "B"] }, slots: 4 };
    expect(stripNames(input)).toEqual(input);
  });
  it("does not descend into non-plain objects (no throw / no data loss)", () => {
    const when = new Date("2026-01-01T00:00:00.000Z");
    expect(stripNames({ when, members: ["z"] })).toEqual({ when });
  });
});
