"use client";

/* RailAddButton — the "+" affordance at the bottom of an icon rail.
 *
 * Clicking it opens RailAddMenu beside the button (toward the canvas), where
 * the teacher picks which features live on this rail. The button itself reads
 * as an "add" slot via a dashed border (see RailAddButton.module.css).
 *
 * ── Anchoring note ──────────────────────────────────────────────────────────
 * The canonical <Button> primitive (components/ui/Button.tsx) is a plain
 * function component — it does NOT forward refs, but it DOES spread `...rest`
 * (including the synthetic onClick) onto the underlying <button>. So rather
 * than measuring via a ref, we read the rendered <button>'s rect straight off
 * the click event's currentTarget. Same end result, no ref-forwarding
 * dependency. */

import { useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui";

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
    // currentTarget is the actual rendered <button>, so its rect is exact even
    // though Button doesn't forward a ref.
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
      <Button
        variant="icon"
        className={styles.addButton}
        iconAriaLabel={`Add a panel to the ${side} rail`}
        tooltip="Add a panel to this rail — pick which tools live here."
        tooltipSide={side === "left" ? "right" : "left"}
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
      </Button>

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
