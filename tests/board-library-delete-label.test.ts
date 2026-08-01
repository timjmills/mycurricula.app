import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";
import type { Board } from "@/lib/types";
import { BoardLibraryCard } from "@/components/teach/library/BoardLibraryCard";

// The Board Library card's destructive action was labelled "More".
//
// It rendered a ⋯ glyph and the visible word "More" while carrying
// `aria-label="Delete <title>"` and an onClick that starts the delete flow.
// Two separate defects in one control:
//
//   • WCAG 2.5.3 Label in Name — the accessible name must CONTAIN the visible
//     label. It did not, so a voice-control user saying "click More" activated
//     nothing at all, and the one thing they could say ("click Delete") matched
//     no visible text.
//   • The visible label misdescribed the action. "More" promises a menu; the
//     click starts deleting a board. A sighted teacher reaching for the
//     overflow menu found the destructive path instead.
//
// Both are pinned. The Label-in-Name assertion is written as a containment
// check between the two strings the component actually emits, not as two
// independent literal matches — a future rename that moves only one of them
// has to fail here.
//
// Renders the shipped component through `react-dom/server` (vitest runs
// `environment: "node"`), the technique tests/teach-false-empty.test.ts uses.

const BOARD = {
  id: "b1",
  title: "Fraction warm-up",
  tags: [],
  whiteboard: false,
} as unknown as Board;

function renderMineCard(): string {
  return renderToStaticMarkup(
    createElement(BoardLibraryCard, {
      board: BOARD,
      tab: "mine",
      onOpen: () => {},
      onRequestDelete: () => {},
    }),
  );
}

/** The accessible name the delete control carries. */
const ARIA_LABEL = `Delete ${BOARD.title}`;

describe("BoardLibraryCard — the destructive action names itself", () => {
  it("does not label the delete control 'More'", () => {
    expect(renderMineCard()).not.toContain(">More");
  });

  it("shows the visible label 'Delete'", () => {
    expect(renderMineCard()).toContain(">Delete");
  });

  it("keeps the accessible name, and it contains the visible label", () => {
    const html = renderMineCard();
    expect(html).toContain(`aria-label="${ARIA_LABEL}"`);
    // WCAG 2.5.3: the visible label must be a substring of the accessible name.
    expect(ARIA_LABEL.toLowerCase()).toContain("delete");
  });

  it("renders the confirm row only when the module asks for it", () => {
    // The confirm row EXISTS and is not shown at rest. This is a markup fact
    // and a static render is the right instrument for it — but note what it
    // does NOT establish: that the Delete button leads there. See the block
    // below, which is where that used to be claimed and could not be.
    const confirming = renderToStaticMarkup(
      createElement(BoardLibraryCard, {
        board: BOARD,
        tab: "mine",
        confirmingDelete: true,
        onOpen: () => {},
        onDelete: () => {},
        onCancelDelete: () => {},
      }),
    );
    expect(confirming).toContain("Delete this board?");
    expect(confirming).toContain("Cancel");
    // And the resting card is NOT already showing the confirm.
    expect(renderMineCard()).not.toContain("Delete this board?");
  });
});

// ── Where the Delete button actually GOES ───────────────────────────────────
//
// THE TEST THIS REPLACES WAS NAMED "still routes the click to the confirm step,
// not straight to delete" AND CLICKED NOTHING. It rendered `confirmingDelete:
// true` and checked that the confirm row painted — which proves the confirm row
// exists, not that anything routes to it. `renderToStaticMarkup` runs no
// effects and fires no events, so the one thing the name promised was the one
// thing the assertion could not see.
//
// What it left uncovered is a DESTRUCTIVE path: `onClick={() => onDelete?.(board)}`
// in place of `onRequestDelete?.(board)` on the resting card is a one-token
// slip that deletes a teacher's board on a single click with no confirm and no
// undo, and it passed all four tests. On the Personal segment those boards are
// the teacher's own work.
//
// So this block clicks. Every case asserts BOTH the call that should have
// happened and the one that must not — `expect(deleted).toEqual([])` alone is
// satisfied by a button that does nothing at all, and a dead Delete button is a
// different bug, not a pass.

interface Calls {
  requested: string[];
  deleted: string[];
  cancelled: number;
  opened: string[];
}

/** Mount the card and drive it, with every callback recorded. */
async function drive(
  props: Partial<Parameters<typeof BoardLibraryCard>[0]>,
): Promise<{
  calls: Calls;
  click: (label: string) => Promise<void>;
  unmount: () => Promise<void>;
}> {
  const calls: Calls = {
    requested: [],
    deleted: [],
    cancelled: 0,
    opened: [],
  };
  const h = await mountReact(BoardLibraryCard);
  await h.render({
    board: BOARD,
    tab: "mine",
    onOpen: (b: Board) => calls.opened.push(b.id),
    onRequestDelete: (b: Board) => calls.requested.push(b.id),
    onDelete: (b: Board) => calls.deleted.push(b.id),
    onCancelDelete: () => {
      calls.cancelled += 1;
    },
    ...props,
  } as Parameters<typeof BoardLibraryCard>[0]);
  return {
    calls,
    // `mountReact.click` THROWS when nothing matches, which is the property
    // that makes this worth doing at all: a static "click" that hits nothing
    // passes silently, exactly like an absence assertion on a dead page.
    click: (label) =>
      h.click((el) => (el.textContent ?? "").trim().endsWith(label)),
    unmount: h.unmount,
  };
}

describe("BoardLibraryCard — the Delete button leads to the confirm, not to the deletion", () => {
  it("asks for confirmation and deletes NOTHING on the first click", async () => {
    const h = await drive({});
    try {
      await h.click("Delete");

      expect(h.calls.requested, "the confirm step was not requested").toEqual([
        BOARD.id,
      ]);
      expect(h.calls.deleted, "the board was deleted with no confirm").toEqual(
        [],
      );
    } finally {
      await h.unmount();
    }
  });

  it("deletes only from the SECOND click, inside the confirm row", async () => {
    // The anti-overshoot direction. A card that never called `onDelete` at all
    // would satisfy the test above perfectly while leaving the teacher unable
    // to delete anything — a safety mechanism that has become a dead end.
    const h = await drive({ confirmingDelete: true });
    try {
      await h.click("Delete");
      expect(h.calls.deleted).toEqual([BOARD.id]);
      expect(h.calls.requested, "the confirm re-armed itself").toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("backs out without deleting when Cancel is pressed", async () => {
    const h = await drive({ confirmingDelete: true });
    try {
      await h.click("Cancel");
      expect(h.calls.cancelled).toBe(1);
      expect(h.calls.deleted, "Cancel deleted the board").toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("keeps the non-destructive actions on their own handlers", async () => {
    // The control that gives the three assertions above their meaning: clicks
    // on this card reach DIFFERENT callbacks. Without it, a card that routed
    // every button to `onRequestDelete` would pass the first test and the
    // harness would be measuring nothing but its own wiring.
    const h = await drive({});
    try {
      await h.click("Open");
      expect(h.calls.opened).toEqual([BOARD.id]);
      expect(h.calls.requested).toEqual([]);
      expect(h.calls.deleted).toEqual([]);
    } finally {
      await h.unmount();
    }
  });
});
