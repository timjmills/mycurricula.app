"use client";

// RailAddMenu.tsx — the "+" add-panel picker. Opened from RailAddButton at the
// bottom of an icon rail, it lists EVERY rail feature in one menu and lets a
// teacher tap any feature to add it to this rail (or tap an already-present
// feature to remove it back to the hidden bucket).
//
// ── Why a dedicated picker, not the context menu ──────────────────────────
// RailContextMenu (right-click / long-press on a single icon) answers "where
// should THIS icon live?". This menu answers the inverse, discovery-first
// question: "what CAN live on this rail, and which of them are here already?".
// A teacher building out a rail wants the whole catalogue in front of them
// with live selected-state — so this is a multi-pick menu that stays open
// across picks rather than closing on the first action.
//
// The popover visual recipe (fixed position, paper bg, --ink-150 border,
// var(--shadow-popover), viewport clamp via useLayoutEffect, dismiss on Esc /
// outside mousedown) is copied from RailContextMenu so the two shell surfaces
// feel like siblings.
//
// ── Onboarding tooltips (CLAUDE.md §4) ────────────────────────────────────
// Every row carries a Button `tooltip=` in onboarding voice so a first-time
// teacher learns what the feature is and what tapping it will do — including
// the subtler "this lives on the OTHER rail, so picking it MOVES it here"
// case. The tooltip paints toward the canvas (away from the rail).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui";
import { useRailLayout } from "@/lib/use-rail-layout";
import {
  RAIL_ICON_ORDER,
  RAIL_ICON_LABEL,
  RAIL_ICON_BLURB,
  RailGlyph,
} from "./rail-icon-meta";

interface RailAddMenuProps {
  /** Which rail this picker fills — drives both the moves and the copy. */
  side: "left" | "right";
  /** Open-point viewport coordinates (the spot the button opened from). */
  x: number;
  y: number;
  onClose: () => void;
}

export function RailAddMenu({
  side,
  x,
  y,
  onClose,
}: RailAddMenuProps): ReactNode {
  const { layout, moveIcon } = useRailLayout();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // The add button sits at the BOTTOM of the rail, so `y` is large and a
  // top-anchored menu would spill below the viewport. Same Math.min/Math.max
  // clamp as RailContextMenu — clamping `top` against innerHeight naturally
  // shifts the menu upward so its full height stays on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - width - 8);
    const ny = Math.min(y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  // Dismiss on outside-click or Esc. Identical listener pattern to
  // RailContextMenu so dismissal feels the same across shell popovers.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const otherSide = side === "left" ? "right" : "left";
  // The bubble should paint toward the canvas, away from the rail it sits on.
  const tooltipSide = side === "left" ? "right" : "left";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Add a panel to the ${side} rail`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: 1000,
        minWidth: 260,
        background: "var(--paper)",
        borderRadius: "var(--r-6)",
        border: "1px solid var(--ink-150)",
        boxShadow: "var(--shadow-popover)",
        padding: 4,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: "var(--t-10)",
          color: "var(--ink-400)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 500,
          padding: "6px 10px 2px",
        }}
      >
        Add to {side} rail
      </div>

      {RAIL_ICON_ORDER.map((id) => {
        const onThisRail = layout[side].includes(id);
        const onOtherRail = layout[otherSide].includes(id);
        const label = RAIL_ICON_LABEL[id];
        const blurb = RAIL_ICON_BLURB[id];

        return (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            role="menuitemcheckbox"
            aria-checked={onThisRail}
            // Stay open after a pick — a teacher may add/remove several in a
            // row. useRailLayout broadcasts in-process, so the menu re-renders
            // with fresh selected-state on every toggle without closing.
            onClick={() => {
              if (onThisRail) {
                moveIcon(id, "hidden", Number.POSITIVE_INFINITY);
              } else {
                moveIcon(id, side, Number.POSITIVE_INFINITY);
              }
            }}
            tooltip={
              onThisRail
                ? `Remove ${label} from the ${side} rail (kept in your settings so you can add it back).`
                : `Add ${label} to the ${side} rail — ${blurb}`
            }
            tooltipSide={tooltipSide}
            style={{
              width: "100%",
              minHeight: 44,
              justifyContent: "flex-start",
              gap: 10,
              padding: "6px 10px",
              // Active rows read as selected with a subtle fill.
              background: onThisRail ? "var(--ink-100)" : "transparent",
            }}
          >
            {/* Feature glyph — the same icon the rail draws. */}
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                color: "var(--ink-700)",
              }}
            >
              <RailGlyph id={id} />
            </span>

            {/* Label + one-line description, left-aligned in a column. */}
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                minWidth: 0,
                flex: "1 1 auto",
                textAlign: "left",
              }}
            >
              <span style={{ color: "var(--ink-900)", fontWeight: 500 }}>
                {label}
              </span>
              <span
                style={{
                  fontSize: "var(--t-11)",
                  color: "var(--ink-500)",
                  lineHeight: 1.3,
                }}
              >
                {blurb}
              </span>
            </span>

            {/* Trailing state: a check when it's on this rail; an "On {other}
                rail" note when it lives on the opposite rail (so the teacher
                knows picking it will MOVE it here, not duplicate it). */}
            {onThisRail ? (
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "0 0 auto", color: "var(--ink-700)" }}
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : onOtherRail ? (
              <span
                style={{
                  flex: "0 0 auto",
                  fontSize: "var(--t-11)",
                  color: "var(--ink-400)",
                  whiteSpace: "nowrap",
                }}
              >
                On {otherSide} rail
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
