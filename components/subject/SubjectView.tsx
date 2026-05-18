"use client";

// SubjectView.tsx — the year-long Subject view (planning_document §5.6).
//
// Layout:
//   col 1 (220px) — subject switcher sidebar
//   col 2 (flex)  — header (stats + progress bar)
//                   filter bar (All / Unit / Month / Week chips + group toggle)
//                   lesson list (grouped by unit or by week, collapsible)
//                   resource browser (filtered by type)
//
// Shared state is read/written via `useAppState()` — `subjectView` and
// `setSubjectView` bind the subject picker; `week` scopes Month/Week filters.
//
// Curriculum DATA (lessons) now comes exclusively from `usePlanner()` so that
// edits made in the Weekly or Daily views immediately appear here, and mutations
// performed here (completion toggle) flow through the shared undo/redo stack.
// Purely-UI state (period filter, group mode, expand/collapse) remains local.

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { SubjectId, LessonResource, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useSubjectColor } from "@/lib/palette";
import { SUBJECTS, UNITS, WEEK_DAYS, CURRENT_WEEK } from "@/lib/mock";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import styles from "./SubjectView.module.css";

// ── Constants ──────────────────────────────────────────────────────────

/** Time-period filter options — All is the default. */
const PERIOD_FILTERS = ["All", "Unit", "Month", "Week"] as const;
type PeriodFilter = (typeof PERIOD_FILTERS)[number];

/** Grouping modes for the lesson list. */
const GROUP_MODES = ["unit", "week"] as const;
type GroupMode = (typeof GROUP_MODES)[number];

/**
 * Approximate weeks per month — used to map `week` number to a month scope.
 * The school year starts in August (week 1). This is intentionally simple and
 * correct enough for the subject view's filter purpose.
 */
function weekToMonth(week: number): number {
  return Math.ceil(week / 4);
}

// ── Resource type metadata ──────────────────────────────────────────────
// Background/foreground use neutral ink tokens — resource type is a
// functional category, not a subject, so subject-palette colors must
// not be used here (CLAUDE.md: color carries meaning, never decoration).

const RESOURCE_TYPE_META: Record<
  LessonResource["type"],
  { label: string; bg: string; fg: string; glyph: string }
> = {
  slides: {
    label: "Slides",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "▤",
  },
  pdf: {
    label: "PDF",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "⊞",
  },
  doc: {
    label: "Doc",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "⊟",
  },
  image: {
    label: "Image",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "⊡",
  },
  youtube: {
    label: "Video",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "▷",
  },
  website: {
    label: "Website",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "⊕",
  },
  link: {
    label: "Link",
    bg: "var(--ink-100)",
    fg: "var(--ink-700)",
    glyph: "⊗",
  },
};

// ── Small pure presentational helpers ──────────────────────────────────

/** Chevron SVG — matches the artboard's CPIcon("chevron"). */
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

/** Completion check indicator — maps a status to a colored checkbox. */
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

/** Stat block in the subject header — mirrors CPStat from the artboard. */
function StatBlock({
  label,
  value,
  colorVar,
}: {
  label: string;
  value: string | number;
  colorVar: string;
}): ReactNode {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color: colorVar }}>
        {value}
      </div>
    </div>
  );
}

