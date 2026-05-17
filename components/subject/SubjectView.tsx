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
// All lesson data is derived from the LESSONS fixture; no backend is needed.

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { SubjectId, LessonResource } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useSubjectColor } from "@/lib/palette";
import { LESSONS, SUBJECTS, UNITS, WEEK_DAYS, CURRENT_WEEK } from "@/lib/mock";
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

const RESOURCE_TYPE_META: Record<
  LessonResource["type"],
  { label: string; bg: string; fg: string; glyph: string }
> = {
  slides: {
    label: "Slides",
    bg: "var(--math-light)",
    fg: "var(--math-deep)",
    glyph: "▤",
  },
  pdf: {
    label: "PDF",
    bg: "var(--ufli-light)",
    fg: "var(--ufli-deep)",
    glyph: "⊞",
  },
  doc: {
    label: "Doc",
    bg: "var(--reading-light)",
    fg: "var(--reading-deep)",
    glyph: "⊟",
  },
  image: {
    label: "Image",
    bg: "var(--explorers-light)",
    fg: "var(--explorers-deep)",
    glyph: "⊡",
  },
  youtube: {
    label: "Video",
    bg: "var(--spelling-light)",
    fg: "var(--spelling-deep)",
    glyph: "▷",
  },
  website: {
    label: "Website",
    bg: "var(--grammar-light)",
    fg: "var(--grammar-deep)",
    glyph: "⊕",
  },
  link: {
    label: "Link",
    bg: "var(--sel-light)",
    fg: "var(--sel-deep)",
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
  status: string;
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
}: {
  lesson: LessonRowData;
  isExpanded: boolean;
  onToggle: () => void;
}): ReactNode {
  // Day label derived from WEEK_DAYS — never hard-coded.
  const dayLabel = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day}`;

  return (
    <div
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

        <CheckIcon status={lesson.status} />

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

        {/* Standards chips — show first two */}
        {lesson.standards.slice(0, 2).map((s) => (
          <span key={s} className={styles.standardChip}>
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
              {lesson.standards.map((s) => (
                <span key={s} className={styles.lessonStdChip}>
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

function GroupBlock({ group }: { group: GroupData }): ReactNode {
  const [isOpen, setIsOpen] = useState(
    group.isCurrent || group.tag.startsWith("W"),
  );
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(
    () => new Set(),
  );

  const doneCount = group.lessons.filter((l) => l.status === "done").length;
  const allExpanded =
    group.lessons.length > 0 &&
    group.lessons.every((l) => expandedLessons.has(l.id));

  function toggleLesson(id: string): void {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllLessons(e: React.MouseEvent): void {
    e.stopPropagation();
    if (allExpanded) {
      setExpandedLessons(new Set());
    } else {
      setExpandedLessons(new Set(group.lessons.map((l) => l.id)));
    }
  }

  return (
    <div className={styles.group}>
      <div
        className={[
          styles.groupHeader,
          group.isCurrent ? styles.groupHeaderCurrent : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setIsOpen((v) => !v)}
        role="button"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((v) => !v);
          }
        }}
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
          <button className={styles.groupExpandBtn} onClick={toggleAllLessons}>
            {allExpanded ? "Close all" : "Expand all"}
          </button>
        )}
      </div>

      {isOpen && (
        <div className={styles.groupBody}>
          <div className={styles.lessonRows}>
            {group.lessons.map((lesson) => (
              <LessonRowItem
                key={lesson.id}
                lesson={lesson}
                isExpanded={expandedLessons.has(lesson.id)}
                onToggle={() => toggleLesson(lesson.id)}
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

      {/* Resource list */}
      <div className={styles.resourceList} style={{ marginTop: 10 }}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No resources of this type.</div>
        )}
        {filtered.map((r, i) => {
          const meta = RESOURCE_TYPE_META[r.type];
          return (
            <div key={i} className={styles.resourceRow}>
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
  const unit = UNITS[subjectId];

  // Local UI state
  const [period, setPeriod] = useState<PeriodFilter>("All");
  const [groupMode, setGroupMode] = useState<GroupMode>("unit");

  // Derive this subject's lessons from the fixture
  const allLessons = useMemo(
    () => LESSONS.filter((l) => l.subject === subjectId),
    [subjectId],
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
    return [...map.values()];
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
      const byUnit: Map<string, LessonRowData[]> = new Map();
      for (const l of lessonRows) {
        const lessonObj = LESSONS.find((x) => x.id === l.id);
        const unitId = lessonObj?.unit ?? "unknown";
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
  }, [groupMode, lessonRows, unit]);

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
            {unitGroups.map((u, i) => (
              <div
                key={i}
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
          <div className={styles.progressLabels} aria-hidden="true">
            <span>Aug</span>
            <span>Oct</span>
            <span>Dec</span>
            <span>Feb</span>
            <span>Apr</span>
            <span>Jun</span>
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

      {/* Lesson list */}
      <div
        className={styles.listArea}
        role="list"
        aria-label={`${subject.name} lessons`}
      >
        {groups.length === 0 ? (
          <div className={styles.empty}>No lessons for this period.</div>
        ) : (
          groups.map((group) => <GroupBlock key={group.key} group={group} />)
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

  // Per-subject done/total for the sidebar badge — computed once here.
  const subjectCounts = useMemo(() => {
    const counts: Record<string, { done: number; total: number }> = {};
    for (const s of SUBJECTS) {
      const lessons = LESSONS.filter((l) => l.subject === s.id);
      counts[s.id] = {
        total: lessons.length,
        done: lessons.filter((l) => l.status === "done").length,
      };
    }
    return counts;
  }, []);

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
