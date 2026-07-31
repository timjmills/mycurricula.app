"use client";

// TimelineList.tsx — the Plan tab's LIST mode (`ph-units.jsx:527-530` →
// `ph-lessons.jsx`), the other half of the Timeline|List switch.
//
// Same data, different question. The timeline answers "where am I in the
// year"; the list answers "show me every lesson that needs work, grouped the
// way I am thinking about it". Both read the SAME derivation
// (lib/plan-timeline/library.ts), so a lesson cannot be "missed" here and
// "planned" one toggle away.
//
// The Units lens renders unit rows instead of lesson rows. Its controls are a
// subset — Organize and Status are lesson properties, and offering them
// greyed-out on a unit list would be chrome that never does anything.

import { useMemo, type ReactNode } from "react";
import { ToggleGroup } from "@/components/ui";
import {
  LIBRARY_GROUP_LABEL,
  LIBRARY_SORT_LABEL,
  LIBRARY_STATUS_LABEL,
  filterLessons,
  groupLessons,
  sortLessons,
  type LibraryGroup,
  type LibraryLesson,
  type LibrarySort,
  type LibraryStatusFilter,
  type LibraryUnit,
} from "@/lib/plan-timeline/library";
// `weeksLabel` is THE shared week-range formatter (lib/planner/source.ts:
// unitWeeksLabel, which both data sources derive `Unit.weeks` through) — never
// an inline `Wk ${start}–${end}`, which has no `start === end` branch and so
// renders a one-week unit as "Wk 12–12" while its own card reads "Wk 12".
import { DOT_STATE_LABEL, FORK_TIER_LABEL, weeksLabel } from "@/lib/plan-timeline";
import type { SubjectId } from "@/lib/types";
import styles from "./timeline.module.css";

export interface TimelineListProps {
  lens: "units" | "lessons";
  lessons: readonly LibraryLesson[];
  units: readonly LibraryUnit[];
  group: LibraryGroup;
  onGroupChange: (g: LibraryGroup) => void;
  status: LibraryStatusFilter;
  onStatusChange: (s: LibraryStatusFilter) => void;
  sort: LibrarySort;
  onSortChange: (s: LibrarySort) => void;
  /** Compact halves the row padding (`ph-units.jsx:500-520`'s density). */
  compact: boolean;
  onCompactChange: (c: boolean) => void;
  subjectClass: (subject: SubjectId) => string;
  onOpenLesson: (lessonId: string, title: string) => void;
  onOpenUnit: (unitId: string, name: string, subject: SubjectId) => void;
}

