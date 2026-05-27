"use client";

// SubjectView.tsx — S1 Subject view (redesign, Wave 8).
//
// Layout (top-to-bottom inside the main content column):
//   1. Subject header — eyebrow + title + unit context
//   2. StatStrip — 5 live-computed stats
//   3. "Unit health" section — UnitHealthCard grid (2-up)
//   4. Current-unit lesson area — Grid (GroupBlock table) or List (ListRow)
//      toggled by the global viewMode from useAppState()
//   5. ResourcesSort — all resources for the subject, with type-filter chips
//
// The subject switcher sidebar (col 1) is unchanged from the previous build.
//
// Filter panel behavior:
//   The left filter panel is OPEN by default on the Subject view per Unified
//   Audit Decision #11 — the unit/subject planner benefits from filters being
//   visible. We let the global default (`leftPanelOpen=true` in app-state)
//   carry; the top-bar filter toggle still opens/closes it from there.
//
// Don't-miss persistence:
//   useUnitNote(unitId) / useSetUnitNote() — localStorage via UnitNotesProvider.
//   UnitNotesProvider is mounted in app/(planner)/layout.tsx with seed values
//   sourced from the mock unit definitions.

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { SubjectId, LessonResource, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useSubjectColor } from "@/lib/palette";
import {
  SUBJECTS,
  UNITS,
  UNIT_BY_ID,
  WEEK_DAYS,
  CURRENT_WEEK,
} from "@/lib/mock";
import { dateForWeekDay } from "@/lib/mock/calendar";
import { useRouter } from "next/navigation";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { useUnitNote } from "@/lib/unit-notes";
import { ToggleGroup, Tooltip } from "@/components/ui";
import { ListRow } from "@/components/list";
import { StatStrip } from "./StatStrip";
import { UnitHealthCard } from "./UnitHealthCard";
import type { UnitHealthData } from "./UnitHealthCard";
import { ResourcesSort } from "./ResourcesSort";
import type { ResourceEntry } from "./ResourcesSort";
import styles from "./SubjectView.module.css";

// ── Constants ──────────────────────────────────────────────────────────────

const PERIOD_FILTERS = ["All", "Unit", "Month", "Week"] as const;
type PeriodFilter = (typeof PERIOD_FILTERS)[number];

type GroupMode = "unit" | "week";

/** Map a week number to an approximate month index (0 = Aug). */
function weekToMonthIndex(week: number): number {
  return Math.floor((week - 1) / 4);
}

/** Short month name from a week number, derived from the mock calendar anchor. */
function monthNameForWeek(week: number): string {
  const d = dateForWeekDay(week, 0);
  return d.toLocaleString("en-US", { month: "short" }).toUpperCase();
}

// ── Small pure presentational helpers ──────────────────────────────────────

function ChevronIcon({ size = 10 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 2L7 5L3 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ status }: { status: string }): ReactNode {
  const cls = [
    styles.checkIcon,
    status === "done" ? styles.checkDone : "",
    status === "partial" ? styles.checkPartial : "",
    status === "skipped" ? styles.checkSkipped : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} aria-hidden="true">
      {status === "done" && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path
            d="M1.5 4L3 5.5L6.5 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {status === "partial" && (
        <svg width="6" height="2" viewBox="0 0 6 2" fill="none">
          <rect width="6" height="2" rx="1" fill="currentColor" />
        </svg>
      )}
      {status === "skipped" && (
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
          <path
            d="M1 1L5 5M5 1L1 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

// ── Section header ─────────────────────────────────────────────────────────
// Matches the artboard's SectionHeader: kicker + title + optional hint.

function SectionHeader({
  kicker,
  title,
  hint,
}: {
  kicker: string;
  title: string;
  hint?: string;
}): ReactNode {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionKicker}>{kicker}</div>
      <div className={styles.sectionTitle}>{title}</div>
      {hint && <div className={styles.sectionHint}>{hint}</div>}
    </div>
  );
}

// ── Lesson row data ─────────────────────────────────────────────────────────

