// toggle-group-keys.test.ts — the two rules that decide whether <ToggleGroup>
// is allowed to COMMIT.
//
// Both cases here are shipped data-loss bugs, not hypotheticals:
//
//   • ARROW-IN-TRANSIT (Critical). The lesson editor's Kind group is
//     [None, Not set, Formative, Summative] and its "None" handler commits `{}`,
//     which nulls all four assessment_* columns. Arrow navigation WRAPS, so from
//     "Summative" a single ArrowRight landed on "None" — and with selection
//     following focus that committed, destroying a teacher's title, purpose and
//     notes while they were merely stepping through the options. No confirm, no
//     undo (editLesson is outside the undo-toast matrix).
//
//   • NO-OP RE-SELECT (High). Clicking the segment that is ALREADY active fired
//     onChange, which the planner treats as an edit — and an edit on an unforked
//     Team lesson lazily forks it (CLAUDE.md §2). Clicking the lit "Formative"
//     chip therefore gave the teacher a personal copy that silently stopped
//     tracking the team plan.
//
// The rules live in a leaf module precisely so they can be asserted here: the
// test gate runs `environment: "node"` with no jsdom and no renderer.

import { describe, expect, it } from "vitest";
import {
  arrowCommits,
  arrowTarget,
  hasDestructiveOption,
  selectionOf,
} from "@/components/ui/toggle-group-keys";

/** Only the two fields the rules under test look at. */
interface Opt {
  value: string;
  destructive?: boolean;
}

/** The lesson editor's Kind group — the shape that produced the Critical. */
const KIND_OPTIONS: readonly Opt[] = [
  { value: "none", destructive: true },
  { value: "unclassified" },
  { value: "formative" },
  { value: "summative" },
];

/** An ordinary group: no option destroys anything. */
const VIEW_OPTIONS: readonly Opt[] = [{ value: "grid" }, { value: "list" }];

/**
 * What the component does for one arrow press, expressed in the primitive's own
 * two rules. Returns the value that would be COMMITTED, or null for none.
 */
function pressArrow(
  key: string,
  options: readonly Opt[],
  value: string,
  selectOnFocus = true,
): { focused: string; committed: string | null } {
  const from = options.findIndex((o) => o.value === value);
  const target = arrowTarget(key, from, options.length);
  if (target === null) return { focused: value, committed: null };
  const landed = options[target].value;
  const committed = arrowCommits(options, selectOnFocus)
    ? selectionOf(landed, value)
    : null;
  return { focused: landed, committed };
}

describe("arrowTarget", () => {
  it("wraps forward off the end — which is what put the destructive option one keypress after the last", () => {
    expect(arrowTarget("ArrowRight", 3, 4)).toBe(0);
    expect(arrowTarget("ArrowDown", 3, 4)).toBe(0);
  });

  it("wraps backward off the start", () => {
    expect(arrowTarget("ArrowLeft", 0, 4)).toBe(3);
    expect(arrowTarget("ArrowUp", 0, 4)).toBe(3);
  });

  it("steps one at a time in between", () => {
    expect(arrowTarget("ArrowRight", 1, 4)).toBe(2);
    expect(arrowTarget("ArrowLeft", 2, 4)).toBe(1);
  });

  it("ignores keys the group does not answer to", () => {
    for (const key of ["Enter", " ", "Tab", "a", "Escape", "Home", "End"]) {
      expect(arrowTarget(key, 1, 4)).toBeNull();
    }
  });

  it("navigates from a value that matches no option instead of going inert", () => {
    expect(arrowTarget("ArrowRight", -1, 4)).toBe(1);
    expect(arrowTarget("ArrowLeft", -1, 4)).toBe(3);
  });

  it("has nowhere to go in an empty group", () => {
    expect(arrowTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("hasDestructiveOption", () => {
  it("finds a destructive option wherever it sits", () => {
    expect(hasDestructiveOption(KIND_OPTIONS)).toBe(true);
    const trailing: readonly Opt[] = [
      { value: "a" },
      { value: "b", destructive: true },
    ];
    expect(hasDestructiveOption(trailing)).toBe(true);
  });

  it("is false for an ordinary group", () => {
    expect(hasDestructiveOption(VIEW_OPTIONS)).toBe(false);
    expect(hasDestructiveOption([])).toBe(false);
  });
});

describe("arrowCommits", () => {
  it("keeps selection-follows-focus for an ordinary group", () => {
    expect(arrowCommits(VIEW_OPTIONS, true)).toBe(true);
  });

  it("honours an explicit opt-out", () => {
    expect(arrowCommits(VIEW_OPTIONS, false)).toBe(false);
  });

  it("is FORCED off by a destructive option, whatever the callsite asked for", () => {
    expect(arrowCommits(KIND_OPTIONS, true)).toBe(false);
    expect(arrowCommits(KIND_OPTIONS, false)).toBe(false);
  });
});

describe("selectionOf", () => {
  it("commits a real change", () => {
    expect(selectionOf("formative", "summative")).toBe("formative");
  });

  it("refuses a no-op — re-selecting the active option is not an edit", () => {
    expect(selectionOf("formative", "formative")).toBeNull();
  });
});

// ── The two regressions, end to end ─────────────────────────────────────────

describe("CRITICAL — an arrow key must never commit a destructive option", () => {
  it("does not clear the assessment when ArrowRight wraps from Summative onto None", () => {
    const { focused, committed } = pressArrow("ArrowRight", KIND_OPTIONS, "summative");
    expect(focused).toBe("none"); // focus moves — the teacher can see it
    expect(committed).toBeNull(); // …but nothing is written
  });

  it("does not clear it stepping backward from Not set onto None either", () => {
    expect(pressArrow("ArrowLeft", KIND_OPTIONS, "unclassified").committed).toBeNull();
  });

  it("commits nothing on ANY arrow anywhere in the group", () => {
    for (const option of KIND_OPTIONS) {
      for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
        expect(pressArrow(key, KIND_OPTIONS, option.value).committed).toBeNull();
      }
    }
  });

  it("still lets an ordinary group commit on arrow — the default is unchanged", () => {
    expect(pressArrow("ArrowRight", VIEW_OPTIONS, "grid").committed).toBe("list");
  });
});

describe("HIGH — a no-op selection must not fire onChange", () => {
  it("returns nothing to commit when the arrow lands back on the active option", () => {
    // A single-option group: every arrow wraps onto the option already active.
    const lone: readonly Opt[] = [{ value: "grid" }];
    expect(pressArrow("ArrowRight", lone, "grid").committed).toBeNull();
  });

  it("returns nothing to commit when the active chip is clicked again", () => {
    // The click path is `selectionOf(clicked, value)` — the same gate.
    expect(selectionOf("summative", "summative")).toBeNull();
  });
});
