import { describe, it, expect } from "vitest";

import {
  canCompareWithTeam,
  diffLessonAgainstMaster,
  snapshotRestorePatch,
  stripToText,
  type DiffableLesson,
} from "@/lib/fork-diff";
import type { LessonMasterSnapshot } from "@/lib/types";
import { orderedWeekdaysFrom } from "@/lib/week-order";
import { DEFAULT_SCHOOL_WEEK } from "@/lib/use-school-week";

// Tests for the roadmap-01 fork-diff engine. Pure helpers only — the
// ForkDiffPanel React component is verified in the browser; everything it
// decides FROM (which fields diverged, what text shows, when the entry
// points appear) is decided here.

// ── Fixtures ───────────────────────────────────────────────────────────────

/** dayLabel wired exactly as the panel wires it: configured school week →
 *  full weekday name. Default config = Sun–Thu, so day 1 = "Monday". The
 *  resolver is INJECTED (never imported from view code) per the module
 *  contract — this fixture is the proof it stays swappable. */
const days = orderedWeekdaysFrom([...DEFAULT_SCHOOL_WEEK]);
const dayLabel = (d: number): string => days[d]?.longLabel ?? `Day ${d + 1}`;

const baseLesson: DiffableLesson = {
  title: "Fractions as division — bake sale problem",
  objective: "I can interpret a fraction as division and model it two ways.",
  preview: "Anchor problem: 5 cookies shared by 4 friends.",
  standards: ["5.NF.B.3"],
  day: 1,
  week: 12,
};

/** A snapshot identical to baseLesson — the "no divergence" baseline. */
const identicalSnapshot: LessonMasterSnapshot = {
  title: baseLesson.title,
  objective: baseLesson.objective,
  preview: baseLesson.preview,
  standards: [...baseLesson.standards],
  day: baseLesson.day,
  week: baseLesson.week,
};

// ── stripToText ────────────────────────────────────────────────────────────

describe("stripToText — sanitized plain-text extraction", () => {
  it("passes plain text through unchanged", () => {
    expect(stripToText("Equivalent fractions")).toBe("Equivalent fractions");
  });

  it("strips formatting markup but keeps the words", () => {
    expect(stripToText("<b>Bold</b> and <em>italic</em> title")).toBe(
      "Bold and italic title",
    );
  });

  it("removes script payloads entirely (sanitizer boundary)", () => {
    expect(stripToText('<script>alert("x")</script>Safe part')).toBe(
      "Safe part",
    );
    expect(stripToText('<img src="x" onerror="alert(1)">Title')).toBe("Title");
  });

  it("decodes the editor's entities and collapses whitespace", () => {
    expect(stripToText("Tom&nbsp;&amp;&nbsp;Jerry   <br>  plan")).toBe(
      "Tom & Jerry plan",
    );
  });

  it("returns empty string for empty / non-string input", () => {
    expect(stripToText("")).toBe("");
    expect(stripToText(undefined as unknown as string)).toBe("");
  });
});

// ── canCompareWithTeam ─────────────────────────────────────────────────────

describe("canCompareWithTeam — entry-point predicate", () => {
  const snapshot = identicalSnapshot;

  it("true for a modified lesson with a snapshot", () => {
    expect(
      canCompareWithTeam({
        masterSnapshot: snapshot,
        modified: true,
        moved: null,
      }),
    ).toBe(true);
  });

  it("true for a moved-only lesson with a snapshot", () => {
    expect(
      canCompareWithTeam({
        masterSnapshot: snapshot,
        modified: false,
        moved: "across-weeks",
      }),
    ).toBe(true);
  });

  it("false when the lesson never diverged (snapshot alone is not enough)", () => {
    expect(
      canCompareWithTeam({
        masterSnapshot: snapshot,
        modified: false,
        moved: null,
      }),
    ).toBe(false);
  });

  it("false when no snapshot exists, however modified the lesson is", () => {
    expect(canCompareWithTeam({ modified: true, moved: "same-week" })).toBe(
      false,
    );
  });
});

// ── snapshotRestorePatch ───────────────────────────────────────────────────
// The content half of the store's snapshot-aware restoreLesson reducer
// (roadmap-01 H1). COVERAGE NOTE: the reducer itself (its moveLesson
// placement delegation + CellLayout pruning + flag reset, and the
// flags-only fallback for snapshot-less lessons) is module-private to
// lib/planner-store.tsx and there is no store test-file pattern in tests/
// (the vitest gate runs pure node units only) — so the reducer path is
// asserted here via its pure helper, and the delegation half is verified
// in the browser. Closing that gap means exporting applyDocAction or a
// store harness; deferred with the Phase 1B lineage work.

describe("snapshotRestorePatch — whole-lesson restore content patch", () => {
  it("returns exactly the snapshot's captured content fields", () => {
    const snapshot: LessonMasterSnapshot = {
      ...identicalSnapshot,
      title: "Team title",
      objective: "I can do it the team's way.",
      preview: "Team preview",
      standards: ["5.NF.B.3", "5.NF.A.1"],
    };
    expect(snapshotRestorePatch(snapshot)).toEqual({
      title: "Team title",
      objective: "I can do it the team's way.",
      preview: "Team preview",
      standards: ["5.NF.B.3", "5.NF.A.1"],
    });
  });

  it("does NOT carry placement — day/week go through the store's move path", () => {
    const patch = snapshotRestorePatch(identicalSnapshot);
    expect("day" in patch).toBe(false);
    expect("week" in patch).toBe(false);
  });

  it("copies the standards array (never shares the snapshot's identity)", () => {
    const snapshot: LessonMasterSnapshot = {
      ...identicalSnapshot,
      standards: ["5.NF.B.3"],
    };
    const patch = snapshotRestorePatch(snapshot);
    expect(patch.standards).toEqual(snapshot.standards);
    expect(patch.standards).not.toBe(snapshot.standards);
  });
});

