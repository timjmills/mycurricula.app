"use client";

// DayC.tsx — Frame "color" (Color-forward). A compact agenda on the left; a
// large subject-colored hero panel on the right carries the focused lesson.
// Selection is SHELL-OWNED (props selectedId / onSelect), seeded current →
// next → first. Bundle: views-c.jsx DayC (B:6231-6288), CSS B:969-1000.

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
import { Tooltip } from "@/components/ui";
import type { Lesson } from "@/lib/types";
import {
  ForkCues,
  FinishPill,
  AddLessonMenu,
  SelectTitle,
} from "./atoms";
import { useNowMin, fromInteractive } from "./util";
import { DayHeader } from "./DayHeader";
import type { DayViewV2Props } from "./DayViewV2";
import styles from "./day-v2.module.css";

/** The static lesson-flow chips shown on the hero (decorative, matches bundle). */
const FLOW_STEPS = ["Warm-up", "Mini-lesson", "Guided practice", "Exit ticket"];

function statusLine(status: DayStatus): string {
  if (status === "done") return "Complete";
  if (status === "now") return "In progress";
  return "Planned";
}

/** Pick the focused lesson: global selection when in this day, else the
 *  current → next → first fallback (decision 1). Off-today the current/next
 *  collapse, so the fallback becomes selectedId → first. */
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

export function DayC(props: DayViewV2Props): ReactNode {
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

      {/* Lessons present → holiday is a banner above; no lessons → it takes the
          hero area (below). */}
      {holidayNode && dayLessons.length > 0 && (
        <div className={styles.holiday}>{holidayNode}</div>
      )}

      <div className={styles.vcDay}>
        <div className={styles.vcAgenda}>
          {dayLessons.map((lesson) => {
            const subject = subjectById[lesson.subject];
            const selected = sel?.id === lesson.id;
            const [start] = lessonTime(lesson).split(/[–—-]/);
            return (
              // Row onClick = redundant pointer convenience; the accessible
              // keyboard select path is the SelectTitle <button>. NOT a
              // role="button" (the moved-arrow cue is a focusable descendant —
              // invalid AT nesting; Codex R2). Double-click opens the planner.
              <div
                key={lesson.id}
                className={`cp-subj ${subject.cls} ${styles.vcAitem} ${
                  selected ? styles.vcAitemSel : ""
                }`}
                onClick={() => onSelect(lesson.id)}
                onDoubleClick={(e) => {
                  if (fromInteractive(e)) return;
                  onPlan(lesson.id);
                }}
                title="Double-click to open the daily planner"
              >
                <span className={styles.at}>{start.trim()}</span>
                <span
                  className={`${styles.ad} ${
                    lesson.modified ? styles.stripeModified : ""
                  }`}
                />
                <div className={styles.vcAtext}>
                  <SelectTitle
                    selected={selected}
                    onSelect={() => onSelect(lesson.id)}
                    titleClassName={styles.an}
                  >
                    {stripHtml(lesson.title)}
                  </SelectTitle>
                  <div className={`cp-subj ${subject.cls} ${styles.au}`}>
                    {subject.name}
                  </div>
                  <ForkCues lesson={lesson} />
                </div>
              </div>
            );
          })}
          <AddLessonMenu
            triggerClassName={styles.vcAadd}
            tooltipId="day-v2-agenda-add"
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
          <Hero
            lesson={sel}
            subjectName={subjectById[sel.subject].name}
            status={deriveDayStatus(sel, nowMin, isToday)}
            onPlan={onPlan}
            onTeach={(id) => router.push(`/teach?lesson=${id}`)}
          />
        ) : (
          <div className={styles.heroEmpty}>
            {holidayNode ?? (
              <p className={styles.emptyDay}>No lessons planned for this day.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hero — the subject-colored focus panel (bundle .vc-detail) ──────────────
function Hero({
  lesson,
  subjectName,
  status,
  onPlan,
  onTeach,
}: {
  lesson: Lesson;
  subjectName: string;
  status: DayStatus;
  onPlan: (id: string) => void;
  onTeach: (id: string) => void;
}): ReactNode {
  const { setLessonStatus } = usePlanner();
  const isDone = lesson.status === "done";
  return (
    <div
      className={`cp-subj ${lesson.subject} ${styles.vcDetail} ${
        lesson.modified ? styles.vcDetailModified : ""
      }`}
    >
      <div className={styles.dcTop}>
        <div className={styles.dcTopHead}>
          <div className={styles.dlab}>
            {subjectName} · {lessonTime(lesson)}
          </div>
          <ForkCues lesson={lesson} />
        </div>
        <h3 className={styles.detailTitle}>{stripHtml(lesson.title)}</h3>
        <div className={styles.dun}>{lesson.unit}</div>
      </div>
      <div className={styles.dcTarget}>
        <span className={styles.dcTl}>Learning target</span>
        <div className={styles.dobj}>{stripHtml(lesson.objective)}</div>
      </div>
      <div className={styles.dcFlow}>
        {FLOW_STEPS.map((step, i) => (
          <span key={step} className={styles.dcStep}>
            <b>{i + 1}</b>
            {step}
          </span>
        ))}
      </div>
      <div className={styles.dfoot}>
        <span className={styles.dchip}>{lesson.standards[0] ?? "—"}</span>
        <span className={styles.dchip}>{statusLine(status)}</span>
        <FinishPill
          status={status}
          isDone={isDone}
          onToggle={() =>
            setLessonStatus(lesson.id, isDone ? "not_done" : "done")
          }
          className={styles.dfootFinish}
        />
        <Tooltip content="Open this lesson's planning page" side="top">
          <button
            type="button"
            className={`${styles.vbBtn} ${styles.dfootPlan}`}
            onClick={() => onPlan(lesson.id)}
          >
            Plan
          </button>
        </Tooltip>
        <Tooltip content="Open this lesson on the teaching board" side="top">
          <button
            type="button"
            className={`${styles.vbBtn} ${styles.vbBtnPri}`}
            onClick={() => onTeach(lesson.id)}
          >
            Open in Teach
          </button>
        </Tooltip>
        {/* Wave 9: a "Post" (resource wall) button lands here once the /post
            route ships. */}
      </div>
    </div>
  );
}
