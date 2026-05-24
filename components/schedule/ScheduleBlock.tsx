"use client";

// ScheduleBlock.tsx — one TimelineBlock rendered absolutely-positioned inside
// a ScheduleColumn body.
//
// Two flavors (per the artboard, lines 694–720):
//   • Academic — subject-tinted via the `cp-subj <subjectId>` cascade.
//                Background mixes the subject `--c` into paper at 8%, with
//                a 3px subject-color left stripe. Renders the subject name
//                as an uppercase eyebrow on the first line.
//   • Non-academic — neutral chrome (paper background, ink-200 stripe).
//                    One uppercase label (e.g. "Snack & recess").
//
// Click behavior:
//   • Academic block + linked lesson → setSelectedLessonId(...) and
//     navigate to /daily so the Daily two-pane surface opens with that
//     lesson selected.
//   • Academic block without a linked lesson → no-op (TODO: open the
//     AddLesson form pre-populated with this slot's subject + time-range
//     once the persistence action lands).
//   • Non-academic block → no-op; these are configured in Settings, not
//     edited from the timeline.
//
// Height-conditional content (matches the artboard):
//   • All blocks render the subject name (academic) or label (non-academic).
//   • Blocks ≥ 32px tall ALSO render a secondary line (lesson title or
//     non-academic label).
//   • Blocks ≥ 50px tall ALSO render the time range in the bottom-right.
// Below 32px the block is too short to fit anything beyond the eyebrow.

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  type TimelineBlock,
  formatBlockTime,
  minuteToTop,
  PX_PER_MIN,
} from "@/lib/schedule-data";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import styles from "./ScheduleBlock.module.css";

/** Below this px height a block only fits the eyebrow line. */
const SECONDARY_LINE_MIN_HEIGHT = 32;
/** Below this px height a block has no room for the time-range footer. */
const TIME_RANGE_MIN_HEIGHT = 50;

export interface ScheduleBlockProps {
  block: TimelineBlock;
}

export function ScheduleBlock({ block }: ScheduleBlockProps): ReactNode {
  const router = useRouter();
  const { setSelectedLessonId } = useAppState();
  const { getLesson } = usePlanner();

  // Compute the block's pixel rect once. PX_PER_MIN drives the height; the
  // top edge is the standard minute→pixel mapping clamped to the visible
  // window.
  const top = minuteToTop(block.startMin);
  const height = (block.endMin - block.startMin) * PX_PER_MIN;

  const isAcademic = block.type === "academic" && !!block.subject;
  const subject =
    isAcademic && block.subject ? SUBJECT_BY_ID[block.subject] : null;

  // For academic blocks, prefer the linked lesson's title if available; the
  // fixture sometimes only has a subject + label (e.g. "Unit 3 assessment")
  // — fall back to that, then nothing.
  const linkedLesson = block.lesson ? getLesson(block.lesson) : undefined;
  const secondaryText =
    (isAcademic ? (linkedLesson?.title ?? block.label ?? null) : block.label) ??
    null;

  const showSecondary = height >= SECONDARY_LINE_MIN_HEIGHT && !!secondaryText;
  const showTimeRange = height >= TIME_RANGE_MIN_HEIGHT;

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (!isAcademic) return;
    if (linkedLesson) {
      setSelectedLessonId(linkedLesson.id);
      router.push("/daily");
      return;
    }
    // TODO: when AddLesson persistence lands, open the AddLessonForm pre-
    // populated with this block's subject + time range. For now an academic
    // block without a linked lesson is a no-op click.
  };

  // Compose the academic class string so the cp-subj cascade resolves
  // --c / --cl / --cd inside the block; non-academic blocks skip it.
  const rootClass = [
    styles.block,
    isAcademic ? styles.academic : styles.nonAcademic,
    isAcademic && subject ? `cp-subj ${subject.cls}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaTitle = isAcademic && subject ? subject.name : (block.label ?? "");
  const ariaLabel = `${formatBlockTime(block.startMin)} to ${formatBlockTime(
    block.endMin,
  )} — ${ariaTitle}${secondaryText ? `, ${secondaryText}` : ""}`;

  return (
    <button
      type="button"
      className={rootClass}
      style={{ top, height }}
      onClick={handleClick}
      aria-label={ariaLabel}
      // Non-academic + no-linked-lesson blocks aren't really interactive yet;
      // making them buttons keeps the keyboard story consistent (every block
      // is focusable) but tabIndex=-1 keeps them out of the tab sequence
      // until they have an action.
      tabIndex={isAcademic && linkedLesson ? 0 : -1}
    >
      <div className={styles.eyebrow}>
        {isAcademic && subject ? subject.name : block.label}
      </div>
      {showSecondary && <div className={styles.secondary}>{secondaryText}</div>}
      {showTimeRange && (
        <div className={styles.timeRange}>
          {formatBlockTime(block.startMin)}–{formatBlockTime(block.endMin)}
        </div>
      )}
    </button>
  );
}
