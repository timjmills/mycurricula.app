"use client";

// TeachShell.tsx — the Teach view's 5-zone shell (Wave 0 skeleton).
//
// Lays out the five structural zones from spec §2, left → right:
//
//   [far-left rail] [left panel] [center board] [right panel] [far-right rail]
//
// via a single CSS grid (see TeachShell.module.css). Wave 0 is a SKELETON —
// each zone renders a clearly LABELED placeholder so the structure is visible.
// No functionality yet: panels don't resize/collapse, tabs/widgets don't
// exist, nothing persists. Those land in later waves (plan §2).
//
// ── Shell suppression ─────────────────────────────────────────────────────
// /teach lives in the (planner) route group so it inherits auth + the
// Personal/Team banner + the top bar (so the Teach tab can highlight). But
// Teach owns its own chrome, so it suppresses the planner's default left
// filter panel, right panel, and the two icon rails — mirroring the print
// route's pattern: a `data-teach-view` attribute on the root triggers
// `:global` rules in app/globals.css that hide that chrome on this route.
//
// ── <900px fallback (Wave 0 decision) ──────────────────────────────────────
// Below ~900px we collapse to a stacked single-panel view (center board only)
// with a short note that the rails/panels are available on a larger screen —
// see the media query in TeachShell.module.css. This keeps Teach reachable on
// tablet/phone rather than redirecting away.
//
// ── Present mode (Wave 0 stub) ──────────────────────────────────────────────
// The Daily "Present" button pushes /teach?present=1. We read the param and,
// when set, surface a small placeholder note. Full fullscreen-immersive
// Present mode is Wave 5.

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./TeachShell.module.css";

// ── Zone descriptors ───────────────────────────────────────────────────────
// The five zones in render order. Each carries its placeholder label and a
// short note describing what will live there once later waves fill it in.
// Keeping this as data (rather than five hand-written blocks) makes the Wave 0
// structure legible and keeps the markup a single map.

type ZoneKind = "rail" | "left" | "center" | "right";

interface ZoneDescriptor {
  /** Stable key for the render map. */
  key: string;
  /** Which CSS treatment the zone gets (rail strip vs panel vs center). */
  kind: ZoneKind;
  /** The visible placeholder label. */
  label: string;
  /** Short description of the zone's eventual content. */
  note: string;
}

const ZONES: ZoneDescriptor[] = [
  {
    key: "far-left-rail",
    kind: "rail",
    label: "Far-left rail",
    note: "Module icons (Wave 1)",
  },
  {
    key: "left-panel",
    kind: "left",
    label: "Left panel",
    note: "Lesson context modules — Lessons, Lesson, Boards, Notes (Wave 1–2)",
  },
  {
    key: "center-board",
    kind: "center",
    label: "Center board",
    note: "The Teaching Board — widget grid + layout toolbar (Wave 3)",
  },
  {
    key: "right-panel",
    kind: "right",
    label: "Right panel",
    note: "Resources, Chat, To-do (Wave 1–2)",
  },
  {
    key: "far-right-rail",
    kind: "rail",
    label: "Far-right rail",
    note: "Module icons (Wave 1)",
  },
];

/** Map a zone kind to its CSS-module classes. */
function zoneClassName(kind: ZoneKind): string {
  const classes = [styles.zone];
  if (kind === "rail") classes.push(styles.rail);
  if (kind === "left") classes.push(styles.left);
  if (kind === "right") classes.push(styles.right);
  if (kind === "center") classes.push(styles.center);
  return classes.join(" ");
}

// ── TeachShell ──────────────────────────────────────────────────────────────

export function TeachShell(): ReactNode {
  // Present mode is requested via the `present` search param (Daily's Present
  // button pushes /teach?present=1). Wave 0 only notes it; Wave 5 wires the
  // actual fullscreen-immersive behavior.
  const searchParams = useSearchParams();
  const isPresent = searchParams.get("present") === "1";

  return (
    // data-teach-view triggers the :global selectors in app/globals.css that
    // suppress the planner's default left filter panel, right panel, and the
    // two icon rails on this route (Teach owns its own chrome).
    <div data-teach-view className={styles.page}>
      {/* Present-mode stub note — acknowledges ?present=1 until Wave 5 wires
          the real fullscreen-immersive mode. */}
      {isPresent && (
        <div className={styles.presentNote} role="status">
          Present mode requested (full fullscreen view arrives in a later
          update).
        </div>
      )}

      {/* Stacked-fallback note — hidden ≥900px via CSS; visible only in the
          single-panel fallback so a tablet/phone teacher understands why the
          rails and side panels aren't showing. */}
      <p className={styles.fallbackNote}>
        The side rails and panels appear on a larger screen. The teaching board
        is shown here.
      </p>

      {/* The five zones. Each renders a labeled placeholder in Wave 0. */}
      <div className={styles.zones}>
        {ZONES.map((zone) => (
          <section
            key={zone.key}
            className={zoneClassName(zone.kind)}
            aria-label={zone.label}
          >
            <div className={styles.placeholder}>
              <span className={styles.placeholderLabel}>{zone.label}</span>
              {/* Rails are too slim for the descriptive note; show it only on
                  the wider panel/center zones. */}
              {zone.kind !== "rail" && (
                <span className={styles.placeholderNote}>{zone.note}</span>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
