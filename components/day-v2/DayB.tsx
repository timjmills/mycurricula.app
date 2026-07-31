"use client";

// DayB.tsx — Frame "paper" (Bright Workspace). A slim subject rail on the left
// selects the focused lesson; a large white focus panel on the right shows its
// full detail. Selection is SHELL-OWNED (props selectedId / onSelect), seeded
// current → next → first. Bundle: views-b.jsx DayB (B:6097-6149), CSS B:905-967.

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/lib/planner-store";
import {
  deriveDayStatus,
  currentAndNext,
  type DayStatus,
} from "@/lib/day-status";
import { lessonTime } from "@/lib/mock/schedule";
import { stripHtml } from "@/lib/html-text";
import { unitDisplayName } from "@/lib/unit-name";
import { Tooltip } from "@/components/ui";
import { UnitChip } from "@/components/unit-chip";
import type { Lesson } from "@/lib/types";
import {
  SubjGlyph,
  StatusDot,
  ForkCues,
  FinishPill,
  AddLessonMenu,
  SelectTitle,
} from "./atoms";
import { STATUS_WORD, useNowMin, fromInteractive } from "./util";
import { DayEmptyState } from "./DayEmptyState";
import { DayHeader } from "./DayHeader";
import type { DayViewV2Props } from "./DayViewV2";
import styles from "./day-v2.module.css";

/** Focus-panel status wording (bundle: "In progress" / "Complete" / "Planned"). */
function statusLine(status: DayStatus): string {
  if (status === "done") return "Complete";
  if (status === "now") return "In progress";
  return "Planned";
}

/** Pick the focused lesson: the global selection when it's in this day, else
 *  the current → next → first fallback chain (decision 1). Off-today the
 *  current/next collapse (currentAndNext returns null/null), so the fallback
 *  becomes selectedId → first. */
function pickFocus(
  dayLessons: Lesson[],
  selectedId: string | null,
  nowMin: number,
  isToday: boolean,
): Lesson | undefined {
  if (dayLessons.length === 0) return undefined;
  if (selectedId && dayLessons.some((l) => l.id === selectedId)) {
    return dayLessons.find((l) => l.id === selectedId);
  }
  const { currentId, nextId } = currentAndNext(dayLessons, nowMin, isToday);
  const seed = currentId ?? nextId ?? dayLessons[0].id;
  return dayLessons.find((l) => l.id === seed) ?? dayLessons[0];
}

