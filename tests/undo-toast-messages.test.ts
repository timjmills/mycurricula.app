import { describe, it, expect } from "vitest";

import {
  detectFirstFork,
  isBulkHistoryAdvance,
  undoToastMessage,
  FIRST_FORK_MESSAGE,
  RESTORE_MESSAGE,
} from "@/lib/undo-toast-messages";
import { orderedWeekdaysFrom } from "@/lib/week-order";
import { DEFAULT_SCHOOL_WEEK } from "@/lib/use-school-week";

// Tests for the roadmap-02 undo-toast decision logic. Pure helpers only —
// the UndoToastBridge React component is not invoked under node (the lead
// verifies the rendered toast in the browser at the gate).

// ── Fixtures ───────────────────────────────────────────────────────────────

/** dayLabel wired exactly as the bridge wires it: configured school week →
 *  full weekday name. Default config = Sun–Thu, so day 2 = "Tuesday". */
const days = orderedWeekdaysFrom([...DEFAULT_SCHOOL_WEEK]);
const dayLabel = (d: number): string => days[d]?.longLabel ?? `Day ${d + 1}`;

interface ForkShape {
  id: string;
  modified: boolean;
  isPersonal: boolean;
}

const unforked: ForkShape = { id: "l1", modified: false, isPersonal: false };
const forked: ForkShape = { id: "l1", modified: true, isPersonal: true };

// ── detectFirstFork ────────────────────────────────────────────────────────

describe("detectFirstFork — the unforked → personally-forked transition", () => {
  it("detects the lazy fork (modified+isPersonal both flip true)", () => {
    expect(detectFirstFork([unforked], [forked], ["l1"])).toBe(true);
  });

  it("is false when the lesson was already modified (not the FIRST fork)", () => {
    const prev = { id: "l1", modified: true, isPersonal: true };
    expect(detectFirstFork([prev], [forked], ["l1"])).toBe(false);
  });

  it("is false when the lesson was already personal", () => {
    const prev = { id: "l1", modified: false, isPersonal: true };
    const next = { id: "l1", modified: true, isPersonal: true };
    expect(detectFirstFork([prev], [next], ["l1"])).toBe(false);
  });

  it("is false for a brand-new lesson (duplicate copy) — creation, not a fork", () => {
    const copy = { id: "copy-1", modified: false, isPersonal: true };
    expect(detectFirstFork([unforked], [unforked, copy], ["copy-1"])).toBe(
      false,
    );
  });

  it("is false when only one of the two flags is set after the action", () => {
    const movedOnly = { id: "l1", modified: false, isPersonal: false };
    expect(detectFirstFork([unforked], [movedOnly], ["l1"])).toBe(false);
    const personalOnly = { id: "l1", modified: false, isPersonal: true };
    expect(detectFirstFork([unforked], [personalOnly], ["l1"])).toBe(false);
  });

  it("completion never forks: a status-only change cannot trip the detector", () => {
    // setLessonStatus rewrites only `status` — the forking flags are
    // byte-identical across the transition (CLAUDE.md §2 hard rule).
    const before = { ...unforked, status: "not_done" };
    const after = { ...unforked, status: "done" };
    expect(detectFirstFork([before], [after], ["l1"])).toBe(false);
  });

  it("is false when the affected id is absent from both docs", () => {
    expect(detectFirstFork([unforked], [forked], ["ghost"])).toBe(false);
  });
});

// ── undoToastMessage ───────────────────────────────────────────────────────

