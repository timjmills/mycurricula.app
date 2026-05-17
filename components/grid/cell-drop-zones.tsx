"use client";

// cell-drop-zones.tsx — drag-target overlay for a Weekly-grid cell.
//
// Rendered inside a cell (position: absolute; inset: 0) while a lesson is
// being dragged. It presents spatial drop targets so a teacher can choose
// exactly how the dropped lesson arranges relative to the existing ones:
//
//   Empty cell  → one full-cell zone → "cell"
//   Has lessons → five-zone layout:
//     • Top strip    → "above"      (stack above existing)
//     • Bottom strip → "below"      (stack below existing)
//     • Left half    → "half-left"  (side-by-side, left)
//     • Right half   → "half-right" (side-by-side, right)
//     • Center       → "on"         (add to the paged stack)
//
// Each zone handles native HTML5 DnD events (onDragOver / onDrop), tracks
// its own hover state, and displays a small icon + label so the affordance
// is legible. No extra DnD library is introduced.

import type { DragEvent, ReactNode } from "react";
import { useState } from "react";
import type { DropRegion } from "@/lib/cell-layout";
import styles from "./cell-drop-zones.module.css";

// ── Props ─────────────────────────────────────────────────────────────

interface CellDropZonesProps {
  /** Render the overlay only while a lesson is being dragged. */
  visible: boolean;
  /** Whether the cell already has lessons (changes which zones show). */
  hasLessons: boolean;
  /** Fired when a lesson is dropped on a zone. */
  onPick: (region: DropRegion) => void;
}

// ── Component ─────────────────────────────────────────────────────────

/** Absolute overlay that presents drop-zone targets inside a cell during drag. */
export function CellDropZones({
  visible,
  hasLessons,
  onPick,
}: CellDropZonesProps): ReactNode {
  // While dragging is not active, render nothing — keep it out of the DOM
  // entirely so it never interferes with pointer events on the cell contents.
  if (!visible) return null;

  // Empty cell: one full-cell target so the drag affords a simple "drop here".
  if (!hasLessons) {
    return <FullCellZone onPick={onPick} />;
  }

  // Populated cell: five-zone spatial layout.
  return (
    <div
      className={styles.overlay}
      // Prevent the container itself from receiving drop events — only the
      // inner zones should respond.
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Top strip — stack the dropped lesson above the existing ones. */}
      <Zone region="above" onPick={onPick}>
        <AboveIcon />
        <span className={styles.zoneLabel}>Stack above</span>
      </Zone>

      {/* Middle row: left half | center stack | right half */}
      <div className={styles.middleRow}>
        <Zone region="half-left" onPick={onPick}>
          <SideBySideLeftIcon />
          <span className={styles.zoneLabel}>Side by side</span>
        </Zone>

        <Zone region="on" onPick={onPick}>
          <OnTopIcon />
          <span className={styles.zoneLabel}>Add to stack</span>
        </Zone>

        <Zone region="half-right" onPick={onPick}>
          <SideBySideRightIcon />
          <span className={styles.zoneLabel}>Side by side</span>
        </Zone>
      </div>

      {/* Bottom strip — stack the dropped lesson below the existing ones. */}
      <Zone region="below" onPick={onPick}>
        <BelowIcon />
        <span className={styles.zoneLabel}>Stack below</span>
      </Zone>
    </div>
  );
}

// ── Zone primitive ────────────────────────────────────────────────────

interface ZoneProps {
  region: DropRegion;
  onPick: (region: DropRegion) => void;
  children: ReactNode;
}

/** A single drop zone: handles DnD events and local hover highlight. */
function Zone({ region, onPick, children }: ZoneProps): ReactNode {
  const [hovered, setHovered] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    // Must call preventDefault to signal the browser that this is a valid
    // drop target; without it, onDrop never fires.
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setHovered(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>): void {
    // Only clear hover when the pointer leaves this zone element, not when
    // it moves into a child (e.g. the label span).
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHovered(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setHovered(false);
    onPick(region);
  }

  // Map region to a per-zone CSS modifier class for accent coloring.
  const regionClass =
    region === "above"
      ? styles.zoneAbove
      : region === "below"
        ? styles.zoneBelow
        : region === "half-left"
          ? styles.zoneLeft
          : region === "half-right"
            ? styles.zoneRight
            : styles.zoneOn; // "on"

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={zoneLabel(region)}
      className={`${styles.zone} ${regionClass} ${hovered ? styles.zoneHover : ""}`}
      onDragOver={handleDragOver}
      onDragEnter={() => setHovered(true)}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      // Keyboard drop: space/enter simulates a drop for keyboard users.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(region);
        }
      }}
    >
      <span className={styles.zoneIcon}>{children}</span>
    </div>
  );
}

// ── Full-cell zone (empty cell) ───────────────────────────────────────

interface FullCellZoneProps {
  onPick: (region: DropRegion) => void;
}

/** Single full-overlay drop target shown when the cell has no lessons. */
function FullCellZone({ onPick }: FullCellZoneProps): ReactNode {
  const [hovered, setHovered] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHovered(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHovered(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setHovered(false);
    onPick("cell");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop lesson into this cell"
      className={`${styles.zoneFull} ${hovered ? styles.zoneHover : ""}`}
      onDragOver={handleDragOver}
      onDragEnter={() => setHovered(true)}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick("cell");
        }
      }}
    >
      <span className={styles.zoneIcon}>
        <DropHereIcon />
      </span>
      <span className={styles.zoneLabel}>Drop here</span>
    </div>
  );
}

// ── Accessible zone label helper ──────────────────────────────────────

function zoneLabel(region: DropRegion): string {
  switch (region) {
    case "above":
      return "Stack above existing lessons";
    case "below":
      return "Stack below existing lessons";
    case "half-left":
      return "Place side by side on the left";
    case "half-right":
      return "Place side by side on the right";
    case "on":
      return "Add to the paged stack";
    case "cell":
      return "Drop lesson into this cell";
  }
}

// ── Icons (inline SVG, aria-hidden) ──────────────────────────────────
// Sized at 14×14 — readable at the compact cell scale without crowding.

function AboveIcon(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Arrow pointing up */}
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

function BelowIcon(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Arrow pointing down */}
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </svg>
  );
}

function SideBySideLeftIcon(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Two vertical columns side by side; left one highlighted */}
      <rect x="3" y="4" width="7" height="16" rx="1.5" strokeWidth="2.5" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" />
    </svg>
  );
}

function SideBySideRightIcon(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Two vertical columns side by side; right one highlighted */}
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" strokeWidth="2.5" />
    </svg>
  );
}

function OnTopIcon(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Stacked layers icon */}
      <rect x="4" y="13" width="16" height="5" rx="1.5" />
      <rect x="4" y="7" width="16" height="5" rx="1.5" strokeWidth="2.5" />
    </svg>
  );
}

function DropHereIcon(): ReactNode {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Downward arrow into a tray */}
      <path d="M12 3v13" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
