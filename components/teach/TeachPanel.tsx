"use client";

// TeachPanel.tsx — a dockable-lite side panel for the Teach workspace.
//
// One panel lives on each side of the center board (left + right). A panel:
//
//   ┌───────────────────────────────────────────┐
//   │ TeachTabStrip  (tabs + "+" picker)  [⟨]    │  ← header
//   ├───────────────────────────────────────────┤
//   │                                             │
//   │   active module body                        │  ← MODULE_REGISTRY
//   │   (MODULE_REGISTRY[activeTab].render(ctx))  │     render slot
//   │                                             │
//   └───────────────────────────────────────────┘
//   …with a PaneSplitter living on its inner edge (handled by TeachShell,
//   which owns the grid track + width math).
//
// ── Collapse ──────────────────────────────────────────────────────────────
// The collapse toggle in the header shrinks the whole panel to a 32px rail
// STRIP showing a single re-expand button (a vertical chevron). The strip is
// itself clickable to re-expand. Collapsed state + width are owned by the
// workspace hook (TeachShell passes them down + the callbacks); this
// component is presentation + local interaction only.
//
// ── Why the splitter lives in TeachShell, not here ─────────────────────────
// The resize handle has to sit BETWEEN the panel and the center board and
// resolve its drag against the live grid — exactly the pattern WeeklyShell
// uses (PaneSplitter as a sibling grid track, not a child of the panel). So
// TeachShell renders the <PaneSplitter> next to <TeachPanel>; this component
// stays a self-contained tab+body shell. (Brief calls for "reuse PaneSplitter
// for the resize handle" — TeachShell wires it; this header documents the
// seam so the two read as one feature.)
//
// ── Tokens / a11y / motion ────────────────────────────────────────────────
// Tokens only; ≥44px touch targets; the collapse toggle + the collapsed
// re-expand strip each carry a dismissible onboarding <Tooltip tooltipId>.
// The collapse width transition (~200ms) is gated by prefers-reduced-motion
// in the module.css.

import { useId, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import { TeachTabStrip } from "./TeachTabStrip";
import { MODULE_REGISTRY } from "@/components/teach/module-registry";
import type { ModuleId, PanelSide } from "@/lib/teach/teach-types";
import type { Lesson } from "@/lib/types";
import styles from "./TeachPanel.module.css";

// ── ChevronIcon ─────────────────────────────────────────────────────────────
// A single chevron used for both the header collapse toggle and the collapsed
// re-expand strip. `direction` points it toward the action: for a LEFT panel
// collapsing pulls the chevron toward the left edge, etc. aria-hidden — the
// wrapping control carries the label.

function ChevronIcon({
  direction,
}: {
  direction: "left" | "right";
}): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? (
        <polyline points="15 6 9 12 15 18" />
      ) : (
        <polyline points="9 6 15 12 9 18" />
      )}
    </svg>
  );
}

// ── TeachPanel ───────────────────────────────────────────────────────────────

interface TeachPanelProps {
  /** Which side this panel docks on. Drives the collapse chevron direction
   *  and the tab-strip aria scoping. */
  side: PanelSide;
  /** Ordered module ids shown as tabs. */
  tabs: ModuleId[];
  /** The active tab whose module body renders. */
  activeTab: ModuleId;
  /** Whether the panel is collapsed to its 32px strip. */
  collapsed: boolean;
  /** Module ids eligible to add via the tab strip's "+" picker. */
  addable: ModuleId[];
  /** The lesson context passed to the active module's render(ctx). */
  lesson: Lesson | null;
  /** Toggle this panel collapsed / expanded. */
  onToggleCollapse: () => void;
  /** Switch the active tab. */
  onActivateTab: (id: ModuleId) => void;
  /** Commit a tab reorder — receives the full reordered id array. */
  onReorderTabs: (ids: ModuleId[]) => void;
  /** Add a module as a new tab in this panel. */
  onAddModule: (id: ModuleId) => void;
}

export function TeachPanel({
  side,
  tabs,
  activeTab,
  collapsed,
  addable,
  lesson,
  onToggleCollapse,
  onActivateTab,
  onReorderTabs,
  onAddModule,
}: TeachPanelProps): ReactNode {
  // Stable id for the active module body so the tab strip's tabs can point at
  // it via aria-controls and the body carries the matching role="tabpanel" id.
  // Called unconditionally (before the collapsed early-return) per the rules
  // of hooks.
  const panelBodyId = useId();

  // Collapse-chevron direction: a LEFT panel collapses toward the left edge
  // (chevron points left); a RIGHT panel collapses toward the right edge.
  // The collapsed strip's re-expand chevron points the opposite way (toward
  // the board) so it reads as "open me back up".
  const collapseDir = side === "left" ? "left" : "right";
  const expandDir = side === "left" ? "right" : "left";

  // ── Collapsed strip ───────────────────────────────────────────────────
  // A 32px rail showing one re-expand button that fills the strip so the
  // whole thing is an easy ≥44px-tall target. Clicking anywhere on it
  // re-expands the panel.
  if (collapsed) {
    return (
      <div
        className={`${styles.panel} ${styles.collapsed}`}
        data-side={side}
        // Touch users get an explanation by holding the strip (CLAUDE.md §4
        // panel-title convention).
        title="Show this panel again"
      >
        <Tooltip
          content="Show this panel again"
          tooltipId={`teach-panel-expand-${side}`}
          side={expandDir}
        >
          <button
            type="button"
            className={styles.expandStrip}
            aria-label="Expand panel"
            onClick={onToggleCollapse}
          >
            <ChevronIcon direction={expandDir} />
          </button>
        </Tooltip>
      </div>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────────────
  const activeEntry = MODULE_REGISTRY[activeTab];

  return (
    <div
      className={styles.panel}
      data-side={side}
      // Touch-hold explanation for the panel as a whole (CLAUDE.md §4).
      title="A dockable panel — drag its tabs to reorder, or collapse it to a strip"
    >
      {/* Header row: tab strip + collapse toggle. The toggle sits on the
          inner edge (toward the board) so it reads as "tuck me away". */}
      <div className={styles.header}>
        <div className={styles.headerTabs}>
          <TeachTabStrip
            side={side}
            tabs={tabs}
            activeTab={activeTab}
            addable={addable}
            panelBodyId={panelBodyId}
            onActivate={onActivateTab}
            onReorder={onReorderTabs}
            onAdd={onAddModule}
          />
        </div>
        <Tooltip
          content="Collapse this panel to a slim strip to give the board more room"
          tooltipId={`teach-panel-collapse-${side}`}
          side="bottom"
        >
          <button
            type="button"
            className={styles.collapseBtn}
            aria-label="Collapse panel"
            onClick={onToggleCollapse}
          >
            <ChevronIcon direction={collapseDir} />
          </button>
        </Tooltip>
      </div>

      {/* Active module body — role="tabpanel" with the id the active tab's
          aria-controls points at. The registry render fn receives the lesson
          context; modules that don't need it ignore the prop. The body
          scrolls internally so the panel never grows the document. */}
      <div
        id={panelBodyId}
        className={styles.body}
        role="tabpanel"
        aria-label={activeEntry.label}
      >
        {activeEntry.render({ lesson })}
      </div>
    </div>
  );
}
