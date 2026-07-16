import { describe, it, expect } from "vitest";

import {
  deriveWeekPeriods,
  parseTimeLabel,
  assignLessonPeriod,
  periodForDay,
  retimeLabel,
  UNSCHEDULED,
  type WeekPeriod,
} from "@/lib/week-edit-periods";
import { getDayBlocks } from "@/lib/schedule-data";

// Pure derivation/parsing tests for the W3.8c period-aligned Week EDIT board.
// The units read only the hand-authored Sun–Thu schedule fixture
// (lib/schedule-data) + the subject time-label fallback (lib/mock/schedule) —
// no React, no DOM. The mock academic-block start minutes are:
//   Sun/Mon: 8:00 9:00 10:20 12:20 13:10 14:10
//   Tue:     8:00 9:00 10:20 12:20 13:00 14:15
//   Wed:     8:00 9:00 10:20 12:20 13:15
//   Thu:     8:00 9:00 10:40

describe("deriveWeekPeriods", () => {
  it("sweep-clusters staggered starts into shared period rows, sorted", () => {
    const periods = deriveWeekPeriods([0, 1, 2, 3, 4]);
    // 10 distinct academic start minutes across the five days fold into 6
    // rows: starts within 30min of a cluster's first start merge (620+640,
    // 780+790+795, 850+855) — the design mock's ~6 shared periods, so day
    // columns fill flush instead of scattering across near-duplicate rows.
    expect(periods.map((p) => p.startMin)).toEqual([
      480, 540, 620, 740, 780, 850,
    ]);
    // First row is the 8:00 band; labels are 12h with no am/pm marker.
    expect(periods[0]).toMatchObject({
      key: "p-480",
      startMin: 480,
      label: "8:00",
    });
    // A cluster's end spans its LATEST member end (620 row absorbs the 640
    // block ending 680).
    expect(periods.find((p) => p.startMin === 620)?.endMin).toBe(680);
  });

  it("spans a shared start to the LONGEST end when days differ", () => {
    // 9:00 band: most days end 9:50 (590) but Thursday reading runs to 10:10
    // (610) — the derived row takes the widest end.
    const periods = deriveWeekPeriods([0, 1, 2, 3, 4]);
    const nine = periods.find((p) => p.startMin === 540);
    expect(nine?.endMin).toBe(610);
  });

  it("derives only the blocks present for a single day", () => {
    // Thursday: 8:00, 9:00, 10:40.
    const periods = deriveWeekPeriods([4]);
    expect(periods.map((p) => p.startMin)).toEqual([480, 540, 640]);
  });

  it("ignores non-academic blocks (recess, lunch, specials)", () => {
    // Sunday has a 09:50 snack + 11:10 specialist etc.; none become periods.
    const starts = deriveWeekPeriods([0]).map((p) => p.startMin);
    expect(starts).toEqual([480, 540, 620, 740, 790, 850]);
  });

  it("returns [] for a day with no schedule", () => {
    expect(deriveWeekPeriods([99])).toEqual([]);
  });

  it("takes ABSOLUTE Sun-first weekday keys, not configured-week positions", () => {
    // A Tue+Wed school week passes keys [2,3] (WEEKDAY_INDEX), never
    // positions [0,1] — the results differ: Sun/Mon carry 13:10 (790) and
    // 14:10 (850) starts that Tue/Wed do not, while Tue/Wed carry 13:00
    // (780, absorbing 13:15/795 into its cluster) and 14:15 (855). The board
    // maps tokens through WEEKDAY_INDEX before calling this (Codex gate R3 —
    // a Mon–Fri school must pull Monday's blocks for its first column, not
    // Sunday's).
    expect(deriveWeekPeriods([2, 3]).map((p) => p.startMin)).toEqual([
      480, 540, 620, 740, 780, 855,
    ]);
    expect(deriveWeekPeriods([0, 1]).map((p) => p.startMin)).toEqual([
      480, 540, 620, 740, 790, 850,
    ]);
  });
});

