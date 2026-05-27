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
// menu so the two surfaces feel related.
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

// Pretty-name for an icon — used in tooltip copy. Not a translation table;
// just enough so the menu reads naturally on first hover. The Settings
// page (Lane GC) will use a richer registry.
const ICON_LABEL: Record<RailIconId, string> = {
  today: "Today",
  schedule: "Schedule",
  todos: "To-dos",
  comments: "Shoutbox",
  resources: "Resources",
  year: "Year overview",
  voice: "Voice note",
  settings: "Settings",
};

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

  const label = ICON_LABEL[iconId];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${label} placement`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: 1000,
        minWidth: 200,
        background: "var(--paper)",
        borderRadius: 6,
        border: "1px solid var(--ink-150)",
        boxShadow: "var(--shadow-popover)",
        padding: 4,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--ink-400)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 500,
          padding: "6px 10px 2px",
        }}
      >
        {label}
      </div>

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
        style={{
          width: "100%",
          justifyContent: "flex-start",
          color: "var(--ink-900)",
        }}
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
        style={{
          width: "100%",
          justifyContent: "flex-start",
          color: "var(--ink-900)",
        }}
      >
        Move to right rail
      </Button>

      <div
        role="separator"
        style={{
          height: 1,
          background: "var(--ink-100)",
          margin: "4px 2px",
        }}
      />

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
        style={{
          width: "100%",
          justifyContent: "flex-start",
          color: "var(--ink-900)",
        }}
      >
        Hide from rails
      </Button>
    </div>
  );
}
