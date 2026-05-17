"use client";

// card-stack.tsx — stacked-deck pager for multi-lesson Weekly-grid cells.
//
// A cell that holds N lessons would normally stack them all vertically,
// making that row much taller than its neighbours. CardStack fixes this:
//
//   • maximized=true  → all cards in a plain vertical list (no change).
//   • maximized=false, N ≤ 1 → the single card (or nothing) with no chrome.
//   • maximized=false, N > 1 → ONE card visible at a time, with:
//       – a stacked-deck visual (two thin offset pseudo-layers peeking behind)
//       – ◀ / ▶ arrow buttons to page through the active index
//       – a small "{i} of {n}" position indicator
//     Arrow clicks and the counter call e.stopPropagation() so paging never
//     bubbles up to the parent cell-click handler.

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import styles from "./card-stack.module.css";

// ── Public contract ──────────────────────────────────────────────────────────

export interface CardStackProps {
  /** The lesson cards to display, already rendered (one node per lesson). */
  cards: ReactNode[];
  /** Maximized — show every card stacked vertically. Collapsed — show one. */
  maximized: boolean;
}

/** One day×subject cell can hold several lesson cards; CardStack shows them
 *  without inflating the row in collapsed mode. */
export function CardStack({ cards, maximized }: CardStackProps): ReactNode {
  // Track which card is "on top" in collapsed mode.
  const [activeIdx, setActiveIdx] = useState(0);

  // Clamp the active index whenever cards are added or removed so the
  // pointer never escapes the valid range (e.g. if the last card is deleted
  // while it is the active one).
  useEffect(() => {
    if (cards.length === 0) {
      setActiveIdx(0);
      return;
    }
    setActiveIdx((prev) => Math.min(prev, cards.length - 1));
  }, [cards.length]);

  // ── Maximized: plain vertical list ──────────────────────────────────────
  if (maximized) {
    return (
      <div className={styles.stackMax}>
        {cards.map((card, i) => (
          // Stable keys are the consumer's responsibility (each card is a
          // pre-rendered ReactNode). Index keys are fine here because
          // maximized mode renders everything and order comes from the parent.
          <div key={i}>{card}</div>
        ))}
      </div>
    );
  }

  // ── Collapsed, 0 or 1 card: no extra chrome ──────────────────────────────
  if (cards.length <= 1) {
    return (
      <div className={styles.stackSingle}>
        {cards.length === 1 ? cards[0] : null}
      </div>
    );
  }

  // ── Collapsed, N > 1: deck view with pager ───────────────────────────────
  const isFirst = activeIdx === 0;
  const isLast = activeIdx === cards.length - 1;

  function handlePrev(e: React.MouseEvent): void {
    e.stopPropagation();
    setActiveIdx((i) => Math.max(0, i - 1));
  }

  function handleNext(e: React.MouseEvent): void {
    e.stopPropagation();
    setActiveIdx((i) => Math.min(cards.length - 1, i + 1));
  }

  // stopPropagation on the counter element's click (pointer events are
  // suppressed via CSS on the <span> itself, but the wrapping div still
  // stops bubbling for keyboard/synthetic events).
  function stopBubble(e: React.MouseEvent): void {
    e.stopPropagation();
  }

  return (
    <div className={styles.stackDeck}>
      {/* Stacked-deck stage: the active card floats above two thin pseudo-
          layers (::before / ::after in the CSS) that simulate a deck.
          A prominent stack-count badge floats over the top-right corner so
          a teacher can see at a glance that multiple lessons are here. */}
      <div className={styles.deckStage}>
        <div className={styles.activeCard}>{cards[activeIdx]}</div>

        {/* Stack-count badge — "⧉ {n}" pinned top-right of the stage.
            aria-label announced to screen-readers; the visual badge is
            aria-hidden because the navBar counter also reads the count. */}
        <div
          className={styles.stackCountBadge}
          aria-hidden="true"
          title={`${cards.length} lessons stacked`}
        >
          <StackLayersIcon />
          {cards.length}
        </div>
      </div>

      {/* Navigation bar: [◀]  {i} of {n}  [▶] */}
      <div className={styles.navBar} onClick={stopBubble}>
        <button
          type="button"
          className={styles.arrow}
          onClick={handlePrev}
          disabled={isFirst}
          aria-label="Previous lesson"
        >
          <ChevronLeft />
        </button>

        {/* Position counter — pointer-events: none in CSS; stopBubble on
            the navBar wrapper handles any residual click propagation. */}
        <span className={styles.counter} aria-live="polite" aria-atomic="true">
          {activeIdx + 1} of {cards.length}
        </span>

        <button
          type="button"
          className={styles.arrow}
          onClick={handleNext}
          disabled={isLast}
          aria-label="Next lesson"
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

// ── Stack-count badge icon ───────────────────────────────────────────────────

/** Two overlapping rectangles — universally reads as "stacked layers". */
function StackLayersIcon(): ReactNode {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="0" y="3" width="9" height="7" rx="1.5" opacity="0.65" />
      <rect x="3" y="0" width="9" height="7" rx="1.5" />
    </svg>
  );
}

// ── Inline SVG chevrons (no extra dependency) ────────────────────────────────

function ChevronLeft(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
