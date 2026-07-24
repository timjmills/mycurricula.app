"use client";

// UnitWorkspaceRail.tsx — the Unified Workspace's Units | Lessons left rail (B1.4).
//
// Rendered in ExplorerShell's `rail` slot (visible only in the full-bleed
// "workspace" presentation; hidden in the compact modal). Two views:
//
//   • UNITS — every unit grouped by subject, each with a taught/total badge.
//     Clicking one switches the whole workspace to that unit via `onUnitChange`.
//   • LESSONS — the CURRENT unit's lessons; clicking one opens it in the Lesson
//     Planner (the in-modal mode switch UnitExplorer already owns).
//
// A search box filters the active view. Pure/presentational — all data (the
// grouped units, per-unit progress, the current lessons) arrives as props from
// UnitExplorer, so the rail never reaches into the store itself.

import { useMemo, useState, type ReactNode } from "react";
import type { Lesson, SubjectId } from "@/lib/types";
import type { UnitProgress } from "@/lib/year-v2-data";
import {
  unitProgressKey,
  type SubjectUnitGroup,
} from "@/lib/unit-workspace-derive";
import { StatusDot } from "@/components/planner-v2";
import { Tooltip } from "@/components/ui";
import { dayShort, explorerStatus } from "./unit-tabs/helpers";
import styles from "./UnitWorkspaceRail.module.css";

type RailView = "units" | "lessons";

/** Strip a "Unit N · " / "List N · " lead-in so a rail row shows just the title
 *  (mirrors YearShell.stripUnitPrefix — kept local so the rail is self-contained). */
function stripUnitPrefix(name: string): string {
  const idx = name.indexOf("·");
  return idx === -1 ? name.trim() : name.slice(idx + 1).trim();
}

const ZERO_PROGRESS: UnitProgress = { total: 0, taught: 0 };

export interface UnitWorkspaceRailProps {
  /** Every subject's units, in curriculum order (subjectUnitGroups). */
  groups: SubjectUnitGroup[];
  /** taught/total for every unit, keyed by `unitProgressKey` (unitProgressByKey).
   *  Read-only here — the rail only ever looks units up. */
  progressByKey: ReadonlyMap<string, UnitProgress>;
  /** The unit the workspace is currently showing — highlighted in the list. */
  activeSubjectId: SubjectId;
  activeUnitId: string;
  /** Switch the workspace to another unit (wired to the host's open-unit state). */
  onUnitChange: (subjectId: SubjectId, unitId: string) => void;
  /** The CURRENT unit's lessons — the Lessons view (already unit-filtered/sorted). */
  lessons: Lesson[];
  /** Open one lesson in the Lesson Planner (UnitExplorer's mode switch). */
  onPlanLesson: (lessonId: string) => void;
}

export function UnitWorkspaceRail({
  groups,
  progressByKey,
  activeSubjectId,
  activeUnitId,
  onUnitChange,
  lessons,
  onPlanLesson,
}: UnitWorkspaceRailProps): ReactNode {
  const [view, setView] = useState<RailView>("units");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Filter the grouped units by name; drop a group that ends up empty so the
  // rail never paints a heading with nothing under it.
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        units: g.units.filter((u) => u.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.units.length > 0);
  }, [groups, q]);

  const filteredLessons = useMemo(() => {
    if (!q) return lessons;
    return lessons.filter((l) => l.title.toLowerCase().includes(q));
  }, [lessons, q]);

  return (
    <nav
      className={styles.root}
      title="Browse your units and lessons — pick one to open it in the workspace"
      aria-label="Unit and lesson navigator"
    >
      <div className={styles.search}>
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={view === "units" ? "Search units…" : "Search lessons…"}
          aria-label={view === "units" ? "Search units" : "Search lessons"}
        />
      </div>

      <div className={styles.seg} role="group" aria-label="Rail view">
        {(
          [
            {
              key: "units" as const,
              label: "Units",
              tip: "Every unit, grouped by subject — pick one to open it here.",
            },
            {
              key: "lessons" as const,
              label: "Lessons",
              tip: "The lessons inside the unit you're viewing — open one to plan it.",
            },
          ] as const
        ).map((opt) => (
          <Tooltip
            key={opt.key}
            content={opt.tip}
            tooltipId={`ws-rail-${opt.key}`}
            side="bottom"
          >
            <button
              type="button"
              aria-pressed={view === opt.key}
              className={`${styles.segBtn} ${view === opt.key ? styles.segBtnOn : ""}`}
              onClick={() => setView(opt.key)}
            >
              {opt.label}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className={styles.list}>
        {view === "units" ? (
          filteredGroups.length === 0 ? (
            <p className={styles.empty}>No matching units.</p>
          ) : (
            filteredGroups.map((g) => (
              <div
                key={g.subject.id}
                className={`cp-subj ${g.subject.cls} ${styles.group}`}
              >
                <div className={styles.groupHead}>
                  <span className={styles.dot} aria-hidden="true" />
                  {g.subject.name}
                </div>
                {g.units.map((u) => {
                  const p =
                    progressByKey.get(unitProgressKey(g.subject.id, u.id)) ??
                    ZERO_PROGRESS;
                  const active =
                    g.subject.id === activeSubjectId && u.id === activeUnitId;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      className={`${styles.unitRow} ${active ? styles.unitRowOn : ""}`}
                      onClick={() => onUnitChange(g.subject.id, u.id)}
                    >
                      <span className={styles.ud} aria-hidden="true" />
                      <span className={styles.unitName}>
                        {stripUnitPrefix(u.name) || u.name}
                      </span>
                      <span className={styles.count}>
                        {p.taught}/{p.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )
        ) : filteredLessons.length === 0 ? (
          <p className={styles.empty}>
            {lessons.length === 0
              ? "No lessons in this unit yet."
              : "No matching lessons in this unit."}
          </p>
        ) : (
          <div className={styles.lessons}>
            {filteredLessons.map((l) => (
              <button
                key={l.id}
                type="button"
                className={styles.lessonRow}
                onClick={() => onPlanLesson(l.id)}
              >
                <StatusDot status={explorerStatus(l)} />
                <span className={styles.lessonText}>
                  <span className={styles.lessonTitle}>{l.title}</span>
                  <span className={styles.lessonMeta}>
                    Wk {l.week} · {dayShort(l.day)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