export function TimelineList({
  lens,
  lessons,
  units,
  group,
  onGroupChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  compact,
  onCompactChange,
  subjectClass,
  onOpenLesson,
  onOpenUnit,
}: TimelineListProps): ReactNode {
  const groups = useMemo(
    () => groupLessons(sortLessons(filterLessons(lessons, status), sort), group),
    [lessons, status, sort, group],
  );

  return (
    <div className={styles.list} data-compact={compact || undefined}>
      <div className={styles.listControls}>
        {lens === "lessons" && (
          <>
            <ToggleGroup
              ariaLabel="Organize by"
              value={group}
              onChange={(v) => onGroupChange(v as LibraryGroup)}
              options={(["subject", "unit", "status"] as const).map((v) => ({
                value: v,
                label: LIBRARY_GROUP_LABEL[v],
                title: `Group the list by ${LIBRARY_GROUP_LABEL[v].toLowerCase()}.`,
              }))}
            />
            <ToggleGroup
              ariaLabel="Show which lessons"
              value={status}
              onChange={(v) => onStatusChange(v as LibraryStatusFilter)}
              options={(
                ["all", "ready", "needs_work", "taught", "not_yet"] as const
              ).map((v) => ({
                value: v,
                label: LIBRARY_STATUS_LABEL[v],
                title: STATUS_HELP[v],
              }))}
            />
            <ToggleGroup
              ariaLabel="Sort by"
              value={sort}
              onChange={(v) => onSortChange(v as LibrarySort)}
              options={(["schedule", "title", "status"] as const).map((v) => ({
                value: v,
                label: LIBRARY_SORT_LABEL[v],
                title: `Order each group by ${LIBRARY_SORT_LABEL[v].toLowerCase()}.`,
              }))}
            />
          </>
        )}
        <ToggleGroup
          ariaLabel="Row density"
          value={compact ? "compact" : "comfort"}
          onChange={(v) => onCompactChange(v === "compact")}
          options={[
            {
              value: "comfort",
              label: "Comfort",
              title: "Roomier rows — easier to hit on a touchscreen.",
            },
            {
              value: "compact",
              label: "Compact",
              title: "Tighter rows — more of the plan on screen at once.",
            },
          ]}
        />
      </div>

      {lens === "units" ? (
        <ul className={styles.rows}>
          {units.map((u) => (
            <li key={`${u.subject}\n${u.unitId}`}>
              <button
                type="button"
                className={`cp-subj ${subjectClass(u.subject)} ${styles.row}`}
                title={`${u.name} — ${u.total} lesson${u.total === 1 ? "" : "s"}, ${u.taught} taught, ${u.ready} fully planned. Opens its unit planner.`}
                onClick={() => onOpenUnit(u.unitId, u.name, u.subject)}
              >
                <span className={styles.rowStripe} aria-hidden="true" />
                <span className={styles.rowTitle}>{u.name}</span>
                <span className={styles.rowMeta}>
                  {u.weekRange
                    ? weeksLabel(u.weekRange.start, u.weekRange.end)
                    : // Named, not blank. A unit with no schedule is the one a
                      // teacher most needs to notice.
                      "No weeks set"}
                </span>
                <span className={styles.rowMeta}>
                  {u.ready}/{u.total} planned · {u.taught} taught
                </span>
                {u.lessonsOutside > 0 && (
                  <span className={styles.rowFlag}>
                    {u.lessonsOutside} outside its weeks
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        groups.map((g) => (
          <section key={g.key} className={styles.listGroup}>
            <h3 className={styles.listGroupHead}>
              {g.label}
              <span className={styles.listGroupCount}>{g.rows.length}</span>
            </h3>
            <ul className={styles.rows}>
              {g.rows.map((l) => {
                const fork = FORK_TIER_LABEL[l.fork];
                return (
                  <li key={l.lessonId}>
                    <button
                      type="button"
                      className={`cp-subj ${subjectClass(l.subject)} ${styles.row}`}
                      title={`${l.title || "Untitled lesson"} — ${DOT_STATE_LABEL[l.state]}${fork ? ` · ${fork}` : ""}. Opens the lesson.`}
                      onClick={() =>
                        onOpenLesson(l.lessonId, l.title || "Untitled lesson")
                      }
                    >
                      <span
                        className={`${styles.dot} ${styles.rowDot}`}
                        data-state={l.state}
                        data-fork={l.fork === "master" ? undefined : l.fork}
                        aria-hidden="true"
                      />
                      <span className={styles.rowTitle}>
                        {l.title || "Untitled lesson"}
                      </span>
                      <span className={styles.rowMeta}>
                        {/* An off-calendar lesson is NAMED as such rather than
                            shown with a week number that no longer resolves —
                            "Wk 3" on a lesson that has no column reads as a
                            working schedule. */}
                        {l.placeable
                          ? `Wk ${l.week} · Day ${l.day + 1}`
                          : "Off-calendar"}
                      </span>
                      <span className={styles.rowMeta}>
                        {l.unitName ?? "Unfiled"}
                      </span>
                      {l.gaps > 0 && (
                        <span className={styles.rowFlag}>
                          {l.gaps} missing
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

const STATUS_HELP: Readonly<Record<LibraryStatusFilter, string>> = {
  all: "Every lesson.",
  // Spelled out because "ready" is `no gaps`, NOT `not yet taught` — a taught
  // lesson that was fully planned still counts, and a filter that quietly
  // excluded it would hide work the teacher did.
  ready: "Lessons with an objective, a resource and a standard — taught or not.",
  needs_work: "Lessons missing two or more of those three, including missed ones.",
  taught: "Lessons already marked taught.",
  not_yet: "Everything not yet marked taught.",
};