export function DayB(props: DayViewV2Props): ReactNode {
  const {
    dayLessons,
    dayLabel,
    dateLabel,
    isToday,
    selectedId,
    onSelect,
    holidayNode,
    onShiftDay,
    onPlan,
    onQuickAdd,
    quickAdding,
    quickAddError,
    onAddEvent,
  } = props;
  const router = useRouter();
  const { subjectById } = usePlanner();
  const nowMin = useNowMin();

  const sel = pickFocus(dayLessons, selectedId, nowMin, isToday);

  return (
    <div className={styles.viewbody}>
      <DayHeader
        dayLabel={dayLabel}
        onShiftDay={onShiftDay}
        extra={<span className={styles.vsub}>{dateLabel}</span>}
      />

      {/* When there ARE lessons a holiday shows as a banner above the grid;
          with no lessons it takes the focus area instead (below). */}
      {holidayNode && dayLessons.length > 0 && (
        <div className={styles.holiday}>{holidayNode}</div>
      )}

      <div className={styles.vbDay}>
        <div className={styles.vbRail}>
          {dayLessons.map((lesson) => {
            const subject = subjectById[lesson.subject];
            const status = deriveDayStatus(lesson, nowMin, isToday);
            const selected = sel?.id === lesson.id;
            const [start] = lessonTime(lesson).split(/[–—-]/);
            return (
              // Row onClick = redundant pointer convenience; the accessible
              // keyboard select path is the SelectTitle <button>. NOT a
              // role="button" (the moved-arrow cue is a focusable descendant —
              // invalid AT nesting; Codex R2). Double-click opens the planner.
              <div
                key={lesson.id}
                // Stable probe/e2e hook (parity with weekly/catch-up rows;
                // cutover follow-up #3).
                data-planner-item={`lesson:${lesson.id}`}
                className={`cp-subj ${subject.cls} ${styles.vbRailItem} ${
                  selected ? styles.vbRailItemSel : ""
                }`}
                onClick={() => onSelect(lesson.id)}
                onDoubleClick={(e) => {
                  if (fromInteractive(e)) return;
                  onPlan(lesson.id);
                }}
                title="Double-click to open the daily planner"
              >
                <span
                  className={`${styles.rbar} ${
                    lesson.modified ? styles.stripeModified : ""
                  }`}
                />
                <div className={styles.rtext}>
                  <SelectTitle
                    selected={selected}
                    onSelect={() => onSelect(lesson.id)}
                    titleClassName={styles.rt}
                  >
                    {subject.name}
                  </SelectTitle>
                  <div className={styles.rs}>
                    <StatusDot status={status} />
                    {start.trim()} · {STATUS_WORD[status]}
                  </div>
                  <ForkCues lesson={lesson} />
                </div>
              </div>
            );
          })}
          <AddLessonMenu
            triggerClassName={styles.vbRailAdd}
            tooltipId="day-v2-rail-add"
            tooltipContent="Add a lesson or a non-instructional event to this day"
            align="start"
            onQuickAdd={onQuickAdd}
            onAddEvent={onAddEvent}
            quickAdding={quickAdding}
            quickAddError={quickAddError}
            triggerContent={
              <>
                <span className={styles.rplus} aria-hidden="true">
                  +
                </span>
                <span>Add lesson</span>
              </>
            }
          />
        </div>

        {sel ? (
          <FocusPanel
            lesson={sel}
            subjectName={subjectById[sel.subject].name}
            status={deriveDayStatus(sel, nowMin, isToday)}
            onPlan={onPlan}
            onTeach={(id) => router.push(`/teach?lesson=${id}`)}
            onPost={(id) => router.push(`/post?lesson=${id}`)}
          />
        ) : (
          <div className={styles.focusEmpty}>
            {/* `sel` is undefined both when the day is empty AND for the whole
                hydrate, so this branch must not assert emptiness on its own —
                see ./day-empty. `hasLessons` is passed rather than inferred from
                `sel` being undefined: that implication holds today (pickFocus
                above) but is exactly the kind of transitive reasoning that
                shipped the bug. Fewer bars than DayA — one focus panel, not a
                day list. */}
            {holidayNode ?? (
              <DayEmptyState
                hasLessons={dayLessons.length > 0}
                skeletonLines={2}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Focus panel — full lesson detail (bundle .vb-focus) ─────────────────────
function FocusPanel({
  lesson,
  subjectName,
  status,
  onPlan,
  onTeach,
  onPost,
}: {
  lesson: Lesson;
  subjectName: string;
  status: DayStatus;
  onPlan: (id: string) => void;
  onTeach: (id: string) => void;
  onPost: (id: string) => void;
}): ReactNode {
  const { subjectById, units, setLessonStatus } = usePlanner();
  const isDone = lesson.status === "done";
  const unitName = unitDisplayName(units, lesson.subject, lesson.unit);
  return (
    <div
      className={styles.vbFocus}
      onDoubleClick={(e) => {
        if (fromInteractive(e)) return;
        onPlan(lesson.id);
      }}
      title="Double-click to open the daily planner"
    >
      <div
        className={`cp-subj ${lesson.subject} ${styles.vbFocusBand} ${
          lesson.modified ? styles.stripeModified : ""
        }`}
      />
      <div className={styles.vbFocusIn}>
        <div className={styles.ey}>
          <SubjGlyph subject={subjectById[lesson.subject]} size={28} radius={9} />
          <span className={`cp-subj ${lesson.subject} ${styles.eyName}`}>
            {subjectName}
          </span>
          <ForkCues lesson={lesson} />
        </div>
        <h3 className={styles.focusTitle}>{stripHtml(lesson.title)}</h3>
        {/* The unit line was inert text; it is now the pop-in chip. The
            `unitName &&` guard is kept at the callsite (not left to the chip's
            own null return) so the wrapper's bottom margin doesn't survive as a
            gap when there is no unit to show. Both sides resolve through
            unitDisplayName, so they can't disagree. */}
        {unitName && (
          <div className={styles.un}>
            <UnitChip subjectId={lesson.subject} unit={lesson.unit} />
          </div>
        )}
        <div className={`cp-subj ${lesson.subject} ${styles.vbObj}`}>
          {stripHtml(lesson.objective)}
        </div>
        <div className={styles.vbMeta}>
          <div className={styles.mi}>
            <span className={styles.mk}>Standard</span>
            <span className={styles.mv}>{lesson.standards[0] ?? "—"}</span>
          </div>
          <div className={styles.mi}>
            <span className={styles.mk}>Time</span>
            <span className={styles.mv}>{lessonTime(lesson)}</span>
          </div>
          <div className={styles.mi}>
            <span className={styles.mk}>Status</span>
            <span className={styles.mv}>{statusLine(status)}</span>
          </div>
        </div>
        <div className={styles.vbActions}>
          <FinishPill
            status={status}
            isDone={isDone}
            onToggle={() =>
              setLessonStatus(lesson.id, isDone ? "not_done" : "done")
            }
          />
          <Tooltip content="Open this lesson on the teaching board" side="top">
            <button
              type="button"
              className={`${styles.vbBtn} ${styles.vbBtnPri}`}
              onClick={() => onTeach(lesson.id)}
            >
              Open in Teach
            </button>
          </Tooltip>
          <Tooltip content="Open this lesson's planning page" side="top">
            <button
              type="button"
              className={styles.vbBtn}
              onClick={() => onPlan(lesson.id)}
            >
              Lesson plan
            </button>
          </Tooltip>
          {/* Handoff order is Teach · Lesson plan · Post — 7.21
              source-home/views-b.jsx:47-49. */}
          <Tooltip
            content="Open this lesson's resources on the wall"
            side="top"
          >
            <button
              type="button"
              className={styles.vbBtn}
              onClick={() => onPost(lesson.id)}
            >
              Post
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

