"use client";

/* RailAddButton — the "+" affordance at the bottom of an icon rail.
 *
 * Clicking it opens RailAddMenu beside the button (toward the canvas), where
 * the teacher picks which features live on this rail. The button itself reads
 * as an "add" slot via a dashed border (see RailAddButton.module.css).
 *
 * ── Why a plain <button>, not the <Button> primitive ────────────────────────
 * The canonical <Button variant="icon"> sets its own size via `.icon.md`
 * (width:40px) and `.btn` height rules whose specificity (0,2,0) beats this
 * component's single `.addButton` class — so the rail "+" rendered at 36×29px,
 * below the ≥44px touch-target floor (CLAUDE.md §4). Rendering a plain
 * <button> styled entirely by the module guarantees the 44×44 target without a
 * specificity fight. The onboarding tooltip is supplied by wrapping the button
 * in the canonical <Tooltip> primitive (same requirement the <Button> tooltip
 * prop satisfied). We read the rendered button's rect off the click event's
 * currentTarget to anchor the menu — no ref needed. */

import { useState, type MouseEvent, type ReactNode } from "react";

import { Tooltip } from "@/components/ui";

import { RailAddMenu } from "./RailAddMenu";
import styles from "./RailAddButton.module.css";

interface RailAddButtonProps {
  /** Which rail this button manages. Only the two visible rails carry an add
   *  button — the "hidden" bucket is never a placement target here, so we
   *  narrow to "left" | "right" (matches RailAddMenu's `side` prop). */
  side: "left" | "right";
}

export function RailAddButton({ side }: RailAddButtonProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // currentTarget is the rendered <button>, so its rect is exact.
    const rect = event.currentTarget.getBoundingClientRect();

    // Open the menu beside the button, toward the canvas. The menu's own clamp
    // keeps it on-screen if the computed point would overflow.
    const x = side === "left" ? rect.right + 4 : rect.left - 4;
    const y = rect.top;

    setPos({ x, y });
    setOpen(true);
  }

  return (
    <>
      <Tooltip
        content="Add a panel to this rail — pick which tools live here."
        side={side === "left" ? "right" : "left"}
      >
        <button
          type="button"
          className={styles.addButton}
          aria-label={`Add a panel to the ${side} rail`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleClick}
        >
          {/* Plus glyph — two strokes forming a +. */}
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </Tooltip>

      {open && pos ? (
        <RailAddMenu
          side={side}
          x={pos.x}
          y={pos.y}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
