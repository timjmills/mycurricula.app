"use client";

// DayA.tsx — Frame "glass" (Calm Recede). A vertical timeline of glass cards
// over the recede background: one row per lesson, time on the left, subject
// glyph, title/unit, and a right cluster of a Finish pill + a Plan|Teach split.
// A dashed "Add to <day>" row opens a small create menu. Bundle: views-a.jsx
// DayA + DayAddA (B:5926-5989), CSS B:796-903.

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/lib/planner-store";
import { deriveDayStatus, currentAndNext } from "@/lib/day-status";
import { lessonTime } from "@/lib/mock/schedule";
import { stripHtml } from "@/lib/html-text";
import { Tooltip } from "@/components/ui";
import type { Lesson } from "@/lib/types";
import {
  SubjGlyph,
  ForkCues,
  FinishPill,
  AddLessonMenu,
  SelectTitle,
} from "./atoms";
import { useNowMin, fromInteractive } from "./util";
import { DayHeader } from "./DayHeader";
import type { DayViewV2Props } from "./DayViewV2";
import styles from "./day-v2.module.css";

/** Split an effective time label ("8:10–9:10") into its two clock tokens for
 *  the stacked time column; falls back to the whole label on one line. */
function timeParts(lesson: Lesson): [string, string] {
  const label = lessonTime(lesson);
  const parts = label.split(/[–—-]/);
  return parts.length >= 2
    ? [parts[0].trim(), parts[1].trim()]
    : [label.trim(), ""];
}

export function DayA(props: DayViewV2Props): ReactNode {
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
  const { subjectById, setLessonStatus } = usePlanner();
  const nowMin = useNowMin();

  const doneCount = dayLessons.filter((l) => l.status === "done").length;
  const { currentId } = currentAndNext(dayLessons, nowMin, isToday);

  // Scroll the selected lesson into view once when the selection changes and it
  // lives in this day (decision 1) — e.g. a deep-link or a cross-view select.
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!selectedId) return;
    const el = rowRefs.current.get(selectedId);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className={styles.viewbody}>
      <DayHeader
        dayLabel={dayLabel}
        onShiftDay={onShiftDay}
        extra={
          <span className={styles.vsub}>
            {dateLabel}
            <br />
            {doneCount} of {dayLessons.length} complete
          </span>
        }
      />

      {holidayNode && <div className={styles.holiday}>{holidayNode}</div>}

      <div className={styles.vaDay}>
        {dayLessons.length === 0 && !holidayNode && (
          <p className={styles.emptyDay}>No lessons planned for this day.</p>
        )}
        {dayLessons.map((lesson) => {
            const subject = subjectById[lesson.subject];
            const status = deriveDayStatus(lesson, nowMin, isToday);
            const isDone = lesson.status === "done";
            const selected = selectedId === lesson.id;
            const isNow = status === "now" || currentId === lesson.id;
            const [start, end] = timeParts(lesson);
            const title = stripHtml(lesson.title);
            return (
              // The row container's onClick is a REDUNDANT pointer convenience
              // (select-on-click anywhere); it is deliberately NOT a
              // role="button" — the accessible/keyboard select path is the
              // SelectTitle <button>, and a role="button" around the row's
              // Finish/Plan/Teach buttons + moved-arrow cue would be invalid AT
              // nesting (Codex R2). Double-click still opens the planner.
              <div
                key={lesson.id}
                // Stable probe/e2e + scrollPlannerItemIntoView hook (parity
                // with weekly/catch-up rows; cutover follow-up #3).
                data-planner-item={`lesson:${lesson.id}`}
                ref={(el) => {
                  if (el) rowRefs.current.set(lesson.id, el);
                  else rowRefs.current.delete(lesson.id);
                }}
                className={`cp-subj ${subject.cls} ${styles.vaRow} ${
                  isNow ? styles.vaRowNow : ""
                } ${isDone ? styles.vaRowDone : ""} ${
                  selected ? styles.vaRowSelected : ""
                } ${lesson.modified ? styles.stripeModified : ""}`}
                onClick={() => onSelect(lesson.id)}
                onDoubleClick={(e) => {
                  if (fromInteractive(e)) return;
                  e.stopPropagation();
                  onPlan(lesson.id);
                }}
                title="Double-click to open the daily planner"
              >
                <div className={styles.vaTime}>
                  {start}
                  {end && (
                    <>
                      <br />
                      {end}
                    </>
                  )}
                </div>
                <SubjGlyph subject={subject} />
                <div className={styles.vaBody}>
                  <SelectTitle
                    selected={selected}
                    onSelect={() => onSelect(lesson.id)}
                    titleClassName={styles.vaTitle}
                  >
                    {title}
                  </SelectTitle>
                  <div className={styles.vaUnit}>
                    {subject.name} · {lesson.unit}
                  </div>
                  <ForkCues lesson={lesson} />
                </div>
                <div className={styles.vaEnd}>
                  <FinishPill
                    status={status}
                    isDone={isDone}
                    onToggle={() =>
                      setLessonStatus(
                        lesson.id,
                        lesson.status === "done" ? "not_done" : "done",
                      )
                    }
                  />
                  <div className={styles.vaPillsplit}>
                    <Tooltip content="Open this lesson's planning page" side="top">
                      <button
                        type="button"
                        className={styles.vaPillBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlan(lesson.id);
                        }}
                      >
                        Plan
                      </button>
                    </Tooltip>
                    <Tooltip content="Open this lesson on the teaching board" side="top">
                      <button
                        type="button"
                        className={styles.vaPillBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/teach?lesson=${lesson.id}`);
                        }}
                      >
                        Teach
                      </button>
                    </Tooltip>
                    {/* Wave 9: a "Post" (resource wall) button lands here once
                        the /post route ships. */}
                  </div>
                </div>
              </div>
            );
          })}

        <AddLessonMenu
          wrapperClassName={styles.vaDayAddWrap}
          triggerClassName={styles.vaDayAdd}
          tooltipId="day-v2-add-to-day"
          tooltipContent="Add a lesson or a non-instructional event to this day"
          onQuickAdd={onQuickAdd}
          onAddEvent={onAddEvent}
          quickAdding={quickAdding}
          quickAddError={quickAddError}
          triggerContent={
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add to {dayLabel}
            </>
          }
        />
      </div>
    </div>
  );
}

