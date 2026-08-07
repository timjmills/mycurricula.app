import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";

import { mountReact } from "./mount-react";
import type { Lesson } from "@/lib/types";

// THE FOOTER BUTTON MUST NOT PROMISE A FEATURE THAT DOES NOT EXIST.
//
// It used to read "Propose to Team". It proposes nothing: no request is sent,
// nothing is queued, no one is notified, and Master is not written. All it does
// is switch `editMode` to "master" so the teacher can make the change
// themselves under the pink caution glow. A teacher who pressed it and left had
// every reason to believe their change had reached the team. Merge-back is
// still unbuilt (docs/6.12.26 Webreview and Improvment.md).
//
// So this pins BOTH halves — the honest label AND the behaviour it names:
//   • the button says what it does, and the old promise is gone;
//   • pressing it switches the mode and closes the panel;
//   • pressing it WRITES NOTHING. That is the substantive claim of the new
//     copy ("Nothing is sent or saved by this button"), and it is the one a
//     future refactor could break while leaving the label looking right.
//
// A mount, not a string render: the assertion is about what a PRESS does.
//
// (tests/fork-diff.test.ts covers the pure diff engine and says the component
// "is verified in the browser". On this build it cannot be: the documented
// entry `/daily?lesson=<id>&compare=1` is stripped by the v2 Day surface's URL
// mirror before the panel can open — see the F0 report. Until that entry is
// restored, this file is the verification.)

const spies = vi.hoisted(() => ({
  editMode: "personal" as "personal" | "master",
  setEditMode: vi.fn(),
  editLesson: vi.fn(),
  revertPlacement: vi.fn(),
  restoreLesson: vi.fn(),
  onClose: vi.fn(),
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    editMode: spies.editMode,
    setEditMode: spies.setEditMode,
  }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    editLesson: spies.editLesson,
    revertPlacement: spies.revertPlacement,
    restoreLesson: spies.restoreLesson,
    getSections: () => [],
  }),
}));

const { ForkDiffPanel } = await import(
  "@/components/lesson-card/fork-diff/fork-diff-panel"
);

/** A personally-modified lesson: title, objective and day all diverge from the
 *  captured team snapshot, so the panel renders real diff rows above the
 *  footer rather than its empty state. */
const lesson = {
  id: "r-12-1",
  subject: "reading",
  unitId: "u-1",
  title: "Book club — Via's chapters",
  objective: "I can compare two characters' points of view.",
  preview: "Small groups discuss chapters 4-6.",
  standards: ["5.RL.6"],
  standardIds: [],
  day: 1,
  week: 12,
  status: "planned",
  modified: true,
  moved: true,
  masterSnapshot: {
    title: "Literature circles — Via's chapters",
    objective: "I can identify a character's point of view.",
    preview: "Small groups discuss chapters 4-6.",
    standards: ["5.RL.6"],
    day: 0,
    week: 12,
  },
} as unknown as Lesson;

const buttons = (h: { queryAll: (s: string) => Element[] }): string[] =>
  h.queryAll("button").map((b) => (b.textContent ?? "").trim());

beforeEach(() => {
  spies.editMode = "personal";
  spies.setEditMode.mockReset();
  spies.editLesson.mockReset();
  spies.revertPlacement.mockReset();
  spies.restoreLesson.mockReset();
  spies.onClose.mockReset();
});

describe("the fork-diff footer names what its button actually does", () => {
  it('offers "Edit the Team version" and no longer promises a proposal', async () => {
    const h = await mountReact(ForkDiffPanel);
    try {
      await h.render({ lesson, onClose: spies.onClose });
      const html = h.html();

      // POSITIVE CONTROL first: the panel really rendered. Without it, "the
      // word Propose is absent" is equally true of a panel that returned null
      // (which this component does for a missing snapshot or master mode).
      expect(html).toContain("Compared with the Team Curriculum");
      expect(buttons(h)).toContain("Edit the Team version");

      // The old promise is gone from the label, the footer note, and every
      // tooltip/aria string the panel renders.
      expect(html).not.toMatch(/propos/i);
    } finally {
      await h.unmount();
    }
  });

  it("switches to Team-Curriculum editing and closes, WITHOUT writing anything", async () => {
    const h = await mountReact(ForkDiffPanel);
    try {
      await h.render({ lesson, onClose: spies.onClose });
      await h.click((el) => (el.textContent ?? "").trim() === "Edit the Team version");

      expect(spies.setEditMode).toHaveBeenCalledWith("master");
      expect(spies.onClose).toHaveBeenCalled();

      // The substantive claim of the new copy. A press must not touch the
      // lesson: not the team's copy, not the teacher's own.
      expect(spies.editLesson).not.toHaveBeenCalled();
      expect(spies.revertPlacement).not.toHaveBeenCalled();
      expect(spies.restoreLesson).not.toHaveBeenCalled();
    } finally {
      await h.unmount();
    }
  });

  it("renders nothing at all in Team-Curriculum mode", async () => {
    // The M1 personal-mode gate. Paired with the positive control in the first
    // test: the panel is CAPABLE of rendering with this lesson, so an empty
    // result here is the gate firing and not a broken fixture.
    spies.editMode = "master";
    const h = await mountReact(ForkDiffPanel);
    try {
      await h.render({ lesson, onClose: spies.onClose });
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });
});