describe("parseTimeLabel", () => {
  it("parses an en-dash range", () => {
    expect(parseTimeLabel("8:10–9:10")).toEqual({ startMin: 490, endMin: 550 });
  });

  it("parses a hyphen range", () => {
    expect(parseTimeLabel("8:10-9:10")).toEqual({ startMin: 490, endMin: 550 });
  });

  it("parses an em-dash range", () => {
    expect(parseTimeLabel("9:40—10:00")).toEqual({
      startMin: 580,
      endMin: 600,
    });
  });

  it("applies the PM heuristic to hours below 7 (+12)", () => {
    // "12:20–1:10" → 12:20 stays AM/noon, 1:10 becomes 13:10.
    expect(parseTimeLabel("12:20–1:10")).toEqual({
      startMin: 740,
      endMin: 790,
    });
  });

  it("rejects am/pm markers", () => {
    expect(parseTimeLabel("8:10–9:10 AM")).toBeNull();
  });

  it("rejects a single time (no range)", () => {
    expect(parseTimeLabel("8:10")).toBeNull();
  });

  it("rejects garbage and empty", () => {
    expect(parseTimeLabel("lunch")).toBeNull();
    expect(parseTimeLabel("")).toBeNull();
    expect(parseTimeLabel("25:99–8:00")).toBeNull();
  });
});

describe("assignLessonPeriod", () => {
  const periods = deriveWeekPeriods([0, 1, 2, 3, 4]);

  it("(a) assigns by the lesson's own parsed time label", () => {
    const key = assignLessonPeriod(
      { subject: "math", time: "8:00–9:00" },
      periods,
      getDayBlocks(0),
    );
    expect(key).toBe("p-480");
  });

  it("(a) falls back to the subject default label when time is absent", () => {
    // SUBJECT_TIME.math = "8:10–9:10" → 8:10 falls inside the 8:00 band.
    const key = assignLessonPeriod(
      { subject: "math" },
      periods,
      getDayBlocks(0),
    );
    expect(key).toBe("p-480");
  });

  it("(b) uses the subject's academic block when the label is unparseable", () => {
    // A present-but-garbage label bypasses (a); math meets at 8:00 on Sunday.
    const key = assignLessonPeriod(
      { subject: "math", time: "TBD" },
      periods,
      getDayBlocks(0),
    );
    expect(key).toBe("p-480");
  });

  it("(c) returns UNSCHEDULED when neither label nor a subject block resolves", () => {
    const key = assignLessonPeriod(
      { subject: "sel", time: "TBD" },
      periods,
      [], // no blocks that day → no subject match
    );
    expect(key).toBe(UNSCHEDULED);
  });

  it("assigns to the NEAREST period when no band contains the start", () => {
    // 7:30 (450) precedes every band; nearest start is 8:00 (480).
    const key = assignLessonPeriod(
      { subject: "math", time: "7:30–8:00" },
      periods,
      getDayBlocks(0),
    );
    expect(key).toBe("p-480");
  });

  it("returns UNSCHEDULED when there are no periods at all", () => {
    expect(assignLessonPeriod({ subject: "math" }, [], getDayBlocks(0))).toBe(
      UNSCHEDULED,
    );
  });
});

describe("retimeLabel", () => {
  const target: WeekPeriod = {
    key: "p-790",
    startMin: 790,
    endMin: 820,
    label: "1:10",
  };

  it("preserves the current label's duration, restarting at the period", () => {
    // 60-minute lesson → 13:10–14:10 → "1:10–2:10".
    expect(retimeLabel("8:10–9:10", target, undefined)).toBe("1:10–2:10");
  });

  it("uses the subject fallback duration when there is no current label", () => {
    const p: WeekPeriod = {
      key: "p-480",
      startMin: 480,
      endMin: 540,
      label: "8:00",
    };
    // fallback 60 min → 8:00–9:00.
    expect(retimeLabel(undefined, p, "10:00–11:00")).toBe("8:00–9:00");
  });

  it("uses the target period length when no label resolves, floored at 30", () => {
    const short: WeekPeriod = {
      key: "p-480",
      startMin: 480,
      endMin: 500,
      label: "8:00",
    };
    // 20-minute band floors to a 30-minute lesson → 8:00–8:30.
    expect(retimeLabel(undefined, short, undefined)).toBe("8:00–8:30");
  });

  it("falls back to a 45-minute default when the period has no length", () => {
    const degenerate: WeekPeriod = {
      key: "p-480",
      startMin: 480,
      endMin: 480,
      label: "8:00",
    };
    expect(retimeLabel(undefined, degenerate, undefined)).toBe("8:00–8:45");
  });

  it("floors a too-short current duration at 30 minutes", () => {
    const p: WeekPeriod = {
      key: "p-480",
      startMin: 480,
      endMin: 540,
      label: "8:00",
    };
    // 10-minute current label → floored to 30 → 8:00–8:30.
    expect(retimeLabel("8:00–8:10", p, undefined)).toBe("8:00–8:30");
  });
});