// ── Lesson row ──────────────────────────────────────────────────────────

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
  // For the artboard's sub-events concept we use `tasks` from the real model.
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
  /** Cycle the lesson's completion status. One store step = one undo entry. */
  onToggleStatus: () => void;
}): ReactNode {
  // Day label derived from WEEK_DAYS — never hard-coded.
  const dayLabel = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day}`;

  return (
    // data-planner-item — required by scrollPlannerItemIntoView() contract.
    // See planner-store.tsx §"Data-planner-item attribute convention".
    <div
      data-planner-item={`lesson:${lesson.id}`}
      className={[
        styles.lessonItem,
        lesson.status === "skipped" ? styles.lessonItemSkipped : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Dashed stripe for personal lessons */}
      {lesson.isPersonal && <span className={styles.personalStripe} />}

      <button
        className={[
          styles.lessonRow,
          lesson.isPersonal ? styles.lessonRowPersonal : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onToggle}
        aria-expanded={isExpanded}
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

        {/* Completion toggle — routes through setLessonStatus in the store.
            Wrapped in a separate button so the click target is distinct from
            the expand/collapse row button. stopPropagation prevents the row
            expand from also firing. */}
        <button
          className={styles.checkBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus();
          }}
          aria-label={`Toggle completion for ${lesson.title}`}
        >
          <CheckIcon status={lesson.status} />
        </button>

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

        {/* Week / day meta */}
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

        {/* Personal pill */}
        {lesson.isPersonal && (
          <span className={styles.personalPill} title="Personalized lesson">
            Personal
          </span>
        )}

        {/* Task sub-events badge */}
        {lesson.taskCount > 0 && (
          <span
            className={styles.subEventsBadge}
            title={`${lesson.taskCount} task${lesson.taskCount === 1 ? "" : "s"}`}
          >
            <span className={styles.subEventsBadgeDot} />+{lesson.taskCount}
          </span>
        )}

        {/* Standards chips — show first two; index included so duplicate codes
            in the same lesson don't produce duplicate keys. */}
        {lesson.standards.slice(0, 2).map((s, idx) => (
          <span key={`${s}-${idx}`} className={styles.standardChip}>
            {s}
          </span>
        ))}

        {/* Resource count */}
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

        {/* Current-week dot */}
        {lesson.isCurrent && <span className={styles.currentDot}>•</span>}
      </button>

      {/* Expanded detail panel */}
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

// ── Group block (unit or week) ──────────────────────────────────────────

interface GroupData {
  key: string;
  /** Short tag displayed in the colored badge (e.g. "U3" or "W12"). */
  tag: string;
  /** Full group name shown in the header. */
  name: string;
  isCurrent: boolean;
  lessons: LessonRowData[];
}

// GroupBlock state is now lifted to SubjectPane (fix #1) so that filter /
// grouping changes don't discard the teacher's expanded-collapsed state.

interface GroupBlockProps {
  group: GroupData;
  isOpen: boolean;
  onToggleOpen: () => void;
  expandedLessons: Set<string>;
  onToggleLesson: (id: string) => void;
  onToggleAllLessons: () => void;
  /** Cycle completion status for a lesson — routed to the store. */
  onToggleStatus: (id: string) => void;
}

function GroupBlock({
  group,
  isOpen,
  onToggleOpen,
  expandedLessons,
  onToggleLesson,
  onToggleAllLessons,
  onToggleStatus,
}: GroupBlockProps): ReactNode {
  const doneCount = group.lessons.filter((l) => l.status === "done").length;
  const allExpanded =
    group.lessons.length > 0 &&
    group.lessons.every((l) => expandedLessons.has(l.id));

  function handleExpandAll(e: React.MouseEvent): void {
    // Prevent the click from bubbling up to the group header button.
    e.stopPropagation();
    onToggleAllLessons();
  }

  return (
    <div className={styles.group}>
      {/* Native <button> handles Space/Enter natively — no manual onKeyDown
          needed (fix #4). */}
      <button
        className={[
          styles.groupHeader,
          group.isCurrent ? styles.groupHeaderCurrent : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onToggleOpen}
        aria-expanded={isOpen}
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
          <button className={styles.groupExpandBtn} onClick={handleExpandAll}>
            {allExpanded ? "Close all" : "Expand all"}
          </button>
        )}
      </button>

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

// ── Resource section ────────────────────────────────────────────────────

interface ResourceEntry {
  type: LessonResource["type"];
  label: string;
  lessonTitle: string;
}

function ResourceSection({
  resources,
}: {
  resources: ResourceEntry[];
}): ReactNode {
  const [activeType, setActiveType] = useState<LessonResource["type"] | null>(
    null,
  );

  // Unique types present in this subject's resources
  const presentTypes = useMemo(
    () =>
      [...new Set(resources.map((r) => r.type))] as LessonResource["type"][],
    [resources],
  );

  const filtered = activeType
    ? resources.filter((r) => r.type === activeType)
    : resources;

  return (
    <section className={styles.resourceSection}>
      <div className={styles.resourceHeader}>
        <span className={styles.resourceTitle}>Resources</span>
        <span className={styles.resourceCount}>{resources.length} total</span>
      </div>

      {/* Type filter chips */}
      <div className={styles.resourceFilters}>
        <button
          className={[
            styles.resourceFilterChip,
            activeType === null ? styles.resourceFilterChipActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveType(null)}
        >
          All
        </button>
        {presentTypes.map((type) => {
          const meta = RESOURCE_TYPE_META[type];
          return (
            <button
              key={type}
              className={[
                styles.resourceFilterChip,
                activeType === type ? styles.resourceFilterChipActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                setActiveType((prev) => (prev === type ? null : type))
              }
            >
              {meta.glyph} {meta.label}
            </button>
          );
        })}
      </div>

      {/* Resource list — margin comes from the CSS module (fix #7). */}
      <div className={styles.resourceList}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No resources of this type.</div>
        )}
        {filtered.map((r, i) => {
          const meta = RESOURCE_TYPE_META[r.type];
          // Stable key: lesson title + type + label. Index appended as
          // a tiebreaker in case two identical resources exist (fix #8).
          const rowKey = `${r.lessonTitle}|${r.type}|${r.label}|${i}`;
          return (
            <div key={rowKey} className={styles.resourceRow}>
              <span
                className={styles.resourceTypeIcon}
                style={{ background: meta.bg, color: meta.fg }}
                aria-hidden="true"
              >
                {meta.glyph}
              </span>
              <span className={styles.resourceLabel}>{r.label}</span>
              <span className={styles.resourceLesson}>{r.lessonTitle}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Subject sidebar row ─────────────────────────────────────────────────
// Split into its own component so `useSubjectColor` is called at a stable
// position per subject — same pattern as WeeklyGrid's SubjectRow.

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
    <button
      className={`${styles.subjectBtn} ${isActive ? styles.subjectBtnActive : ""} cp-subj ${subjectId}`}
      onClick={onClick}
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
  );
}

// ── Main subject pane — needs the subject-color hook ────────────────────

interface SubjectPaneProps {
  subjectId: SubjectId;
  week: number;
}

function SubjectPane({ subjectId, week }: SubjectPaneProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  // NOTE: The mock data has one active unit per subject — all lessons for a
  // subject share that unit id. This is a mock-data constraint, not a product
  // limitation; the UI is ready for multi-unit subjects.
  const unit = UNITS[subjectId];

  // ── Planner store — the single source of truth for curriculum data ─────
  // `lessons` is the live document shared with Weekly and Daily views.
  // `setLessonStatus` and `lastChange` are the only store APIs this view
  // currently needs beyond reading — other mutations (inline edit, duplicate,
  // move) are not surfaced in the Subject view UI yet.
  const { lessons, setLessonStatus, lastChange } = usePlanner();

  // ── Scroll preservation ────────────────────────────────────────────────
  // After any mutation (including undo/redo from another view) bring the
  // affected lesson card into view so the teacher can see what changed.
  useEffect(() => {
    const id = lastChange?.lessonIds[0];
    if (id) scrollPlannerItemIntoView(id);
  }, [lastChange]);

  // Local UI state — purely presentational, intentionally not in the store
  const [period, setPeriod] = useState<PeriodFilter>("All");
  const [groupMode, setGroupMode] = useState<GroupMode>("unit");

  // Lifted group state (fix #1) — keyed by group.key so filter/grouping
  // changes that rebuild the group list don't reset the teacher's
  // expanded-collapsed state.
  const [groupOpenState, setGroupOpenState] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const [groupExpandedLessons, setGroupExpandedLessons] = useState<
    Map<string, Set<string>>
  >(() => new Map());

  // Filter to this subject's lessons from the live store document.
  // Grade-scoping is already on each lesson (lesson.subject, lesson.week).
  const allLessons = useMemo(
    () => lessons.filter((l) => l.subject === subjectId),
    [lessons, subjectId],
  );

  // Apply time-period filter
  const currentMonth = weekToMonth(week);

  const filteredLessons = useMemo(() => {
    if (period === "All") return allLessons;
    if (period === "Unit") {
      // Scope to lessons in the active unit
      return allLessons.filter((l) => l.unit === unit.id);
    }
    if (period === "Month") {
      // Same calendar month as the current week
      return allLessons.filter((l) => weekToMonth(l.week) === currentMonth);
    }
    if (period === "Week") {
      return allLessons.filter((l) => l.week === week);
    }
    return allLessons;
  }, [allLessons, period, unit.id, week, currentMonth]);

  // Header stats — always over the full subject set (not filtered)
  const totalCount = allLessons.length;
  const doneCount = allLessons.filter((l) => l.status === "done").length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const totalResources = allLessons.reduce(
    (sum, l) => sum + l.resources.length,
    0,
  );

  // Year progress bar — group all lessons by unit for the segmented bar
  const unitGroups = useMemo(() => {
    const map: Map<
      string,
      { done: number; total: number; isCurrent: boolean }
    > = new Map();
    for (const l of allLessons) {
      const entry = map.get(l.unit) ?? { done: 0, total: 0, isCurrent: false };
      entry.total += 1;
      if (l.status === "done") entry.done += 1;
      if (l.week === CURRENT_WEEK) entry.isCurrent = true;
      map.set(l.unit, entry);
    }
    return [...map.entries()].map(([unitId, data]) => ({ unitId, ...data }));
  }, [allLessons]);

  // Progress-bar tick labels derived from the actual week range of this
  // subject's lessons — never hard-coded calendar months (fix #2).
  const progressTickLabels = useMemo((): string[] => {
    if (allLessons.length === 0) return [];
    const weeks = allLessons.map((l) => l.week);
    const minWk = Math.min(...weeks);
    const maxWk = Math.max(...weeks);
    if (minWk === maxWk) return [`Wk ${minWk}`];
    // Show up to 6 evenly-spaced week labels across the range.
    const span = maxWk - minWk;
    const steps = Math.min(6, span + 1);
    return Array.from(
      { length: steps },
      (_, i) => `Wk ${Math.round(minWk + (span * i) / Math.max(steps - 1, 1))}`,
    );
  }, [allLessons]);

  // Build lesson rows for the filtered set
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

  // Group lessons by unit or week
  const groups = useMemo((): GroupData[] => {
    if (groupMode === "unit") {
      // Use the lesson's unit id as the grouping key; preserve insertion order
      // so the visual sequence follows the year's unit progression.
      // Look up unit id from allLessons (which already comes from the store),
      // not from the static LESSONS fixture, so moves/edits are reflected.
      const unitById = new Map(allLessons.map((l) => [l.id, l.unit]));
      const byUnit: Map<string, LessonRowData[]> = new Map();
      for (const l of lessonRows) {
        const unitId = unitById.get(l.id) ?? "unknown";
        const existing = byUnit.get(unitId) ?? [];
        existing.push(l);
        byUnit.set(unitId, existing);
      }

      return [...byUnit.entries()].map(([unitId, lessons], idx) => {
        // Find unit metadata. The mock has one active unit per subject; all
        // lessons for a subject share that unit id.
        const u = Object.values(UNITS).find((u) => u.id === unitId) ?? unit;
        const isCurrent = lessons.some((l) => l.isCurrent);
        return {
          key: unitId,
          tag: `U${idx + 1}`,
          name: u.name,
          isCurrent,
          lessons,
        };
      });
    }

    // Group by week
    const byWeek: Map<number, LessonRowData[]> = new Map();
    for (const l of lessonRows) {
      const existing = byWeek.get(l.week) ?? [];
      existing.push(l);
      byWeek.set(l.week, existing);
    }

    // Sort weeks numerically
    const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
    return sortedWeeks.map((w) => {
      const lessons = byWeek.get(w)!;
      const isCurrent = w === CURRENT_WEEK;
      return {
        key: `week-${w}`,
        tag: `W${w}`,
        name: `Week ${w} · ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`,
        isCurrent,
        lessons,
      };
    });
  }, [groupMode, lessonRows, allLessons, unit]);

  // Collect all resources for the resource browser
  const allResources = useMemo((): ResourceEntry[] => {
    return allLessons.flatMap((l) =>
      l.resources.map((r) => ({
        type: r.type,
        label: r.label,
        lessonTitle: l.title,
      })),
    );
  }, [allLessons]);

  // ── Lifted group-state callbacks (fix #1) ──────────────────────────────
  // Derive the default open state for a group the first time it appears
  // (current group or week-mode groups open by default); thereafter preserve
  // whatever the teacher set explicitly.
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

  // ── Completion toggle ──────────────────────────────────────────────────
  // Cycles: not_done → done → not_done (partial / carried / skipped cycle
  // remains accessible via the Weekly/Daily detail panel). Each call is one
  // history step so it is independently undoable. Completion intentionally
  // never forks the lesson (product rule — see CLAUDE.md §2).
  function handleToggleStatus(lessonId: string): void {
    const lesson = allLessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const next: LessonStatus = lesson.status === "done" ? "not_done" : "done";
    setLessonStatus(lessonId, next);
  }

  return (
    <div className={`${styles.main} cp-subj ${subjectId}`}>
      {/* Subject header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerMeta}>
            <div className={styles.headerEyebrow}>
              <span
                className={styles.headerDot}
                style={{ background: color.c }}
              />
              Subject
            </div>
            <h1 className={styles.headerTitle}>{subject.name}</h1>
            <p className={styles.headerSub}>
              {unit.name} · {unit.weeks}
            </p>
          </div>

          <div className={styles.headerSpacer} />

          <div className={styles.headerStats}>
            <StatBlock
              label="Done"
              value={`${doneCount} / ${totalCount}`}
              colorVar={color.c}
            />
            <StatBlock
              label="Complete"
              value={`${pct}%`}
              colorVar="var(--ink-900)"
            />
            <StatBlock
              label="Resources"
              value={totalResources}
              colorVar="var(--ink-700)"
            />
          </div>
        </div>

        {/* Year-progress bar segmented by unit */}
        <div className={styles.progressWrap}>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {unitGroups.map((u) => (
              <div
                key={u.unitId}
                className={styles.progressUnit}
                style={{ flex: u.total }}
              >
                <div
                  className={styles.progressDone}
                  style={{ flex: u.done, background: color.c }}
                />
                <div
                  className={styles.progressRemain}
                  style={{
                    flex: u.total - u.done,
                    background: u.isCurrent ? color.cl : "var(--ink-100)",
                    opacity: u.isCurrent ? 0.6 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          {/* Tick labels derived from actual lesson week range — not hard-coded
              calendar months (fix #2). */}
          <div className={styles.progressLabels} aria-hidden="true">
            {progressTickLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </header>

      {/* Filter / grouping bar */}
      <div
        className={styles.filterBar}
        role="toolbar"
        aria-label="Time period and grouping"
      >
        <span className={styles.filterLabel}>Period</span>
        {PERIOD_FILTERS.map((p) => (
          <button
            key={p}
            className={`${styles.chip} ${period === p ? styles.chipActive : ""}`}
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
          >
            {p}
          </button>
        ))}

        <span className={styles.filterSep} />

        <span className={styles.filterLabel}>Group by</span>
        <div className={styles.groupToggle} role="group" aria-label="Group by">
          {GROUP_MODES.map((mode) => (
            <button
              key={mode}
              className={`${styles.groupBtn} ${groupMode === mode ? styles.groupBtnActive : ""}`}
              onClick={() => setGroupMode(mode)}
              aria-pressed={groupMode === mode}
            >
              {mode === "unit" ? "By Unit" : "By Week"}
            </button>
          ))}
        </div>
      </div>

      {/* Lesson list — collapsible tree structure, not a flat list, so
          role="list" is omitted to avoid AT announcing an empty list when
          children are group containers, not listitem elements (fix #5). */}
      <div className={styles.listArea} aria-label={`${subject.name} lessons`}>
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
                  handleToggleGroupOpen(group.key, group.isCurrent, group.tag)
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

      {/* Resource browser */}
      {allResources.length > 0 && <ResourceSection resources={allResources} />}
    </div>
  );
}

// ── Root SubjectView ────────────────────────────────────────────────────

export function SubjectView(): ReactNode {
  const { subjectView, setSubjectView, week } = useAppState();

  // Lessons from the shared store — sidebar badges stay live as other views
  // mark lessons done or undo those changes.
  const { lessons } = usePlanner();

  // Per-subject done/total for the sidebar badge — recomputed whenever the
  // live lesson list changes (e.g. after a completion toggle in Weekly view).
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
        {/* Subject switcher sidebar */}
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
              onClick={() => setSubjectView(s.id)}
            />
          ))}
        </nav>

        {/* Main pane — re-mounts on subject change to reset local filter state */}
        <SubjectPane key={subjectView} subjectId={subjectView} week={week} />
      </div>
    </div>
  );
}