// ── diffLessonAgainstMaster ────────────────────────────────────────────────

describe("diffLessonAgainstMaster — modified tier", () => {
  it("reports each divergent content field with both sides as plain text", () => {
    const snapshot: LessonMasterSnapshot = {
      ...identicalSnapshot,
      title: "Fractions as division — sharing problems",
      objective: "I can interpret a fraction as division.",
    };
    const diffs = diffLessonAgainstMaster(baseLesson, snapshot, { dayLabel });
    expect(diffs.map((d) => d.field)).toEqual(["title", "objective"]);
    expect(diffs[0]).toEqual({
      field: "title",
      label: "Title",
      master: "Fractions as division — sharing problems",
      personal: "Fractions as division — bake sale problem",
    });
  });

  it("ignores markup-only changes (same words, different tags)", () => {
    const lesson = { ...baseLesson, title: "<b>Same</b> title" };
    const snapshot = { ...identicalSnapshot, title: "Same title" };
    expect(diffLessonAgainstMaster(lesson, snapshot, { dayLabel })).toEqual([]);
  });

  it("returns no rows when nothing diverged", () => {
    expect(
      diffLessonAgainstMaster(baseLesson, identicalSnapshot, { dayLabel }),
    ).toEqual([]);
  });
});

describe("diffLessonAgainstMaster — moved tier (scheduling)", () => {
  it("a moved-only lesson yields JUST the scheduling row", () => {
    const lesson = { ...baseLesson, day: 2, week: 12 };
    const diffs = diffLessonAgainstMaster(lesson, identicalSnapshot, {
      dayLabel,
    });
    expect(diffs).toEqual([
      {
        field: "scheduling",
        label: "Scheduling",
        master: "Monday · Week 12",
        personal: "Tuesday · Week 12",
      },
    ]);
  });

  it("an across-weeks move reports both week numbers", () => {
    const lesson = { ...baseLesson, day: 1, week: 13 };
    const [diff] = diffLessonAgainstMaster(lesson, identicalSnapshot, {
      dayLabel,
    });
    expect(diff.master).toBe("Monday · Week 12");
    expect(diff.personal).toBe("Monday · Week 13");
  });

  it("weekday names come from the INJECTED resolver, not a baked-in week", () => {
    // A custom 3-day school week: the same indices resolve differently.
    const custom = (d: number): string => ["Mon", "Wed", "Fri"][d] ?? `D${d}`;
    const lesson = { ...baseLesson, day: 2 };
    const [diff] = diffLessonAgainstMaster(lesson, identicalSnapshot, {
      dayLabel: custom,
    });
    expect(diff.master).toBe("Wed · Week 12");
    expect(diff.personal).toBe("Fri · Week 12");
  });
});

describe("diffLessonAgainstMaster — both tier", () => {
  it("reports content AND scheduling rows, content first", () => {
    const lesson = { ...baseLesson, title: "My retitled lesson", day: 3 };
    const diffs = diffLessonAgainstMaster(lesson, identicalSnapshot, {
      dayLabel,
    });
    expect(diffs.map((d) => d.field)).toEqual(["title", "scheduling"]);
  });
});

describe("diffLessonAgainstMaster — standards", () => {
  it("compares standards as an order-insensitive set", () => {
    const lesson = { ...baseLesson, standards: ["5.NF.A.1", "5.NF.B.3"] };
    const snapshot = {
      ...identicalSnapshot,
      standards: ["5.NF.B.3", "5.NF.A.1"],
    };
    expect(diffLessonAgainstMaster(lesson, snapshot, { dayLabel })).toEqual([]);
  });

  it("reports added / removed codes, displayed in stored order", () => {
    const lesson = { ...baseLesson, standards: ["5.NF.B.3", "5.NF.B.4"] };
    const diffs = diffLessonAgainstMaster(lesson, identicalSnapshot, {
      dayLabel,
    });
    expect(diffs).toEqual([
      {
        field: "standards",
        label: "Standards",
        master: "5.NF.B.3",
        personal: "5.NF.B.3, 5.NF.B.4",
      },
    ]);
  });
});

describe("diffLessonAgainstMaster — sections", () => {
  it("renders a sections row only when BOTH sides are supplied", () => {
    const snapshot = { ...identicalSnapshot, sections: "Warm-up: counting" };

    // Caller did not supply live sections → no row.
    expect(diffLessonAgainstMaster(baseLesson, snapshot, { dayLabel })).toEqual(
      [],
    );

    // Snapshot has no sections → no row even when the caller supplies text.
    expect(
      diffLessonAgainstMaster(baseLesson, identicalSnapshot, {
        dayLabel,
        currentSectionsText: "Warm-up: skip counting",
      }),
    ).toEqual([]);

    // Both sides present and divergent → one "Lesson flow" row.
    const diffs = diffLessonAgainstMaster(baseLesson, snapshot, {
      dayLabel,
      currentSectionsText: "Warm-up: skip counting",
    });
    expect(diffs).toEqual([
      {
        field: "sections",
        label: "Lesson flow",
        master: "Warm-up: counting",
        personal: "Warm-up: skip counting",
      },
    ]);
  });

  it("strips section HTML on both sides", () => {
    const snapshot = {
      ...identicalSnapshot,
      sections: "<h3>Warm-up</h3><p>counting</p>",
    };
    const diffs = diffLessonAgainstMaster(baseLesson, snapshot, {
      dayLabel,
      currentSectionsText: "<h3>Warm-up</h3><p>skip counting</p>",
    });
    expect(diffs[0].master).toBe("Warm-upcounting");
    expect(diffs[0].personal).toBe("Warm-upskip counting");
  });
});