interface LessonRowData {
  id: string;
  title: string;
  week: number;
  day: number;
  status: LessonStatus;
  isPersonal: boolean;
  standards: string[];
  resources: LessonResource[];
  directions: string;
  taskCount: number;
  isCurrent: boolean;
}

function LessonRowItem({
  lesson,
  isExpanded,
  onToggle,
  onToggleStatus,
}: {
  lesson: LessonRowData;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleStatus: () => void;
}): ReactNode {
  const dayLabel = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day}`;

  return (
    <div
      data-planner-item={`lesson:${lesson.id}`}
      className={[
        styles.lessonItem,
        lesson.status === "skipped" ? styles.lessonItemSkipped : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {lesson.isPersonal && <span className={styles.personalStripe} />}

      <Tooltip
        content={`Expand "${lesson.title}" to see its directions, standards, and a quick preview of the lesson content.`}
        side="top"
      >
        <div
          role="button"
          tabIndex={0}
          className={[
            styles.lessonRow,
            lesson.isPersonal ? styles.lessonRowPersonal : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onToggle}
          onKeyDown={(e) => {
            // Only fire on the row itself — Enter/Space on the nested
            // checkBtn must reach the inner button's native onClick alone.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
          aria-expanded={isExpanded}
          aria-label={`Toggle ${lesson.title}`}
          title={`Expand "${lesson.title}" to see its directions, standards, and a quick preview of the lesson content`}
        >
          <span
            className={[
              styles.lessonRowChevron,
              isExpanded ? styles.lessonRowChevronOpen : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <ChevronIcon size={8} />
          </span>

          <Tooltip
            content={`Mark "${lesson.title}" done or not done — completion is personal and never forks the Team Curriculum copy.`}
            side="top"
          >
            <button
              className={styles.checkBtn}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus();
              }}
              aria-label={`Toggle completion for ${lesson.title}`}
              title={`Mark "${lesson.title}" done or not done — completion is personal and never forks the Team Curriculum copy`}
            >
              <CheckIcon status={lesson.status} />
            </button>
          </Tooltip>

          <span
            className={[
              styles.lessonTitle,
              lesson.status === "done" || lesson.status === "skipped"
                ? styles.lessonTitleDone
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {lesson.title}
          </span>

          <span
            style={{
              fontSize: "var(--t-11)",
              color: "var(--ink-400)",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            W{lesson.week} · {dayLabel.slice(0, 3)}
          </span>

          {lesson.isPersonal && (
            <Tooltip content="Personalized lesson" side="top">
              <span className={styles.personalPill}>Personal</span>
            </Tooltip>
          )}

          {lesson.taskCount > 0 && (
            <Tooltip
              content={`${lesson.taskCount} task${lesson.taskCount === 1 ? "" : "s"}`}
              side="top"
            >
              <span className={styles.subEventsBadge}>
                <span className={styles.subEventsBadgeDot} />+{lesson.taskCount}
              </span>
            </Tooltip>
          )}

          {lesson.standards.slice(0, 2).map((s, idx) => (
            <span key={`${s}-${idx}`} className={styles.standardChip}>
              {s}
            </span>
          ))}

          {lesson.resources.length > 0 && (
            <span
              style={{
                fontSize: "var(--t-11)",
                color: "var(--ink-400)",
                flexShrink: 0,
              }}
            >
              {lesson.resources.length} res
            </span>
          )}

          {lesson.isCurrent && <span className={styles.currentDot}>•</span>}
        </div>
      </Tooltip>

      {isExpanded && (
        <div className={styles.lessonDetail}>
          <p className={styles.lessonDirections}>
            {lesson.directions ||
              "Open in Weekly to see directions and resources."}
          </p>
          {lesson.standards.length > 0 && (
            <div className={styles.lessonStandards}>
              {lesson.standards.map((s, idx) => (
                <span key={`${s}-${idx}`} className={styles.lessonStdChip}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Group block ────────────────────────────────────────────────────────────

interface GroupData {
  key: string;
  tag: string;
  name: string;
  isCurrent: boolean;
  lessons: LessonRowData[];
}

function GroupBlock({
  group,
  isOpen,
  onToggleOpen,
  expandedLessons,
  onToggleLesson,
  onToggleAllLessons,
  onToggleStatus,
}: {
  group: GroupData;
  isOpen: boolean;
  onToggleOpen: () => void;
  expandedLessons: Set<string>;
  onToggleLesson: (id: string) => void;
  onToggleAllLessons: () => void;
  onToggleStatus: (id: string) => void;
}): ReactNode {
  const doneCount = group.lessons.filter((l) => l.status === "done").length;
  const allExpanded =
    group.lessons.length > 0 &&
    group.lessons.every((l) => expandedLessons.has(l.id));

  function handleExpandAll(e: React.MouseEvent): void {
    e.stopPropagation();
    onToggleAllLessons();
  }

  return (
    <div className={styles.group}>
      <Tooltip
        content={`Expand or collapse the ${group.name} group — see all lessons in this unit, their completion progress, and a "Now" pill on the unit you're currently teaching.`}
        side="top"
      >
        <div
          role="button"
          tabIndex={0}
          className={[
            styles.groupHeader,
            group.isCurrent ? styles.groupHeaderCurrent : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onToggleOpen}
          onKeyDown={(e) => {
            // Only fire on the header itself — Enter/Space on the nested
            // groupExpandBtn must reach the inner button's native onClick alone.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleOpen();
            }
          }}
          aria-expanded={isOpen}
          aria-label={`Toggle ${group.name} group`}
          title={`Expand or collapse the ${group.name} group — see all lessons in this unit, their completion progress, and a "Now" pill on the unit you're currently teaching`}
        >
          <span
            className={[
              styles.groupHeaderChevron,
              isOpen ? styles.groupHeaderChevronOpen : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <ChevronIcon size={11} />
          </span>

          <span className={styles.groupTag}>{group.tag}</span>
          <span className={styles.groupName}>{group.name}</span>

          {group.isCurrent && <span className={styles.nowPill}>Now</span>}

          <span className={styles.groupProgress}>
            {doneCount}/{group.lessons.length}
          </span>

          {isOpen && (
            <Tooltip
              content={
                allExpanded
                  ? "Collapse every lesson in this group back to its title row."
                  : "Open every lesson in this group to see their directions and standards."
              }
              side="top"
            >
              <button
                className={styles.groupExpandBtn}
                onClick={handleExpandAll}
                title={
                  allExpanded
                    ? "Collapse every lesson in this group back to its title row"
                    : "Open every lesson in this group to see their directions and standards"
                }
              >
                {allExpanded ? "Close all" : "Expand all"}
              </button>
            </Tooltip>
          )}
        </div>
      </Tooltip>

      {isOpen && (
        <div className={styles.groupBody}>
          <div className={styles.lessonRows}>
            {group.lessons.map((lesson) => (
              <LessonRowItem
                key={lesson.id}
                lesson={lesson}
                isExpanded={expandedLessons.has(lesson.id)}
                onToggle={() => onToggleLesson(lesson.id)}
                onToggleStatus={() => onToggleStatus(lesson.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subject sidebar button ─────────────────────────────────────────────────

interface SubjectBtnProps {
  subjectId: SubjectId;
  isActive: boolean;
  doneCount: number;
  totalCount: number;
  onClick: () => void;
}

function SubjectBtn({
  subjectId,
  isActive,
  doneCount,
  totalCount,
  onClick,
}: SubjectBtnProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;

  return (
    <Tooltip
      content={`Switch the Subject view to ${subject.name} — see all ${subject.name} units, your progress, and the team's pace.`}
      side="bottom"
    >
      <button
        className={`${styles.subjectBtn} ${isActive ? styles.subjectBtnActive : ""} cp-subj ${subjectId}`}
        onClick={onClick}
        title={`Switch the Subject view to ${subject.name} — see all ${subject.name} units, your progress, and the team's pace`}
      >
        <span
          className={styles.subjectBtnStripe}
          style={{ background: color.c }}
          aria-hidden="true"
        />
        <span
          className={`${styles.subjectBtnName} ${isActive ? styles.subjectBtnNameActive : ""}`}
        >
          {subject.name}
        </span>
        {isActive && (
          <span className={styles.subjectBtnCount}>
            {doneCount}/{totalCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ── UnitHealthCard data bridge ─────────────────────────────────────────────
// Reads the "Don't miss" note from context then assembles UnitHealthData.
// Extracted as a separate component so the hook is called at a stable position
// per unit (the unit list won't re-order, but this pattern is safest).

interface UnitHealthCardBridgeProps {
  unitId: string;
  unitIndex: number;
  unitName: string;
  isCurrent: boolean;
  done: number;
  total: number;
  skipped: number;
  standardsCovered: number;
  standardsTotal: number;
  when: string;
  canEdit: boolean;
  editorName: string;
}

function UnitHealthCardBridge({
  unitId,
  unitIndex,
  unitName,
  isCurrent,
  done,
  total,
  skipped,
  standardsCovered,
  standardsTotal,
  when,
  canEdit,
  editorName,
}: UnitHealthCardBridgeProps): ReactNode {
  const note = useUnitNote(unitId);

  const data: UnitHealthData = {
    id: unitId,
    index: unitIndex,
    name: unitName,
    isCurrent,
    done,
    total,
    skipped,
    standardsCovered,
    standardsTotal,
    when,
    dontMiss: note,
    canEdit,
    editorName,
  };

  return <UnitHealthCard unit={data} />;
}

// ── Main subject pane ──────────────────────────────────────────────────────

interface SubjectPaneProps {
  subjectId: SubjectId;
  week: number;
}

function SubjectPane({ subjectId, week }: SubjectPaneProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  // Active unit from the mock — the mock has one unit per subject.
  const activeUnit = UNITS[subjectId];
  const router = useRouter();

  const { lessons, setLessonStatus, lastChange } = usePlanner();
  const { filters, viewMode, currentUser } = useAppState();

  // Scroll preservation — bring the last-changed lesson into view.
  useEffect(() => {
    const id = lastChange?.lessonIds[0];
    if (id) scrollPlannerItemIntoView(id);
  }, [lastChange]);

  // Local UI state — period filter, group mode, collapse state.
  const [period, setPeriod] = useState<PeriodFilter>("All");
  const [groupMode, setGroupMode] = useState<GroupMode>("unit");
  const [groupOpenState, setGroupOpenState] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const [groupExpandedLessons, setGroupExpandedLessons] = useState<
    Map<string, Set<string>>
  >(() => new Map());

  // All lessons for this subject from the live store.
  const allLessons = useMemo(
    () => lessons.filter((l) => l.subject === subjectId),
    [lessons, subjectId],
  );

  const currentMonth = weekToMonthIndex(week);

  // Period filter
  const periodFilteredLessons = useMemo(() => {
    if (period === "All") return allLessons;
    if (period === "Unit")
      return allLessons.filter((l) => l.unit === activeUnit.id);
    if (period === "Month")
      return allLessons.filter(
        (l) => weekToMonthIndex(l.week) === currentMonth,
      );
    if (period === "Week") return allLessons.filter((l) => l.week === week);
    return allLessons;
  }, [allLessons, period, activeUnit.id, week, currentMonth]);

  // Left-rail filters on top of period filter (AND semantics)
  const filteredLessons = useMemo(() => {
    let base = periodFilteredLessons;
    if (filters.subjects.length > 0)
      base = base.filter((l) => filters.subjects.includes(l.subject));
    if (filters.units.length > 0)
      base = base.filter((l) => filters.units.includes(l.unit));
    if (filters.statuses.length > 0)
      base = base.filter((l) => filters.statuses.includes(l.status));
    if (filters.standards.length > 0)
      base = base.filter((l) =>
        l.standards.some((s) => filters.standards.includes(s)),
      );
    return base;
  }, [periodFilteredLessons, filters]);

  // ── Build unit health data ───────────────────────────────────────────────
  // Group all lessons by unit id to compute per-unit aggregates.
  // NOTE: The mock currently has one unit per subject. All lessons reference
  // that unit id. The health card grid will show one card (the active unit).
  // When the backend lands and multi-unit data is available, this computation
  // naturally produces one card per unit without code changes.
  const unitHealthList = useMemo((): Array<{
    unitId: string;
    unitIndex: number;
    unitName: string;
    isCurrent: boolean;
    done: number;
    total: number;
    skipped: number;
    standardsCovered: number;
    standardsTotal: number;
    when: string;
  }> => {
    // Collect all units present in lessons, preserving first-seen order.
    const unitIds = [...new Set(allLessons.map((l) => l.unit))];

    return unitIds.map((unitId, idx) => {
      const unitLessons = allLessons.filter((l) => l.unit === unitId);
      const done = unitLessons.filter((l) => l.status === "done").length;
      const total = unitLessons.length;
      const skipped = unitLessons.filter((l) => l.status === "skipped").length;

      // Standards covered: unique codes on done lessons.
      // Standards total: unique codes across all lessons in the unit.
      // A conservative derivation — if a standard appears on any lesson it
      // counts as "expected"; only lessons with status=done count toward
      // covered. (If the unit had an explicit expected-standards list the
      // backend would supply that directly; for the mock we use the lesson
      // set as a proxy.)
      const allCodes = new Set<string>();
      const doneCodes = new Set<string>();
      for (const l of unitLessons) {
        for (const s of l.standards) {
          allCodes.add(s);
          if (l.status === "done") doneCodes.add(s);
        }
      }

      // When: derive month range from earliest → latest lesson week.
      const weeks = unitLessons.map((l) => l.week);
      const minWk = Math.min(...weeks);
      const maxWk = Math.max(...weeks);
      const startMonth = monthNameForWeek(minWk);
      const endMonth = monthNameForWeek(maxWk);
      const when =
        startMonth === endMonth ? startMonth : `${startMonth} → ${endMonth}`;

      // Lookup unit metadata for the name.
      const unitMeta = UNIT_BY_ID[unitId] ?? activeUnit;

      // Current: true if any lesson in the unit falls in the current week.
      const isCurrent = unitLessons.some((l) => l.week === CURRENT_WEEK);

      return {
        unitId,
        unitIndex: idx + 1,
        unitName: unitMeta.name,
        isCurrent,
        done,
        total,
        skipped,
        standardsCovered: doneCodes.size,
        standardsTotal: allCodes.size,
        when,
      };
    });
  }, [allLessons, activeUnit]);

  // Is the current user the lead teacher? (leads can edit "Don't miss")
  const canEdit = currentUser.name.length > 0; // simplified: all authenticated users can edit
  const editorName = currentUser.name || "Lead teacher";

  // ── Lesson list (for the Grid/List area) ────────────────────────────────
  const lessonRows = useMemo((): LessonRowData[] => {
    return filteredLessons.map((l) => ({
      id: l.id,
      title: l.title,
      week: l.week,
      day: l.day,
      status: l.status,
      isPersonal: l.isPersonal,
      standards: l.standards,
      resources: l.resources,
      directions: l.directions,
      taskCount: l.tasks.length,
      isCurrent: l.week === CURRENT_WEEK,
    }));
  }, [filteredLessons]);

  // Group lessons by unit or by week for the Grid (table) mode.
  const groups = useMemo((): GroupData[] => {
    if (groupMode === "unit") {
      const unitById = new Map(allLessons.map((l) => [l.id, l.unit]));
      const byUnit: Map<string, LessonRowData[]> = new Map();
      for (const l of lessonRows) {
        const unitId = unitById.get(l.id) ?? "unknown";
        const existing = byUnit.get(unitId) ?? [];
        existing.push(l);
        byUnit.set(unitId, existing);
      }
      return [...byUnit.entries()].map(([unitId, ls], idx) => {
        const u = UNIT_BY_ID[unitId] ?? activeUnit;
        const isCurrent = ls.some((l) => l.isCurrent);
        return {
          key: unitId,
          tag: `U${idx + 1}`,
          name: u.name,
          isCurrent,
          lessons: ls,
        };
      });
    }

    const byWeek: Map<number, LessonRowData[]> = new Map();
    for (const l of lessonRows) {
      const existing = byWeek.get(l.week) ?? [];
      existing.push(l);
      byWeek.set(l.week, existing);
    }
    return [...byWeek.keys()]
      .sort((a, b) => a - b)
      .map((w) => {
        const ls = byWeek.get(w)!;
        return {
          key: `week-${w}`,
          tag: `W${w}`,
          name: `Week ${w} · ${ls.length} lesson${ls.length === 1 ? "" : "s"}`,
          isCurrent: w === CURRENT_WEEK,
          lessons: ls,
        };
      });
  }, [groupMode, lessonRows, allLessons, activeUnit]);

  // All resources for the ResourcesSort section.
  // Spread every LessonResource field so the optional url / provider /
  // thumbnailUrl / previewTitle propagate through to ResourcesSort — they
  // drive the actionable-row branch (URL → open in new tab vs lesson-jump
  // → /daily?lesson=<id>) added in W3-C4.
  const allResources = useMemo((): ResourceEntry[] => {
    return allLessons.flatMap((l) => {
      const unitMeta = UNIT_BY_ID[l.unit] ?? activeUnit;
      return l.resources.map((r) => ({
        ...r,
        lessonTitle: l.title,
        unitName: unitMeta.name,
        lessonId: l.id,
      }));
    });
  }, [allLessons, activeUnit]);

  // Lifted group state callbacks — preserve expand/collapse across re-renders.
  function getGroupIsOpen(
    groupKey: string,
    isCurrent: boolean,
    tag: string,
  ): boolean {
    if (groupOpenState.has(groupKey)) return groupOpenState.get(groupKey)!;
    return isCurrent || tag.startsWith("W");
  }

  function handleToggleGroupOpen(
    groupKey: string,
    isCurrent: boolean,
    tag: string,
  ): void {
    setGroupOpenState((prev) => {
      const next = new Map(prev);
      next.set(groupKey, !getGroupIsOpen(groupKey, isCurrent, tag));
      return next;
    });
  }

  function getGroupExpanded(groupKey: string): Set<string> {
    return groupExpandedLessons.get(groupKey) ?? new Set();
  }

  function handleToggleLesson(groupKey: string, lessonId: string): void {
    setGroupExpandedLessons((prev) => {
      const next = new Map(prev);
      const cur = new Set(prev.get(groupKey) ?? []);
      if (cur.has(lessonId)) cur.delete(lessonId);
      else cur.add(lessonId);
      next.set(groupKey, cur);
      return next;
    });
  }

  function handleToggleAllLessons(groupKey: string, lessonIds: string[]): void {
    setGroupExpandedLessons((prev) => {
      const next = new Map(prev);
      const cur = prev.get(groupKey) ?? new Set();
      const allExpanded =
        lessonIds.length > 0 && lessonIds.every((id) => cur.has(id));
      next.set(groupKey, allExpanded ? new Set() : new Set(lessonIds));
      return next;
    });
  }

  function handleToggleStatus(lessonId: string): void {
    const lesson = allLessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const next: LessonStatus = lesson.status === "done" ? "not_done" : "done";
    setLessonStatus(lessonId, next);
  }

  // Determine current-unit context for the lesson-list section heading.
  const currentUnitName = activeUnit.name;

  return (
    <div className={`${styles.main} cp-subj ${subjectId}`}>
      {/* ── Subject header ──────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerEyebrow}>
          <span className={styles.headerDot} style={{ background: color.c }} />
          Subject
        </div>
        <h1 className={styles.headerTitle}>{subject.name}</h1>
        {/* Onboarding-voice subtitle (CLAUDE.md §4) — tells a first-time
            teacher what the Subject (Curriculum) tab is FOR. The grade +
            current-unit metadata moved to the .headerMeta line below so
            the subtitle slot carries a clear job statement. */}
        <p className={styles.headerSub}>
          The full year of units and lessons for {subject.name}, with the
          standards each one covers — pick a unit to drill in, or scan the
          health cards to see where you&rsquo;re ahead and behind.
        </p>
        <p className={styles.headerMeta}>
          {currentUser.curriculumLabel
            ? `${currentUser.curriculumLabel} · ${activeUnit.weeks}`
            : activeUnit.weeks}
        </p>
      </header>

      {/* ── Stat strip ──────────────────────────────────────────────────── */}
      <div className={styles.content}>
        <StatStrip lessons={allLessons} />

        {/* ── Unit health cards ─────────────────────────────────────────── */}
        <SectionHeader
          kicker="Unit health"
          title="Each unit at a glance"
          hint="What's done, what got skipped, which standards are covered, and the one move a teacher really doesn't want to forget."
        />
        <div className={styles.unitHealthGrid}>
          {unitHealthList.map((u) => (
            <UnitHealthCardBridge
              key={u.unitId}
              unitId={u.unitId}
              unitIndex={u.unitIndex}
              unitName={u.unitName}
              isCurrent={u.isCurrent}
              done={u.done}
              total={u.total}
              skipped={u.skipped}
              standardsCovered={u.standardsCovered}
              standardsTotal={u.standardsTotal}
              when={u.when}
              canEdit={canEdit}
              editorName={editorName}
            />
          ))}
        </div>

        {/* ── Filter / grouping bar ─────────────────────────────────────── */}
        <SectionHeader
          kicker={`Current unit · ${unitHealthList.find((u) => u.isCurrent)?.unitName ? `U${unitHealthList.find((u) => u.isCurrent)!.unitIndex}` : "Unit"}`}
          title={currentUnitName + " — lesson list"}
          hint="The familiar by-unit lesson list — kept here for triage and quick drill-in."
        />

        <div
          className={styles.filterBar}
          role="toolbar"
          aria-label="Time period and grouping"
        >
          <span className={styles.filterLabel}>Period</span>
          {PERIOD_FILTERS.map((p) => (
            <Tooltip
              key={p}
              content={`Narrow the lesson list to the ${p.toLowerCase()} time window.`}
              side="bottom"
            >
              <button
                className={`${styles.chip} ${period === p ? styles.chipActive : ""}`}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                title={`Narrow the lesson list to the ${p.toLowerCase()} time window`}
              >
                {p}
              </button>
            </Tooltip>
          ))}

          <span className={styles.filterSep} />

          {/* Group-by toggle only applies in Grid mode */}
          {viewMode === "grid" && (
            <>
              <span className={styles.filterLabel}>Group by</span>
              <ToggleGroup
                variant="subtle"
                size="sm"
                options={[
                  { value: "unit", label: "By Unit" },
                  { value: "week", label: "By Week" },
                ]}
                value={groupMode}
                onChange={setGroupMode}
                ariaLabel="Group lessons by"
              />
            </>
          )}
        </div>

        {/* ── Lesson list — Grid or List mode ───────────────────────────── */}
        {viewMode === "list" ? (
          // List mode: <ListRow> from @/components/list, one per lesson.
          // onClick navigates to /daily focused on the lesson's day.
          <div
            className={styles.listArea}
            aria-label={`${subject.name} lessons`}
          >
            {filteredLessons.length === 0 ? (
              <div className={styles.empty}>No lessons for this period.</div>
            ) : (
              <div className={styles.listRows}>
                {filteredLessons.map((l) => (
                  <ListRow
                    key={l.id}
                    lesson={l}
                    weekday={`W${l.week} · ${(WEEK_DAYS[l.day] ?? "").slice(0, 3)}`}
                    onClick={() => router.push(`/daily?lesson=${l.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          // Grid mode: the collapsible GroupBlock tree.
          <div
            className={styles.listArea}
            aria-label={`${subject.name} lessons`}
          >
            {groups.length === 0 ? (
              <div className={styles.empty}>No lessons for this period.</div>
            ) : (
              groups.map((group) => {
                const isOpen = getGroupIsOpen(
                  group.key,
                  group.isCurrent,
                  group.tag,
                );
                const expandedLessons = getGroupExpanded(group.key);
                return (
                  <GroupBlock
                    key={group.key}
                    group={group}
                    isOpen={isOpen}
                    onToggleOpen={() =>
                      handleToggleGroupOpen(
                        group.key,
                        group.isCurrent,
                        group.tag,
                      )
                    }
                    expandedLessons={expandedLessons}
                    onToggleLesson={(id) => handleToggleLesson(group.key, id)}
                    onToggleAllLessons={() =>
                      handleToggleAllLessons(
                        group.key,
                        group.lessons.map((l) => l.id),
                      )
                    }
                    onToggleStatus={handleToggleStatus}
                  />
                );
              })
            )}
          </div>
        )}

        {/* ── Resources sort ────────────────────────────────────────────── */}
        <SectionHeader
          kicker="Resources"
          title={`All ${subject.name} resources`}
          hint="All resources attached to this subject's lessons — moved to the bottom so it's there when you need it without taking the top of the screen."
        />
        <ResourcesSort resources={allResources} subjectName={subject.name} />
      </div>
    </div>
  );
}

// ── Root SubjectView ────────────────────────────────────────────────────────

export interface SubjectViewProps {
  initialSubject?: SubjectId;
}

export function SubjectView({ initialSubject }: SubjectViewProps): ReactNode {
  const { subjectView, setSubjectView, week } = useAppState();
  const router = useRouter();

  // Sync app-state when a slug param is passed in (from the dynamic route).
  useEffect(() => {
    if (initialSubject && initialSubject !== subjectView) {
      setSubjectView(initialSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubject]);

  function handleSubjectSelect(id: SubjectId): void {
    router.push(`/subject/${id}`);
    setSubjectView(id);
  }

  const { lessons } = usePlanner();

  // Per-subject done/total for sidebar badges.
  const subjectCounts = useMemo(() => {
    const counts: Record<string, { done: number; total: number }> = {};
    for (const s of SUBJECTS) {
      const subjectLessons = lessons.filter((l) => l.subject === s.id);
      counts[s.id] = {
        total: subjectLessons.length,
        done: subjectLessons.filter((l) => l.status === "done").length,
      };
    }
    return counts;
  }, [lessons]);

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        {/* Subject switcher — two surfaces driving the same handler:
            • tab strip (>480px) — visual sidebar / horizontal-scroll bar
            • native <select> dropdown (≤480px) — full names visible without
              horizontal scroll, addresses W3-C6.
            CSS swaps which is visible at the 480px breakpoint. */}
        <nav className={styles.sidebar} aria-label="Subject switcher">
          <div className={styles.sidebarLabel} aria-hidden="true">
            Subjects
          </div>
          {SUBJECTS.map((s) => (
            <SubjectBtn
              key={s.id}
              subjectId={s.id}
              isActive={subjectView === s.id}
              doneCount={subjectCounts[s.id]?.done ?? 0}
              totalCount={subjectCounts[s.id]?.total ?? 0}
              onClick={() => handleSubjectSelect(s.id)}
            />
          ))}
        </nav>

        <div className={styles.mobilePicker}>
          <Tooltip
            content="Switch the Subject view to a different subject — see all of that subject's units, your progress, and the team's pace."
            side="bottom"
            tooltipId="subject-mobile-picker"
          >
            <label className={styles.mobilePickerLabel}>
              <span className={styles.mobilePickerLabelText}>Subject</span>
              <span className={styles.mobilePickerSelectWrap}>
                <select
                  className={styles.mobilePickerSelect}
                  value={subjectView}
                  onChange={(e) =>
                    handleSubjectSelect(e.target.value as SubjectId)
                  }
                  aria-label="Switch subject"
                >
                  {SUBJECTS.map((s) => {
                    const c = subjectCounts[s.id];
                    const done = c?.done ?? 0;
                    const total = c?.total ?? 0;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({done}/{total})
                      </option>
                    );
                  })}
                </select>
                <span
                  className={styles.mobilePickerChevron}
                  aria-hidden="true"
                >
                  <ChevronIcon size={12} />
                </span>
              </span>
            </label>
          </Tooltip>
        </div>

        {/* Main pane — re-mounts on subject change to reset local filter state */}
        <SubjectPane key={subjectView} subjectId={subjectView} week={week} />
      </div>
    </div>
  );
}
