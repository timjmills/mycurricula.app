"use client";

// LaneCard — left-edge lane label.
//
// Visual recipe is COPIED VERBATIM from /weekly's grid subject row label
// (`.subjectHead` + `.subjectTile` + `.subjectName` in
// components/grid/WeeklyGrid.module.css, lines 251–288) — the canonical
// "subject button" used to identify a subject row throughout the app.
// Per CLAUDE.md / BUILD_STANDARD §2, every subject identity treatment
// in the product must read as the same recipe. The Year lane is no
// exception: it is a subject row label, so it consumes the same markup
// and CSS class names the Weekly grid uses.
//
// Two display modes:
//   • full       — the subject tile + subject name; one short horizontal row.
//   • minimized  — identical visual, but expandable via the restore chevron.
//
// Subject color flows through the `.cp-subj.<subjectId>` cascade — the same
// `var(--c)` / `var(--cl)` / `var(--cd)` tokens the Weekly grid uses.

import { Tooltip } from "@/components/ui";
import { useSubjectColor } from "@/lib/palette";
import { usePlanner } from "@/lib/planner-store";
import type { SubjectId } from "@/lib/types";
import styles from "./LaneCard.module.css";

// ── Icons ──────────────────────────────────────────────────────────────────

const IconMinimize = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 15l6-6 6 6" />
  </svg>
);

const IconRestore = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Props ──────────────────────────────────────────────────────────────────

interface LaneCardProps {
  name: string;
  subjectId: SubjectId;
  /** Minimized state — visual stays the same; only the toggle icon flips. */
  minimized?: boolean;
  /** Click handler for the minimize / restore chevron. */
  onToggleMinimize?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function LaneCard({
  name,
  subjectId,
  minimized = false,
  onToggleMinimize,
}: LaneCardProps) {
  // Same color resolver used by the Weekly grid subject row label
  // (components/grid/WeeklyGrid.tsx line 860). The tile gets the highlight
  // fill; the name + chevron text use the deep tone.
  const color = useSubjectColor(subjectId);
  const { subjectById } = usePlanner();
  const subject = subjectById[subjectId];
  const monogram = subject?.icon ?? name.slice(0, 2);

  // The `cp-subj <subjectId>` cascade is set on the wrapping <div> so any
  // descendants that reference var(--c) / var(--cd) resolve correctly —
  // identical to the Weekly grid's `subjectHead` recipe.
  return (
    <div className={`${styles.subjectHead} cp-subj ${subjectId}`}>
      <span
        className={styles.subjectTile}
        style={{ background: color.tile, color: color.deep }}
        aria-hidden="true"
      >
        {monogram}
      </span>
      <span className={styles.subjectName} style={{ color: color.deep }}>
        {name}
      </span>
      {onToggleMinimize && (
        <Tooltip
          content={
            minimized
              ? `Expand the ${name} row back to full height so you can see its unit bars again`
              : `Collapse the ${name} row to a thin strip — useful when you want to focus on other subjects without losing context`
          }
          side="top"
        >
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={onToggleMinimize}
            aria-label={minimized ? `Restore ${name}` : `Minimize ${name}`}
            title={
              minimized
                ? `Expand the ${name} row back to full height`
                : `Collapse the ${name} row to a thin strip`
            }
            style={{ color: color.deep }}
          >
            {minimized ? (
              <IconRestore width={14} height={14} />
            ) : (
              <IconMinimize width={14} height={14} />
            )}
          </button>
        </Tooltip>
      )}
    </div>
  );
}
