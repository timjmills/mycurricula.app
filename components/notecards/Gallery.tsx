"use client";

// components/notecards/Gallery.tsx — a flip-through media strip.
//
// A notecard (or any "photo stack") carries an ordered `gallery` of
// LessonResources — images, video, PDFs, embeds, links, mixed freely. This
// component shows ONE item large at a time (via the shared ResourceEmbed
// renderer, so every provider renders exactly as it does elsewhere) and lets
// the teacher flip between them: prev/next chevrons, a dot/index indicator,
// keyboard (← / →) when the strip holds focus, and touch swipe on phone.
//
// Current-index state is OWNED here — the consumer just hands us the items and
// an optional `onEnlarge(index)` hook. Clicking the current item fires
// onEnlarge with the visible index so the parent can open the big preview /
// fullscreen carousel at the right slide.
//
// Edge cases the component handles itself:
//   • 0 items  → renders nothing (a notes-only notecard has no media).
//   • 1 item   → renders the single item with NO flip controls / dots.
//
// Chrome (CLAUDE.md §4): all color/radii/type via tokens; ≥44px touch targets
// on the chevrons; arrows carry aria-labels; the fade/slide respects
// prefers-reduced-motion (handled in the CSS module). Tooltips on the
// non-obvious flip controls.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { LessonResource } from "@/lib/types";
import { ResourceEmbed } from "@/components/resources";
import { Button } from "@/components/ui";
import styles from "./Gallery.module.css";

export interface GalleryProps {
  /** Ordered media to flip through (already resolved via `galleryItems`). */
  items: LessonResource[];
  /** Fired with the visible index when the current item is clicked — the
   *  parent opens the enlarge modal / fullscreen carousel at that slide. */
  onEnlarge?: (index: number) => void;
  /** Optional extra class on the root (sizing from the host context). */
  className?: string;
}

/** Minimum horizontal travel (px) of a touch before it counts as a swipe
 *  rather than a tap — keeps a click-to-enlarge from being read as a flick. */
const SWIPE_THRESHOLD = 40;

/** A flip-through media strip for a notecard's gallery. */
export function Gallery({
  items,
  onEnlarge,
  className,
}: GalleryProps): ReactNode {
  // Current visible slide. Clamped against `items.length` in an effect below
  // so a parent that swaps to a shorter gallery never strands us out of range.
  const [index, setIndex] = useState(0);
  // Pointer-down X for the swipe gesture; null when no drag is in flight.
  const dragStartX = useRef<number | null>(null);

  const count = items.length;
  const hasFlip = count > 1;

  // Keep the index valid if the items array shrinks (parent reuse / edit).
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      // Wrap around both ends so the carousel is endless in either direction.
      const wrapped = ((next % count) + count) % count;
      setIndex(wrapped);
    },
    [count],
  );

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  // Keyboard flipping — only meaningful when the strip holds focus AND there's
  // more than one item. We swallow the arrow keys so they don't also scroll a
  // surrounding container.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!hasFlip) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    },
    [hasFlip, prev, next],
  );

  // Touch swipe — record the start X on pointer-down, decide on pointer-up.
  // A travel beyond SWIPE_THRESHOLD flips; anything shorter is left for the
  // click handler (enlarge). Only wired when there's more than one item.
  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!hasFlip) return;
      dragStartX.current = e.clientX;
    },
    [hasFlip],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = dragStartX.current;
      dragStartX.current = null;
      if (start === null) return;
      const dx = e.clientX - start;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      // Swipe left (negative dx) advances; swipe right goes back — matching the
      // natural "drag the next card into view" direction.
      if (dx < 0) next();
      else prev();
    },
    [next, prev],
  );

  // Clear a half-finished drag (pointer cancelled, or it left the element
  // before lifting) so a stale start-X can't mis-fire on the next pointer-up.
  const onPointerCancel = useCallback(() => {
    dragStartX.current = null;
  }, []);

  // 0 items — nothing to show. A notes-only notecard renders no media strip.
  if (count === 0) return null;

  const current = items[index];
  const rootClass = [styles.gallery, className].filter(Boolean).join(" ");

  return (
    <div
      className={rootClass}
      // Group role + label so AT announces this as a flippable media region.
      role="group"
      aria-roledescription="media gallery"
      aria-label={
        hasFlip ? `Media ${index + 1} of ${count}` : current.label || "Media"
      }
      // tabIndex makes the strip focusable so ←/→ work; only when flippable.
      tabIndex={hasFlip ? 0 : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* ── Stage: the current item, large. Clicking it enlarges. ──────────
          We render the embed inside a button only when an onEnlarge handler is
          supplied — otherwise the embed's own affordances (an image's lightbox,
          an iframe's player) stay clickable without a wrapping button stealing
          the interaction. */}
      <div className={styles.stage}>
        {onEnlarge ? (
          <button
            type="button"
            className={styles.stageButton}
            onClick={() => onEnlarge(index)}
            aria-label={`Enlarge ${current.label || "media"}`}
            title="Open this media full size"
          >
            {/* key forces a fresh mount per slide so an iframe/video resets
                cleanly when flipping (no stale player state bleeds across). */}
            <ResourceEmbed key={index} resource={current} variant="tile" />
          </button>
        ) : (
          <div className={styles.stageStatic}>
            <ResourceEmbed key={index} resource={current} variant="tile" />
          </div>
        )}
      </div>

      {/* ── Flip controls — only when there's more than one item. ─────────── */}
      {hasFlip && (
        <>
          <Button
            variant="icon"
            size="sm"
            className={`${styles.navBtn} ${styles.navPrev}`}
            onClick={prev}
            iconAriaLabel="Show previous media"
            tooltip="Flip to the previous item in this card's gallery"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="icon"
            size="sm"
            className={`${styles.navBtn} ${styles.navNext}`}
            onClick={next}
            iconAriaLabel="Show next media"
            tooltip="Flip to the next item in this card's gallery"
          >
            <ChevronRightIcon />
          </Button>

          {/* Index indicator: dots for a short gallery, a compact "n / total"
              counter once the dot row would get unwieldy. */}
          {count <= 8 ? (
            <div className={styles.dots} aria-hidden="true">
              {items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                  onClick={() => goTo(i)}
                  // Decorative-but-usable: aria-hidden on the row, so give each
                  // dot a title for the pointer hover without adding AT noise
                  // (the group's aria-label already announces the position).
                  title={`Go to media ${i + 1}`}
                  tabIndex={-1}
                />
              ))}
            </div>
          ) : (
            <div className={styles.counter} aria-hidden="true">
              {index + 1} / {count}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
// Stroked chevrons matching the ResourcePreview icon family.

function ChevronLeftIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
