import { describe, it, expect } from "vitest";

import {
  applyOptimisticFlip,
  inverseDirection,
  joinSharingRows,
  type CourseMeta,
  type SharingDirection,
} from "../lib/subjects/sharing-view";
import type { CourseSharingState } from "../lib/subjects/row";

// ───────────────────────────────────────────────────────────────────────────
// §4a follow-up: the Course-sharing card's view logic, extracted from
// components/settings/course-sharing-manager.tsx into pure helpers
// (lib/subjects/sharing-view.ts) with ZERO behavior change. These tests pin
// the extracted behavior exactly:
//   1. joinSharingRows — the sharing-state ⇄ course-meta join, incl. the
//      scope-aware name fallback and the null-slug (neutral swatch) fallback.
//   2. applyOptimisticFlip — the full field matrix for both directions,
//      non-target passthrough, and immutability.
//   3. inverseDirection — the share ⇄ unshare Undo mapping.
//   4. An undo simulation: share → inverse flip restores the user-visible
//      state shape (matching the component's original inline logic).
// ───────────────────────────────────────────────────────────────────────────

/** Build a CourseSharingState with overridable fields (defaults: a shareable
 *  personal course). */
function state(over: Partial<CourseSharingState> = {}): CourseSharingState {
  return {
    subjectId: "subj-1",
    scope: "personal",
    sharedFromPersonal: false,
    sharedByTeacherId: null,
    sharedByName: null,
    canShare: true,
    canUnshare: false,
    ...over,
  };
}

const ACTOR = { id: "teacher-1", name: "Tim" };

