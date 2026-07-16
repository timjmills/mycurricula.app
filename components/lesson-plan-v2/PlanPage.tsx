"use client";

// PlanPage.tsx — the Lesson Planner (Wave 7): the bundle's "Lesson Planner"
// mode of the two-mode Explorer, and the surface that restores the ability to
// edit a lesson's `objective`, `notes`, and `differentiation` (orphaned when
// W3.8 replaced /daily's PlanningTabs).
//
// TWO HOSTS, one component:
//   • modal (default) — renders inside <ExplorerShell>, the same dialog the
//     Unit Planner uses. UnitExplorer flips between the two modes in place.
//   • `embedded` — chromeless (no scrim, no header band, no footer): just the
//     tab strip + body, for an in-page host that already owns its own chrome.
//
// SIX TABS: Overview · Flow · Standards · Resources · Differentiation · Notes.
// The bundle also draws **Materials** and **Stats**; neither ships here.
// Materials has no model at all (no `Lesson` field, no table), and every Stats
// number is fabricated — the bundle's "Resources: 5" is a literal and its
// "planned time" sums a hard-coded flow array. Shipping dead placeholders is
// out of scope (the precedent UnitExplorer set for pace / projected-finish).
// The stat strip below carries only values the store actually holds.
//
// SAVE TARGET: this surface deliberately has NO Team/Personal save prompt.
// `usePlanner().setSaveTarget(id, "core")` is a store NO-OP (planner-store.tsx
// returns the doc unchanged unless target === "personal"), so a "save to Team"
// affordance here would tell the teacher their edit reached the whole team when
// nothing was written. Editing autosaves through the store's lazy-fork path;
// the explicit Push-to-Team button stays where it already works, in
// LessonModal / DayEditSplit.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/lib/planner-store";
import { unitLessons, resolveUnitHeader } from "@/lib/year-v2-data";
import {
  ExplorerShell,
  type ExplorerMode,
} from "@/components/year-v2/ExplorerShell";
import { Button } from "@/components/ui";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_SHORT,
  isTaught,
} from "./lesson-status";
import {
  OverviewTab,
  FlowTab,
  StandardsTab,
  ResourcesTab,
  DifferentiationTab,
  NotesTab,
} from "./tabs";
import styles from "./plan-page.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export type PlanTabKey =
  | "overview"
  | "flow"
  | "standards"
  | "resources"
  | "differentiation"
  | "notes";

interface PlanPageCommon {
  lessonId: string;
  /**
   * Modal host only. When supplied, the shell paints the Unit | Lesson mode
   * switch and the unit crumb becomes a link back to the Unit Planner. It is
   * also the escape hatch when the open lesson disappears from the store.
   */
  onModeChange?: (mode: ExplorerMode) => void;
  /** Modal host only. False on a mode-switch remount — suppresses the open animation. */
  animateIn?: boolean;
}

/**
 * Two shapes, one for each host:
 *   • modal (default) — `onClose` is REQUIRED. The shell's ✕, Escape, and scrim
 *     all call it; a modal without it is a focus-trapping, scroll-locking
 *     dialog the user cannot dismiss (Codex W7 gate). Making it required at the
 *     type level means that trap can never be constructed.
 *   • `embedded: true` — chromeless (no scrim / header / footer), so there is no
 *     close verb; `onClose` is optional (the footer's Teach action still calls
 *     it if present, to let a host dismiss its own surface).
 */
export type PlanPageProps =
  | (PlanPageCommon & { embedded?: false; onClose: () => void })
  | (PlanPageCommon & { embedded: true; onClose?: () => void });

const TABS: ReadonlyArray<{ key: PlanTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "flow", label: "Flow" },
  { key: "standards", label: "Standards" },
  { key: "resources", label: "Resources" },
  { key: "differentiation", label: "Differentiation" },
  { key: "notes", label: "Notes" },
];

