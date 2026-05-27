"use client";

// StatusFilterBar — Status filter pill row for the Yearly view.
//
// Renders a horizontal strip of toggle pills, one per filter state.
// Each pill shows a small colored dot + a label. The active pill gets a
// filled background in the status' light color. "Clear filters" sits at
// the far right.
//
// This component is purely presentational — state (active set, callbacks)
// lives in the parent. Wire it later; visual now.
//
// Status colors use semantic tokens from app/tokens.css only — no hex.

import { Tooltip } from "@/components/ui";
import styles from "./StatusFilterBar.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

export type StatusFilterId =
  | "all"
  | "completed"
  | "in_progress"
  | "modified"
  | "skipped"
  | "not_started"
  | "needs_attention";

export interface StatusFilterBarProps {
  /** The set of currently active filter ids. */
  active: Set<StatusFilterId>;
  onToggle: (id: StatusFilterId) => void;
  onClear: () => void;
}

// ── Filter definitions ─────────────────────────────────────────────────────
// dot: CSS custom property (or inline style) for the dot's background.
// activeClass: CSS module class applied to the pill when active.

interface FilterDef {
  id: StatusFilterId;
  label: string;
  dotVar: string; // var(--…) expression used as background
  activeVar: string; // var(--…) for the active pill background fill
  activeTextVar: string; // var(--…) for the active pill text color
}

interface FilterDefWithCopy extends FilterDef {
  /** Onboarding-voice tooltip text explaining what the filter shows. */
  tooltip: string;
}

const FILTERS: FilterDefWithCopy[] = [
  {
    id: "all",
    label: "All",
    dotVar: "var(--ink-300)",
    activeVar: "var(--ink-100)",
    activeTextVar: "var(--ink-700)",
    tooltip:
      "Show every lesson on the roadmap regardless of status — clears the other status filters",
  },
  {
    id: "completed",
    label: "Completed",
    dotVar: "var(--done)",
    activeVar: "color-mix(in srgb, var(--done) 15%, white)",
    activeTextVar: "var(--reading-deep)",
    tooltip:
      "Highlight only lessons that have been marked done — useful for reviewing coverage you've already taught",
  },
  {
    id: "in_progress",
    label: "In Progress",
    dotVar: "var(--fyi)",
    activeVar: "var(--fyi-bg)",
    activeTextVar: "var(--fyi)",
    tooltip:
      "Show units the team is currently teaching — at least one lesson started, but not yet all complete",
  },
  {
    id: "modified",
    label: "Modified",
    dotVar: "var(--important)",
    activeVar: "var(--important-bg)",
    activeTextVar: "var(--important)",
    tooltip:
      "Show units where you've personally edited lessons — these differ from the team's Master copy",
  },
  {
    id: "skipped",
    label: "Skipped",
    dotVar: "var(--catchup)",
    activeVar: "color-mix(in srgb, var(--catchup) 12%, white)",
    activeTextVar: "var(--catchup)",
    tooltip:
      "Show lessons you marked skipped — they need a make-up day or to be moved into a future week",
  },
  {
    id: "not_started",
    label: "Not Started",
    dotVar: "var(--ink-400)",
    activeVar: "var(--ink-100)",
    activeTextVar: "var(--ink-500)",
    tooltip:
      "Show units the team hasn't begun yet — useful for previewing what's coming up next",
  },
  {
    id: "needs_attention",
    label: "Needs Attention",
    dotVar: "var(--catchup)",
    activeVar: "var(--catchup-bg)",
    activeTextVar: "var(--catchup)",
    tooltip:
      "Show units flagged as falling behind pace or needing review — catch-up candidates",
  },
];

// ── Inline × icon ──────────────────────────────────────────────────────────

const IconX = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────

export function StatusFilterBar({
  active,
  onToggle,
  onClear,
}: StatusFilterBarProps) {
  const hasActiveFilters =
    !active.has("all") || (active.size > 1 && !active.has("all"));

  return (
    <div
      className={styles.bar}
      role="group"
      aria-label="Filter by lesson status"
    >
      {FILTERS.map((f) => {
        const isActive = active.has(f.id);
        return (
          <Tooltip key={f.id} content={f.tooltip} side="bottom">
            <button
              className={styles.pill}
              aria-pressed={isActive}
              onClick={() => onToggle(f.id)}
              title={f.tooltip}
              style={
                isActive
                  ? ({
                      "--pill-bg": f.activeVar,
                      "--pill-color": f.activeTextVar,
                      "--pill-border": "transparent",
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {/* Colored status dot */}
              <span
                className={styles.dot}
                style={{ background: f.dotVar }}
                aria-hidden="true"
              />
              {f.label}
            </button>
          </Tooltip>
        );
      })}

      {/* Clear button — plain text, right-aligned via flex margin */}
      <Tooltip
        content="Remove every active status filter — the roadmap shows all lessons again"
        side="bottom"
      >
        <button
          className={styles.clearBtn}
          onClick={onClear}
          aria-label="Clear all status filters"
          title="Remove every active status filter — the roadmap shows all lessons again"
          // Dim when there's nothing to clear so it reads as inactive.
          style={{ opacity: hasActiveFilters ? 1 : 0.45 }}
        >
          Clear filters
          <IconX />
        </button>
      </Tooltip>
    </div>
  );
}
