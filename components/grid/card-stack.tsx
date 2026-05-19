"use client";

// card-stack.tsx — multi-lesson container for Weekly-grid cells.
//
// A cell that holds N lessons would normally stack them all vertically,
// making that row much taller than its neighbours. CardStack fixes this:
//
//   • maximized=true  → all cards in a plain vertical list (no change).
//   • maximized=false, N ≤ 1 → the single card with no extra chrome.
//   • maximized=false, N > 1 → ONE card visible at a time. CardStack owns
//       the active index + clamping, and renders the active lesson's card
//       with a `deck` prop ({ index, total, onPrev, onNext }). The card
//       itself draws the in-card pager footer — CardStack no longer hosts
//       a separate nav bar or stack-count badge.
//
// Contract: CardStack receives the cell's `lessons` plus a `renderCard`
// function. `renderCard(lesson, deck?)` returns the lesson's card node;
// when `deck` is passed the card renders its pager footer. CardStack calls
// `renderCard` with a stable, memoized `deck` so the memoized SortableLessonItem
// inside does not re-render on every drag pointer-move.

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lesson, WeeklyCardDeck } from "@/lib/types";
import styles from "./card-stack.module.css";

// ── Public contract ──────────────────────────────────────────────────────────

export interface CardStackProps {
  /** The lessons in this cell (or split slot), in display order. */
  lessons: Lesson[];
  /** Renders one lesson's card. `deck`, when supplied, makes the card draw
   *  its own flip-through pager footer. */
  renderCard: (lesson: Lesson, deck?: WeeklyCardDeck) => ReactNode;
  /** Maximized — show every card stacked vertically. Collapsed — show one. */
  maximized: boolean;
}

/** One day×subject cell can hold several lesson cards; CardStack shows them
 *  without inflating the row in collapsed mode. */
export function CardStack({
  lessons,
  renderCard,
  maximized,
}: CardStackProps): ReactNode {
  // Track which card is "on top" in collapsed mode.
  const [activeIdx, setActiveIdx] = useState(0);

  // Clamp the active index whenever lessons are added or removed so the
  // pointer never escapes the valid range (e.g. if the last card is deleted
  // while it is the active one).
  useEffect(() => {
    if (lessons.length === 0) {
      setActiveIdx(0);
      return;
    }
    setActiveIdx((prev) => Math.min(prev, lessons.length - 1));
  }, [lessons.length]);

  // Pager handlers — memoized so the `deck` object handed to the memoized
  // SortableLessonItem stays referentially stable across drag pointer-moves.
  const handlePrev = useCallback(() => {
    setActiveIdx((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setActiveIdx((i) => Math.min(lessons.length - 1, i + 1));
  }, [lessons.length]);

  // The deck prop for the collapsed multi-lesson case. Memoized on the
  // values that actually change so renderCard receives a stable object.
  const deck = useMemo<WeeklyCardDeck>(
    () => ({
      index: activeIdx,
      total: lessons.length,
      onPrev: handlePrev,
      onNext: handleNext,
    }),
    [activeIdx, lessons.length, handlePrev, handleNext],
  );

  // ── Maximized: plain vertical list ──────────────────────────────────────
  if (maximized) {
    return (
      <div className={styles.stackMax}>
        {lessons.map((lesson) => (
          // No `deck` — maximized mode shows every card, so no pager.
          <div key={lesson.id}>{renderCard(lesson)}</div>
        ))}
      </div>
    );
  }

  // ── Collapsed, 0 or 1 card: no extra chrome, card fills the cell ─────────
  if (lessons.length <= 1) {
    return (
      <div className={styles.stackSingle}>
        {lessons.length === 1 ? renderCard(lessons[0]) : null}
      </div>
    );
  }

  // ── Collapsed, N > 1: render only the active card with the deck prop ─────
  // The card draws its own pager footer; the index is clamped above.
  const safeIdx = Math.min(activeIdx, lessons.length - 1);
  return (
    <div className={styles.stackDeck}>
      <div className={styles.activeCard}>
        {renderCard(lessons[safeIdx], deck)}
      </div>
    </div>
  );
}