describe("undoToastMessage — move gestures", () => {
  const base = { firstFork: false, dayLabel };

  it("same-week day move → 'Moved to {weekday}' from the configured week", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "moveLesson",
        lesson: { day: 2, week: 12, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
      }),
    ).toBe("Moved to Tuesday");
  });

  it("across-week move → 'Moved to Week {n}'", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "relocateLesson",
        lesson: { day: 0, week: 13, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
      }),
    ).toBe("Moved to Week 13");
  });

  it("bumpLesson that wraps the week reads as an across-week move", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "bumpLesson",
        lesson: { day: 4, week: 13, subject: "reading", status: "not_done" },
        prevLesson: { day: 4, week: 12, subject: "reading" },
      }),
    ).toBe("Moved to Week 13");
  });

  it("subject-only (lane) move → plain 'Moved' (no wrong day/week named)", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "moveLesson",
        lesson: { day: 1, week: 12, subject: "reading", status: "not_done" },
        prevLesson: { day: 1, week: 12, subject: "math" },
      }),
    ).toBe("Moved");
  });

  it("no-op move (drop on origin, bump with no free slot) → no toast", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "moveLesson",
        lesson: { day: 1, week: 12, subject: "math", status: "not_done" },
        prevLesson: { day: 1, week: 12, subject: "math" },
      }),
    ).toBeNull();
  });

  it("missing before/after lesson data → no toast (never guess)", () => {
    expect(undoToastMessage({ ...base, kind: "moveLesson" })).toBeNull();
  });

  it("relocate-with-copy across weeks → 'Copied to Week {n}' (§4a L3)", () => {
    // The bridge detected the copy path (source slot unchanged, new lesson id
    // on the target) and passes the COPY as `lesson` with isCopy=true. The
    // source did not move, so "Moved" would lie.
    expect(
      undoToastMessage({
        ...base,
        kind: "relocateLesson",
        isCopy: true,
        lesson: { day: 0, week: 13, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
      }),
    ).toBe("Copied to Week 13");
  });

  it("relocate-with-copy within the week → 'Copied to {weekday}'", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "relocateLesson",
        isCopy: true,
        lesson: { day: 2, week: 12, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
      }),
    ).toBe("Copied to Tuesday");
  });

  it("subject-only relocate-with-copy → bare 'Copied'", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "relocateLesson",
        isCopy: true,
        lesson: { day: 1, week: 12, subject: "reading", status: "not_done" },
        prevLesson: { day: 1, week: 12, subject: "math" },
      }),
    ).toBe("Copied");
  });

  it("isCopy left unset keeps the 'Moved' voice (back-compat default)", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "relocateLesson",
        lesson: { day: 0, week: 13, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
      }),
    ).toBe("Moved to Week 13");
  });

  it("respects a non-default school week's labels", () => {
    const monFri = orderedWeekdaysFrom(["mon", "tue", "wed", "thu", "fri"]);
    expect(
      undoToastMessage({
        kind: "moveLesson",
        firstFork: false,
        lesson: { day: 0, week: 12, subject: "math", status: "not_done" },
        prevLesson: { day: 3, week: 12, subject: "math" },
        dayLabel: (d) => monFri[d]?.longLabel ?? `Day ${d + 1}`,
      }),
    ).toBe("Moved to Monday");
  });
});

describe("undoToastMessage — completion toggle", () => {
  const base = { firstFork: false, dayLabel };
  const at = { day: 0, week: 12, subject: "math" } as const;

  it("marked done / not done read the NEW status", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "setLessonStatus",
        lesson: { ...at, status: "done" },
      }),
    ).toBe("Marked done");
    expect(
      undoToastMessage({
        ...base,
        kind: "setLessonStatus",
        lesson: { ...at, status: "not_done" },
      }),
    ).toBe("Marked not done");
  });

  it("covers the non-binary statuses", () => {
    expect(
      undoToastMessage({
        ...base,
        kind: "setLessonStatus",
        lesson: { ...at, status: "carried" },
      }),
    ).toBe("Marked carried over");
    expect(
      undoToastMessage({
        ...base,
        kind: "setLessonStatus",
        lesson: { ...at, status: "skipped" },
      }),
    ).toBe("Marked skipped");
    expect(
      undoToastMessage({
        ...base,
        kind: "setLessonStatus",
        lesson: { ...at, status: "partial" },
      }),
    ).toBe("Marked partially done");
  });
});