// ---------------------------------------------------------------------------
// 1. joinSharingRows — display-row join
// ---------------------------------------------------------------------------
describe("joinSharingRows", () => {
  it("joins name + slug from meta by subjects-row id, preserving order", () => {
    const sharing = [
      state({ subjectId: "a" }),
      state({ subjectId: "b", scope: "team" }),
    ];
    const meta = new Map<string, CourseMeta>([
      ["a", { name: "Math", slug: "math" }],
      ["b", { name: "Reading", slug: "reading" }],
    ]);

    const rows = joinSharingRows(sharing, meta);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ state: sharing[0], name: "Math", slug: "math" });
    expect(rows[1]).toEqual({
      state: sharing[1],
      name: "Reading",
      slug: "reading",
    });
    // The joined state is the SAME object (by reference), not a copy — the
    // row list keys and re-renders off it.
    expect(rows[0].state).toBe(sharing[0]);
    expect(rows[1].state).toBe(sharing[1]);
  });

  it("produces exactly one row per sharing entry (no dedupe, no drops)", () => {
    // Two sharing entries pointing at the same meta id still yield two rows.
    const sharing = [state({ subjectId: "a" }), state({ subjectId: "a" })];
    const meta = new Map<string, CourseMeta>([
      ["a", { name: "Math", slug: "math" }],
    ]);
    const rows = joinSharingRows(sharing, meta);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["Math", "Math"]);
  });

  it("falls back to 'Shared course' for a TEAM course with no visible meta", () => {
    // An admin-managed course the caller can't SEE via the RLS-scoped list
    // must not render a bare uuid.
    const rows = joinSharingRows(
      [state({ subjectId: "hidden", scope: "team" })],
      new Map(),
    );
    expect(rows[0].name).toBe("Shared course");
    expect(rows[0].slug).toBeNull();
  });

  it("falls back to 'Personal course' for a PERSONAL course with no meta", () => {
    const rows = joinSharingRows(
      [state({ subjectId: "hidden", scope: "personal" })],
      new Map(),
    );
    expect(rows[0].name).toBe("Personal course");
    expect(rows[0].slug).toBeNull();
  });

  it("returns an empty list for empty sharing state", () => {
    expect(joinSharingRows([], new Map())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. applyOptimisticFlip — full field matrix, both directions
// ---------------------------------------------------------------------------
describe("applyOptimisticFlip", () => {
  it("SHARE flips the target to a team course contributed by the actor", () => {
    const before = state({ subjectId: "a" });
    const [after] = applyOptimisticFlip([before], "a", "share", ACTOR);

    expect(after).toEqual({
      subjectId: "a",
      scope: "team",
      sharedFromPersonal: true,
      sharedByTeacherId: "teacher-1",
      sharedByName: "Tim",
      canShare: false,
      canUnshare: true,
    });
  });

  it("UNSHARE flips the target back to personal and clears the shown name — but deliberately leaves sharedByTeacherId / sharedFromPersonal for the reconcile", () => {
    const before = state({
      subjectId: "a",
      scope: "team",
      sharedFromPersonal: true,
      sharedByTeacherId: "teacher-1",
      sharedByName: "Tim",
      canShare: false,
      canUnshare: true,
    });
    const [after] = applyOptimisticFlip([before], "a", "unshare", ACTOR);

    expect(after).toEqual({
      subjectId: "a",
      scope: "personal",
      // Untouched by the unshare branch (matches the original inline flip):
      sharedFromPersonal: true,
      sharedByTeacherId: "teacher-1",
      // Cleared — the status line stops naming a contributor:
      sharedByName: null,
      canShare: true,
      canUnshare: false,
    });
  });

  it("passes a null actor id through on share (auth uid not yet resolved)", () => {
    const [after] = applyOptimisticFlip(
      [state({ subjectId: "a" })],
      "a",
      "share",
      { id: null, name: "Tim" },
    );
    expect(after.sharedByTeacherId).toBeNull();
    expect(after.sharedByName).toBe("Tim");
  });

  it("leaves non-target rows untouched — same references", () => {
    const other1 = state({ subjectId: "x" });
    const other2 = state({ subjectId: "y", scope: "team" });
    const target = state({ subjectId: "a" });

    const result = applyOptimisticFlip(
      [other1, target, other2],
      "a",
      "share",
      ACTOR,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(other1); // untouched, by reference
    expect(result[2]).toBe(other2); // untouched, by reference
    expect(result[1]).not.toBe(target); // flipped row is a NEW object
  });

  it("never mutates its inputs (new array, target copied)", () => {
    const target = state({ subjectId: "a" });
    const list = [target];
    const snapshot = { ...target };

    const result = applyOptimisticFlip(list, "a", "share", ACTOR);

    expect(result).not.toBe(list);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(target);
    expect(target).toEqual(snapshot); // original object unchanged
  });

  it("is a no-op (per element) when the id matches no row", () => {
    const rows = [state({ subjectId: "a" }), state({ subjectId: "b" })];
    const result = applyOptimisticFlip(rows, "nope", "share", ACTOR);
    expect(result[0]).toBe(rows[0]);
    expect(result[1]).toBe(rows[1]);
  });
});

// ---------------------------------------------------------------------------
// 3. inverseDirection — the toast's Undo mapping
// ---------------------------------------------------------------------------
describe("inverseDirection", () => {
  it("maps share → unshare and unshare → share", () => {
    expect(inverseDirection("share")).toBe("unshare");
    expect(inverseDirection("unshare")).toBe("share");
  });

  it("round-trips to the original direction", () => {
    const dirs: SharingDirection[] = ["share", "unshare"];
    for (const dir of dirs) {
      expect(inverseDirection(inverseDirection(dir))).toBe(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Undo simulation — share, then the inverse flip
// ---------------------------------------------------------------------------
describe("undo simulation (share → inverse flip)", () => {
  it("restores the user-visible personal state after undoing a share", () => {
    const original = state({ subjectId: "a" });
    const shared = applyOptimisticFlip([original], "a", "share", ACTOR);
    const undone = applyOptimisticFlip(
      shared,
      "a",
      inverseDirection("share"),
      ACTOR,
    );

    const [row] = undone;
    // Everything the row UI reads is back to the pre-share shape: scope,
    // contributor name, and both affordance flags.
    expect(row.scope).toBe("personal");
    expect(row.sharedByName).toBeNull();
    expect(row.canShare).toBe(true);
    expect(row.canUnshare).toBe(false);
    // Provenance residue from the optimistic share remains until the
    // background reconcile refreshes it — identical to the original inline
    // logic, which never reset these on unshare.
    expect(row.sharedFromPersonal).toBe(true);
    expect(row.sharedByTeacherId).toBe("teacher-1");
  });
});