/** Render one tab's body. Kept out of the render tree so both hosts share it. */
function tabBody(tab: PlanTabKey, lessonId: string): ReactNode {
  switch (tab) {
    case "overview":
      return <OverviewTab lessonId={lessonId} />;
    case "flow":
      return <FlowTab lessonId={lessonId} />;
    case "standards":
      return <StandardsTab lessonId={lessonId} />;
    case "resources":
      return <ResourcesTab lessonId={lessonId} />;
    case "differentiation":
      return <DifferentiationTab lessonId={lessonId} />;
    case "notes":
      return <NotesTab lessonId={lessonId} />;
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function PlanPage({
  lessonId,
  embedded = false,
  onClose,
  onModeChange,
  animateIn = true,
}: PlanPageProps): ReactNode {
  const {
    lessons: allLessons,
    getLesson,
    subjectById,
    units,
    setLessonStatus,
    duplicateLesson,
  } = usePlanner();
  const router = useRouter();

  const [tab, setTab] = useState<PlanTabKey>("overview");
  // The lesson the header's picker is on. `lessonId` seeds it; cycling the
  // picker moves it WITHIN the unit without touching the host's selection.
  const [activeId, setActiveId] = useState(lessonId);
  useEffect(() => setActiveId(lessonId), [lessonId]);

  const lesson = getLesson(activeId);
  const subject = lesson ? subjectById[lesson.subject] : undefined;

  // The unit's lessons drive the picker + the "n of N in sequence" stat. Both
  // degrade to a single-lesson list when the lesson has no catalog unit.
  const siblings = useMemo(
    () => (lesson ? unitLessons(allLessons, lesson.subject, lesson.unit) : []),
    [allLessons, lesson],
  );
  const header = useMemo(
    () =>
      lesson
        ? resolveUnitHeader(subjectById, units, lesson.subject, lesson.unit)
        : null,
    [subjectById, units, lesson],
  );

  // ── Deleted-while-open guard ────────────────────────────────────────────
  // The lesson can vanish (archived from another surface, catalog swap). The
  // modal host falls back to the Unit Planner when it can, else closes; the
  // embedded host renders an empty state in place (it owns no close verb).
  const missing = !lesson || !subject;
  useEffect(() => {
    if (!missing || embedded) return;
    if (onModeChange) onModeChange("unit");
    else onClose?.();
  }, [missing, embedded, onModeChange, onClose]);

  // ── Footer actions ──────────────────────────────────────────────────────
  // `partial` / `carried` / `skipped` are NOT taught — only `done` is. The
  // header, the stat strip, and the tab bodies all read their words from
  // ./lesson-status so a partly-taught lesson can never say "Planned" up here
  // and "Partly taught" two hundred pixels below.
  const status = lesson?.status ?? "not_done";
  const done = isTaught(status);
  // Stable across renders — the shell's Escape listener re-binds on identity
  // change, and `onClose` is optional in the embedded host.
  const handleClose = useCallback((): void => onClose?.(), [onClose]);
  const onTeach = useCallback((): void => {
    onClose?.();
    router.push(`/teach?lesson=${encodeURIComponent(activeId)}`);
  }, [onClose, router, activeId]);
  const onToggleTaught = useCallback((): void => {
    // Completion never forks the lesson (CLAUDE.md §2).
    setLessonStatus(activeId, done ? "not_done" : "done");
  }, [setLessonStatus, activeId, done]);
  const onDuplicate = useCallback((): void => {
    duplicateLesson(activeId);
  }, [duplicateLesson, activeId]);

  if (missing) {
    return embedded ? (
      <div className={styles.empty}>This lesson is no longer in the plan.</div>
    ) : null;
  }

  const seqIndex = siblings.findIndex((l) => l.id === activeId);
  const seqLabel = seqIndex >= 0 ? `${seqIndex + 1}/${siblings.length}` : `1/1`;
  const standardCode = lesson.standards[0] ?? "—";
  const unitName = header?.name ?? lesson.unit;
  const body = tabBody(tab, activeId);

  // ── Embedded host — chromeless tab strip + body ─────────────────────────
  if (embedded) {
    return (
      <EmbeddedPlan
        subjectCls={subject.cls}
        tab={tab}
        onTabChange={setTab}
        body={body}
      />
    );
  }

  // ── Modal host — the shared ExplorerShell ───────────────────────────────
  return (
    <ExplorerShell
      subject={subject}
      animateIn={animateIn}
      dialogTitle="Lesson planner — everything this lesson teaches. Close with the ✕ or Esc."
      closeLabel="Close lesson planner"
      dialogAriaLabel={`Lesson planner — ${lesson.title}`}
      title={
        <select
          className={styles.lessonSel}
          aria-label="Lesson"
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
        >
          {/* An archived lesson is excluded from `siblings` (every view hides
              soft-deletes), so it needs its own option or the picker would
              paint blank on a value with no match. */}
          {seqIndex < 0 ? (
            <option value={activeId}>{lesson.title}</option>
          ) : null}
          {siblings.map((l, i) => (
            <option key={l.id} value={l.id}>
              {i + 1}. {l.title}
            </option>
          ))}
        </select>
      }
      subtitle={
        <>
          {subject.name} ·{" "}
          {onModeChange ? (
            <button
              type="button"
              className={styles.unitLink}
              onClick={() => onModeChange("unit")}
            >
              {unitName}
            </button>
          ) : (
            unitName
          )}{" "}
          · {LESSON_STATUS_LABEL[status]}
        </>
      }
      headerRight={
        <span className={`${styles.tag} ${done ? styles.tagDone : ""}`}>
          {LESSON_STATUS_SHORT[status]}
        </span>
      }
      statStrip={
        <>
          <Stat value={seqLabel} label="in sequence" />
          <Stat value={standardCode} label="standard" />
          <Stat value={LESSON_STATUS_SHORT[status]} label="status" />
        </>
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      tablistLabel="Lesson plan"
      mode="lesson"
      onModeChange={onModeChange}
      onClose={handleClose}
      body={body}
      footer={
        <div className={styles.footActions}>
          <Button
            variant="ghost"
            size="sm"
            tooltip="Make a personal copy of this lesson, right after it in the unit."
            onClick={onDuplicate}
          >
            Duplicate
          </Button>
          <Button
            variant="secondary"
            size="sm"
            tooltip={
              done
                ? "Put this lesson back on the plan as not yet taught."
                : "Record that you taught this lesson. Marking it never forks it."
            }
            onClick={onToggleTaught}
          >
            {done ? "Mark not taught" : "Mark taught"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            tooltip="Open this lesson on the teaching board for live class use."
            onClick={onTeach}
          >
            Teach this lesson
          </Button>
        </div>
      }
    />
  );
}

// ── Stat ──────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

// ── Embedded host ─────────────────────────────────────────────────────────

/** The chromeless variant: the same six tabs with their own roving tablist.
 *  Ids come from useId so an embedded planner can coexist with an open modal
 *  without colliding on the shell's static `ue-tabpanel` id. */
function EmbeddedPlan({
  subjectCls,
  tab,
  onTabChange,
  body,
}: {
  subjectCls: string;
  tab: PlanTabKey;
  onTabChange: (key: PlanTabKey) => void;
  body: ReactNode;
}): ReactNode {
  const uid = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const panelId = `${uid}-panel`;

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      const idx = TABS.findIndex((t) => t.key === tab);
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = idx + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = TABS.length - 1;
      else return;
      e.preventDefault();
      const wrapped = (next + TABS.length) % TABS.length;
      onTabChange(TABS[wrapped].key);
      stripRef.current
        ?.querySelector<HTMLElement>(`[data-plan-tab="${TABS[wrapped].key}"]`)
        ?.focus();
    },
    [tab, onTabChange],
  );

  return (
    <div className={`${styles.embed} cp-subj ${subjectCls}`}>
      <div
        ref={stripRef}
        className={styles.embedTabs}
        role="tablist"
        aria-label="Lesson plan"
        onKeyDown={onKeyDown}
      >
        {TABS.map(({ key, label }) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              data-plan-tab={key}
              id={`${uid}-tab-${key}`}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              className={`${styles.embedTab} ${
                active ? styles.embedTabOn : ""
              }`}
              onClick={() => onTabChange(key)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* Named by the active tab's id (WAI-ARIA single-panel tabs), not a
          free-text label — mirrors ExplorerShell's panel. */}
      <div
        className={styles.embedBody}
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${uid}-tab-${tab}`}
      >
        {body}
      </div>
    </div>
  );
}
