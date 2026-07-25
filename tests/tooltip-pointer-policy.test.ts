// tooltip-pointer-policy.test.ts — the Tooltip bubble's pointer contract.
//
// The bubble is a floating rectangle portaled to <body>. Anything it captures
// is a click the teacher aimed at the UI underneath it, so it is inert by
// default. The single exception is the dismissible bubble's "Turn off these
// tips" mini-link (CLAUDE.md §4), which has to be clickable.
//
// The bug this pins down: the exception used to be derived from props alone
// (`!required && tooltipId !== undefined`), so EVERY dismissible tooltip was
// interactive however it opened — including on focus, which has no cursor.
// Tabbing to (or clicking) such a control parked a click-eating rectangle
// over the page for as long as the control held focus; the next mousedown
// inside it hit the bubble, the trigger blurred, the bubble unmounted, and
// the mouseup landed elsewhere — no click event, one input silently eaten.
// After waves B1–B5 a `tooltipId` is on a large share of the app's controls,
// so this reached the unit chip, the planner controls, and settings.
//
// The repo's vitest gate is node-environment (no DOM renderer, and adding one
// would mean new dependencies), so the contract is pinned on the exported
// pure decision rather than on a rendered tree. The live focus-open /
// hover-open / required behaviour is verified in a real browser per §4b.

import { describe, expect, it } from "vitest";
import { tooltipPointerPolicy } from "@/components/ui/Tooltip";

describe("tooltipPointerPolicy — the dismiss link", () => {
  it("renders the link for a dismissible, non-required tooltip", () => {
    expect(
      tooltipPointerPolicy({
        required: false,
        dismissalId: "chrome-search",
        pointerEngaged: true,
      }).showDismissLink,
    ).toBe(true);
  });

  it("never renders the link for a required tooltip", () => {
    // CLAUDE.md §4 always-on exception: Personal/Team toggle, destructive
    // actions, team-wide settings. These must not offer a way to turn the
    // warning off, even when a callsite also passes a tooltipId.
    for (const pointerEngaged of [true, false]) {
      expect(
        tooltipPointerPolicy({
          required: true,
          dismissalId: "team-wide-thing",
          pointerEngaged,
        }).showDismissLink,
      ).toBe(false);
    }
  });

  it("never renders the link for a tooltip that did not opt in", () => {
    expect(
      tooltipPointerPolicy({
        required: false,
        dismissalId: undefined,
        pointerEngaged: true,
      }).showDismissLink,
    ).toBe(false);
  });
});

describe("tooltipPointerPolicy — pointer events", () => {
  it("is interactive while the mouse is engaged on a dismissible tooltip", () => {
    // The one case that needs it: the cursor is on its way from the trigger
    // to the "Turn off these tips" link.
    expect(
      tooltipPointerPolicy({
        required: false,
        dismissalId: "chrome-search",
        pointerEngaged: true,
      }).interactive,
    ).toBe(true);
  });

  it("stays inert when a dismissible tooltip opened on focus alone", () => {
    // THE REGRESSION GUARD. Keyboard tab / programmatic focus / a tap that
    // focuses: no cursor is heading for the link, so the bubble must not
    // intercept the next click.
    expect(
      tooltipPointerPolicy({
        required: false,
        dismissalId: "chrome-search",
        pointerEngaged: false,
      }).interactive,
    ).toBe(false);
  });

  it("stays inert for required tooltips regardless of the mouse", () => {
    // No link to click ⇒ nothing to be interactive for.
    for (const pointerEngaged of [true, false]) {
      expect(
        tooltipPointerPolicy({
          required: true,
          dismissalId: "team-wide-thing",
          pointerEngaged,
        }).interactive,
      ).toBe(false);
    }
  });

  it("stays inert for plain tooltips regardless of the mouse", () => {
    for (const pointerEngaged of [true, false]) {
      expect(
        tooltipPointerPolicy({
          required: false,
          dismissalId: undefined,
          pointerEngaged,
        }).interactive,
      ).toBe(false);
    }
  });

  it("never turns interactive without the link — the link is the only reason", () => {
    // Exhaustive over the input space: interactive ⇒ showDismissLink.
    for (const required of [true, false]) {
      for (const dismissalId of ["id", undefined]) {
        for (const pointerEngaged of [true, false]) {
          const p = tooltipPointerPolicy({
            required,
            dismissalId,
            pointerEngaged,
          });
          if (p.interactive) expect(p.showDismissLink).toBe(true);
        }
      }
    }
  });
});
