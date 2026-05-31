"use client";

// components/teach/annotation/ToolDock.tsx — the floating bottom dock (plan
// §5.3, artboard T1).
//
// A compact, draggable cluster of the most-used tools (select / text / pen)
// plus "Soon" tiles for the deferred interactive-widget library (sticky note /
// timer / dice / poll — Phase 3). The live tools dispatch setTool; the deferred
// ones render as disabled FutureControls so they never read as broken.
//
// Draggable via framer-motion `drag`, honouring useReducedMotion() — under
// reduced motion the dock is fixed in place (no drag, no spring).

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, FutureControl, Tooltip } from "@/components/ui";
import type { TeachWorkspaceAction } from "@/components/teach";
import type { BoardTool, TeachWorkspaceState } from "@/lib/teach/types";
import styles from "./ToolDock.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface ToolDockProps {
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  /** Bounds the dock can be dragged within (a ref to the board container). */
  dragConstraints?: React.RefObject<HTMLElement | null>;
}

interface LiveTool {
  tool: BoardTool;
  glyph: string;
  label: string;
  tip: string;
}

const LIVE_TOOLS: readonly LiveTool[] = [
  {
    tool: "select",
    glyph: "⬚",
    label: "Select",
    tip: "Stop drawing and interact with what's on the board",
  },
  {
    tool: "pen",
    glyph: "✎",
    label: "Pen",
    tip: "Draw freehand on the board",
  },
  {
    tool: "text",
    glyph: "T",
    label: "Text",
    tip: "Click to place a text label on the board",
  },
];

const SOON_TILES: ReadonlyArray<{ glyph: string; tip: string }> = [
  {
    glyph: "▥",
    tip: "Sticky note — drop quick reminders on the board (coming after beta)",
  },
  {
    glyph: "⏱",
    tip: "Timer — a live countdown for the class (coming after beta)",
  },
  { glyph: "⚄", tip: "Dice — roll for random picks (coming after beta)" },
  {
    glyph: "📊",
    tip: "Poll — gather quick class responses (coming after beta)",
  },
];

export function ToolDock({
  state,
  dispatch,
  dragConstraints,
}: ToolDockProps): ReactNode {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      className={styles.dock}
      role="toolbar"
      aria-label="Quick tools"
      title="A movable set of quick drawing tools"
      // Drag is disabled under reduced motion (the spring + free movement is
      // exactly the kind of motion the preference asks us to suppress).
      drag={!reduced}
      dragMomentum={false}
      dragConstraints={dragConstraints}
      dragElastic={0}
    >
      {/* Drag handle — also the only drag affordance for keyboard/touch users
          who can't free-drag (they keep the default placement). */}
      <span
        className={styles.handle}
        aria-hidden="true"
        title="Drag to move this toolbar"
      >
        ⠿
      </span>

      {LIVE_TOOLS.map((t) => {
        const active = state.activeTool === t.tool;
        return (
          <Tooltip
            key={t.tool}
            content={t.tip}
            side="top"
            tooltipId={`teach-dock-${t.tool}`}
          >
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel={t.label}
              aria-pressed={active}
              className={active ? styles.activeTool : undefined}
              onClick={() => dispatch({ type: "setTool", tool: t.tool })}
            >
              <span aria-hidden="true">{t.glyph}</span>
            </Button>
          </Tooltip>
        );
      })}

      <span className={styles.divider} aria-hidden="true" />

      {SOON_TILES.map((tile, i) => (
        <FutureControl
          key={i}
          variant="icon-only"
          leadingIcon={<span aria-hidden="true">{tile.glyph}</span>}
          tooltip={tile.tip}
          tooltipSide="top"
        />
      ))}
    </motion.div>
  );
}
