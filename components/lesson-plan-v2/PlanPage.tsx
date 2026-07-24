"use client";

// PlanPage.tsx — the Lesson Planner. B2 replaced its six-tab strip with a
// single-scroll workspace body (<LessonWorkspace>): a scalar header
// (title · objective · duration) followed by collapsible sections that either
// reuse an existing tab body (Standards / Resources / Differentiation / Notes),
// embed the shared <LessonEditor> for the lesson flow (retiring the read-only
// FlowTab), or edit B2's new fields (Assessment · Builds & prep · Framework).
// The old Overview tab is subsumed by the scalar header.
//
// TWO HOSTS, one component:
//   • modal (default) — renders inside <ExplorerShell>. B2 passes NO tabs, so
//     the shell shows the workspace as one scroll region (no tablist), labelled
//     via `bodyLabel`. UnitExplorer flips between Unit and Lesson modes in place.
//   • `embedded` — chromeless (no scrim/header/footer): just the scrolling
//     workspace, for an in-page host that owns its own chrome.
//
// SAVE TARGET: this surface deliberately has NO Team/Personal save prompt.
// `usePlanner().setSaveTarget(id, "core")` is a store NO-OP, so a "save to Team"
// affordance here would tell the teacher their edit reached the whole team when
// nothing was written. Editing autosaves through the store's lazy-fork path;
// the explicit Push-to-Team button stays where it works, in LessonModal /
// DayEditSplit.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { LessonWorkspace } from "./LessonWorkspace";
import styles from "./plan-page.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

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
  // `partial` / `carried` / `skipped` are NOT taught — only `done` is.
  const status = lesson?.status ?? "not_done";
  const done = isTaught(status);
  const handleClose = useCallback((): void => onClose?.(), [onClose]);
  const onTeach = useCallback((): void => {
    onClose?.();
    router.push(`/teach?lesson=${encodeURIComponent(activeId)}`);
  }, [onClose, router, activeId]);
  const onToggleTaught = useCallback((): void => {
    // Completion never forks the lesson, and taughtAt is written on the status
    // path — NEVER as a lesson content edit (CLAUDE.md §2; B2 keeps taughtAt
    // read-only in the editor).
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

  // ── Embedded host — chromeless scrolling workspace ──────────────────────
  // Passes `showMeta`: the embedded host has no shell header/subtitle/stat strip,
  // so the workspace renders its own compact subject/unit/week/status strip
  // (§4a MED — the context the retired OverviewTab used to carry here).
  if (embedded) {
    return (
      <div className={`${styles.embed} cp-subj ${subject.cls}`}>
        <div className={styles.embedScroll}>
          <LessonWorkspace lessonId={activeId} showMeta />
        </div>
      </div>
    );
  }

  // Modal host: the shell chrome already carries subject/unit/status, so the
  // workspace omits its meta strip.
  const body = <LessonWorkspace lessonId={activeId} />;

  // ── Modal host — the shared ExplorerShell (no tabs → single scroll) ──────
  return (
    <ExplorerShell
      subject={subject}
      animateIn={animateIn}
      dialogTitle="Lesson planner — everything this lesson teaches. Close with the ✕ or Esc."
      closeLabel="Close lesson planner"
      dialogAriaLabel={`Lesson planner — ${lesson.title}`}
      bodyLabel="Lesson plan"
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
