"use client";

// RailContextMenu.tsx — small popover anchored to a rail icon, exposing
// three layout actions: move to left, move to right, hide from rails.
//
// Opens on right-click (onContextMenu) or after a long-press on touch
// (≥500ms press, ≤10px movement). Closes on Esc, outside click, or
// after the teacher picks an action.
//
// ── Why a new menu, not the lesson context-menu ──────────────────────────
// components/lesson-card/context-menu.tsx is tightly bound to the Lesson
// data model — its rows reference status, modified flags, master mode,
// etc. A rail icon has none of that. Building a lightweight menu here
// keeps the JSX honest, matches the rail's onboarding voice, and avoids
// the temptation to bleed lesson-specific concerns into shell chrome.
// The visual recipe + viewport-clamp behavior is copied from the lesson
// menu so the two surfaces feel related. The recipe itself lives in
// RailContextMenu.module.css — read its header for why this file no longer
// declares the surface inline.
//
// ── Onboarding tooltips ──────────────────────────────────────────────────
// Each menu item gets a Button `tooltip=` per CLAUDE.md §4 so a first-time
// teacher can hover to learn what the action does. Disabled items still
// carry a tooltip explaining why they're disabled (e.g. "this icon already
// lives on the left rail").

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui";
import type { RailIconId, RailSide } from "@/lib/use-rail-layout";
import { RAIL_ICON_LABEL } from "./rail-icon-meta";
import styles from "./RailContextMenu.module.css";

/** Shared style for the three action rows.
 *
 *  ── Why the ink is wrapped in a var(), and why this is still inline ───────
 *  These rows render through the `Button` primitive, whose `.btn.ghost`
 *  rules (0,2,0) — including `:hover` at (0,3,0) — declare `color`. The
 *  inline `color` is what makes a menu row full-strength ink instead of the
 *  ghost variant's muted `--ink-soft`, on rest AND on hover. Moving it to a
 *  single-class module rule (0,1,0) would lose to both and silently change
 *  the menu, so the declaration stays where it is and gains a hook instead:
 *  `var(--rcm-item-ink, <what it already was>)`.
 *
 *  A custom property is a DIFFERENT property from the one declared inline,
 *  so `.rail-menu { --rcm-item-ink: … }` can now set it (custom properties
 *  inherit, so the container is a sufficient handle), while the fallback
 *  keeps the painted colour byte-identical wherever it is unset. Nothing
 *  sets it today. Same conversion as ChromeClock's `--clk-dot` (4e0d90f)
 *  and LessonCard's `--lc-*` (de7a904).
 *
 *  `width`/`justifyContent` stay bare: they are layout, and `.btn` declares
 *  `justify-content: center` at (0,1,0), which a module rule would only tie. */
const ITEM_STYLE = {
  width: "100%",
  justifyContent: "flex-start",
  color: "var(--rcm-item-ink, var(--ink-900))",
} as const;

interface RailContextMenuProps {
  /** The icon the menu was opened from. Drives the labels and disabled
   *  states (you can't move to the side you're already on). */
  iconId: RailIconId;
  /** The icon's current side. */
  currentSide: RailSide;
  /** Open-point viewport coordinates. */
  x: number;
  y: number;
  /** Fires when the teacher picks a destination — close the menu and write
   *  the move through useRailLayout. */
  onSelect: (toSide: RailSide) => void;
  onClose: () => void;
}

export function RailContextMenu({
  iconId,
  currentSide,
  x,
  y,
  onSelect,
  onClose,
}: RailContextMenuProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp the menu inside the viewport once it has measured itself.
  // Same recipe as components/lesson-card/context-menu.tsx so menus across
  // the app behave identically.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - width - 8);
    const ny = Math.min(y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  // Dismiss on outside-click or Esc.
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

  const fire = useCallback(
    (toSide: RailSide) => {
      onSelect(toSide);
      onClose();
    },
    [onClose, onSelect],
  );

  const label = RAIL_ICON_LABEL[iconId];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${label} placement`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      // `rail-menu` is an unstyled GLOBAL handle: the module class beside it
      // is hashed and therefore invisible to app/themes.css, so a frame arm
      // needs a stable selector to reach this overlay. See the module header.
      className={`rail-menu ${styles.menu}`}
      // Only the measured open position stays inline — everything
      // presentational moved to RailContextMenu.module.css so the cascade
      // can reach it (an inline declaration outranks every author rule).
      style={{ top: pos.y, left: pos.x }}
    >
      <div className={styles.label}>{label}</div>

      <Button
        variant="ghost"
        size="sm"
        role="menuitem"
        disabled={currentSide === "left"}
        onClick={() => fire("left")}
        tooltip={
          currentSide === "left"
            ? `${label} already lives on the left rail`
            : `Move ${label} to the left rail — the site-wide chrome on the left edge of the planner.`
        }
        tooltipSide="right"
        style={ITEM_STYLE}
      >
        Move to left rail
      </Button>

      <Button
        variant="ghost"
        size="sm"
        role="menuitem"
        disabled={currentSide === "right"}
        onClick={() => fire("right")}
        tooltip={
          currentSide === "right"
            ? `${label} already lives on the right rail`
            : `Move ${label} to the right rail — your context-specific shortcuts column on the right edge.`
        }
        tooltipSide="right"
        style={ITEM_STYLE}
      >
        Move to right rail
      </Button>

      <div role="separator" className={styles.sep} />

      <Button
        variant="ghost"
        size="sm"
        role="menuitem"
        disabled={currentSide === "hidden"}
        onClick={() => fire("hidden")}
        tooltip={
          currentSide === "hidden"
            ? `${label} is already hidden from the rails`
            : `Hide ${label} from both rails — it stays in your settings so you can bring it back later.`
        }
        tooltipSide="right"
        style={ITEM_STYLE}
      >
        Hide from rails
      </Button>
    </div>
  );
}
