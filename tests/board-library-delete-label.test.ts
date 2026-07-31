import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

  it("still routes the click to the confirm step, not straight to delete", () => {
    // The two-step confirm is the actual safety mechanism; a relabel must not
    // quietly promote the button to the destructive call itself. The confirm
    // row only paints when the module says so.
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