describe("undoToastMessage — fork education + revert", () => {
  it("first-fork wins over the gesture's own message, exact spec voice", () => {
    expect(
      undoToastMessage({
        kind: "editLesson",
        firstFork: true,
        dayLabel,
      }),
    ).toBe(FIRST_FORK_MESSAGE);
    expect(FIRST_FORK_MESSAGE).toBe(
      "Saved to your personal plan — the team's version is untouched",
    );
    // …and it replaces a move's message when that action carried the fork.
    expect(
      undoToastMessage({
        kind: "moveLesson",
        firstFork: true,
        lesson: { day: 2, week: 12, subject: "math", status: "not_done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
        dayLabel,
      }),
    ).toBe(FIRST_FORK_MESSAGE);
  });

  it("restoreLesson (revert/unfork) → the restore copy", () => {
    expect(
      undoToastMessage({ kind: "restoreLesson", firstFork: false, dayLabel }),
    ).toBe(RESTORE_MESSAGE);
    expect(RESTORE_MESSAGE).toBe("Restored the team's version");
  });
});

describe("undoToastMessage — kinds that must never toast", () => {
  const never = [
    "undo",
    "redo",
    "hydrate",
    "setHydration",
    "setCatalog",
    "editLesson", // text-edit burst (toasts ONLY via firstFork)
    "editSection",
    "editSectionResource",
    "setSections",
    "reorderSections",
    "addSection",
    "removeSection",
    "duplicateSection",
    "addSectionResource",
    "removeSectionResource",
    "moveSectionResource",
    "toggleSectionWebsite",
    "setCellLayout",
    "duplicateLesson",
    "duplicateWeek",
    "archiveLesson", // has its own card-level toast
    "unarchiveLesson",
    "setSaveTarget", // toasts only when it carries firstFork
  ];

  it.each(never)("'%s' → null", (kind) => {
    expect(
      undoToastMessage({
        kind,
        firstFork: false,
        lesson: { day: 1, week: 12, subject: "math", status: "done" },
        prevLesson: { day: 0, week: 12, subject: "math" },
        dayLabel,
      }),
    ).toBeNull();
  });

  it("even undo/redo with firstFork accidentally set stay silent", () => {
    expect(
      undoToastMessage({ kind: "undo", firstFork: true, dayLabel }),
    ).toBeNull();
    expect(
      undoToastMessage({ kind: "redo", firstFork: true, dayLabel }),
    ).toBeNull();
  });
});

// ── isBulkHistoryAdvance ───────────────────────────────────────────────────
// §4a review M2: the bridge compares the store's historyDepth across one
// observed lastChange advance — a jump >1 means N dispatches landed in one
// React batch (e.g. WeeklyGrid.handleBulkMove) and a single-step Undo toast
// would restore 1 of N.

describe("isBulkHistoryAdvance — multi-entry history jumps", () => {
  it("a single mutation (+1) is not a bulk advance", () => {
    expect(isBulkHistoryAdvance(4, 5)).toBe(false);
  });

  it("a bulk batch (+N, N>1) is a bulk advance", () => {
    expect(isBulkHistoryAdvance(0, 2)).toBe(true);
    expect(isBulkHistoryAdvance(4, 9)).toBe(true); // bulk-move 5 lessons
  });

  it("undo (-1) and redo (+1) are not bulk advances", () => {
    expect(isBulkHistoryAdvance(5, 4)).toBe(false);
    expect(isBulkHistoryAdvance(4, 5)).toBe(false);
  });

  it("a coalesced text edit / HISTORY_LIMIT-capped push (±0) is not bulk", () => {
    expect(isBulkHistoryAdvance(3, 3)).toBe(false);
    expect(isBulkHistoryAdvance(50, 50)).toBe(false);
  });

  it("a hydrate-style reset to zero is not a bulk advance", () => {
    expect(isBulkHistoryAdvance(7, 0)).toBe(false);
  });
});