// ── Overlap regression (W3.8c adversarial-review HIGH) ─────────────────────
// The widest-end derivation rule produces OVERLAPPING bands on the real
// fixture (p-740[740,795] over p-780/p-790, p-620 over p-640, p-850 over
// p-855). A containing-first assignment let the earlier stretched band shadow
// the later rows — unreachable rows, and a re-time drop that silently
// re-resolved elsewhere (a phantom undo step + DB write with zero visible
// movement). Assignment is now NEAREST-START; these tests lock that in.
describe("overlapping-band assignment (nearest-start)", () => {
  const periods = deriveWeekPeriods([0, 1, 2, 3, 4]);

  it("every derived fixture row is reachable by a label starting at it", () => {
    for (const p of periods) {
      const label = `${p.label}–${p.label}`; // degenerate range, start = p.start
      const key = assignLessonPeriod(
        { subject: "math", time: label },
        periods,
        [],
      );
      expect(key).toBe(p.key);
    }
  });

  it("a 1:10 lesson lands in the 1:00 cluster row, not the 12:20 band", () => {
    // start 790: nearest cluster start is p-780 (Δ10), never p-740 (Δ50) —
    // even though the stretched 12:20 band CONTAINS 790 (containing-first
    // was the shadowing bug).
    const key = assignLessonPeriod(
      { subject: "math", time: "1:10–1:40" },
      periods,
      [],
    );
    expect(key).toBe("p-780");
  });

  it("a re-time drop is idempotent: the new label re-resolves to the dropped-on row", () => {
    for (const p of periods) {
      const newLabel = retimeLabel("8:10–9:10", p, undefined);
      const key = assignLessonPeriod(
        { subject: "math", time: newLabel },
        periods,
        [],
      );
      expect(key).toBe(p.key);
    }
  });

  it("ties between equidistant starts go to the earlier period", () => {
    // 8:30 (510) sits exactly between p-480 and p-540 → earlier wins.
    const key = assignLessonPeriod(
      { subject: "math", time: "8:30–9:00" },
      periods,
      [],
    );
    expect(key).toBe("p-480");
  });

  it("every merged-away fixture start still assigns to its own cluster", () => {
    // The clusters absorb 640→620, 790/795→780, 855→850; a lesson whose
    // label carries the absorbed start must land in the absorbing row.
    const cases: Array<[string, string]> = [
      ["10:40–11:20", "p-620"],
      ["1:10–1:40", "p-780"],
      ["1:15–1:45", "p-780"],
      ["2:15–3:00", "p-850"],
    ];
    for (const [label, expected] of cases) {
      expect(
        assignLessonPeriod({ subject: "math", time: label }, periods, []),
      ).toBe(expected);
    }
  });
});

// ── Cluster → destination-day resolution (Codex, clustering batch) ─────────
// A cluster key identifies a VISUAL row; the re-time on a drop must write the
// destination day's actual block start within the band, not the cluster's
// earliest member.
describe("periodForDay + cross-day retime", () => {
  const periods = deriveWeekPeriods([0, 1, 2, 3, 4]);
  const p780 = periods.find((p) => p.key === "p-780")!;

  it("resolves the merged 1:00 row to Sunday's real 13:10 block", () => {
    const sunday = periodForDay(p780, getDayBlocks(0));
    expect(sunday.startMin).toBe(790);
    expect(sunday.label).toBe("1:10");
    expect(sunday.key).toBe("p-780"); // the row identity is unchanged
  });

  it("resolves the same row to Tuesday's real 13:00 block", () => {
    const tuesday = periodForDay(p780, getDayBlocks(2));
    expect(tuesday.startMin).toBe(780);
  });

  it("falls back to the cluster's own timing when the day has no block in the band", () => {
    // Thursday has no academic block in the 13:00 band.
    const thursday = periodForDay(p780, getDayBlocks(4));
    expect(thursday.startMin).toBe(p780.startMin);
  });

  it("cross-day retime writes the day-resolved start, keeps duration, and re-resolves to the same row", () => {
    const sunday = periodForDay(p780, getDayBlocks(0));
    // A 45-minute 13:00 lesson dropped on Sunday's row → 13:10 start.
    const label = retimeLabel("1:00–1:45", sunday, undefined);
    expect(label).toBe("1:10–1:55");
    // The written label re-resolves to the SAME visual cluster (idempotent).
    expect(
      assignLessonPeriod({ subject: "math", time: label }, periods, []),
    ).toBe("p-780");
  });
});
