"use client";

// components/notecards/NotecardCard.tsx — the at-rest notecard.
//
// A notecard is a LessonResource (`type:"notecard"`) whose content is a
// flip-through media gallery plus a rich-text notes body. This card shows:
//   • the title (resource.label),
//   • the Gallery on top (the resource's resolved gallery items),
//   • the notes body below — COLLAPSED by default to a few lines (the weekly
//     card idiom), expanding on click to the full sanitized HTML.
//
// Expand state follows the weekly-card contract: a controlled (`expanded` +
// `onToggleExpand`) mode for a parent that owns the layout, falling back to
// internal state when those props are omitted so the card is drop-in usable.
//
// An "open fullscreen" affordance (onOpenFullscreen) hands the parent the cue
// to mount <NotecardFullscreen> (gallery carousel left, notes right). The
// gallery's own per-item enlarge is surfaced via onEnlarge(index).
//
// Chrome (CLAUDE.md §4): all color/radii/type via tokens; the notes body is
// sanitized with sanitizeHtml() before dangerouslySetInnerHTML (audit #9 —
// stored XSS, since a teammate's notecard reaches this screen under the forking
// model); ≥44px touch targets on controls; tooltips on the non-obvious
// expand / fullscreen controls; the expand chevron rotation respects
// prefers-reduced-motion (handled in the CSS module).

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { LessonResource } from "@/lib/types";
import { galleryItems, hasNotes } from "@/lib/notecards";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Button } from "@/components/ui";
import { Gallery } from "./Gallery";
import styles from "./NotecardCard.module.css";

export interface NotecardCardProps {
  /** The notecard resource to render. */
  resource: LessonResource;
  /** Controlled expand state. Omit (with `onToggleExpand`) to self-manage. */
  expanded?: boolean;
  /** Toggle the notes-body disclosure. Omit to self-manage. */
  onToggleExpand?: () => void;
  /** Enlarge the gallery's current item — forwarded from the Gallery, called
   *  with the visible index so the parent can open a big preview at that slide. */
  onEnlarge?: (index: number) => void;
  /** Open the split fullscreen view (media carousel left, notes right). */
  onOpenFullscreen?: () => void;
}

/** The at-rest notecard: gallery on top, expandable rich notes below. */
export function NotecardCard({
  resource,
  expanded,
  onToggleExpand,
  onEnlarge,
  onOpenFullscreen,
}: NotecardCardProps): ReactNode {
  // Controlled vs. uncontrolled expand, mirroring the weekly card: when the
  // parent passes both `expanded` and `onToggleExpand` we defer to it;
  // otherwise we own the state so the card works standalone.
  const isControlled = expanded !== undefined && onToggleExpand !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isControlled ? expanded : internalExpanded;

  const toggleExpand = useCallback(() => {
    if (isControlled) onToggleExpand?.();
    else setInternalExpanded((v) => !v);
  }, [isControlled, onToggleExpand]);

  const items = galleryItems(resource);
  const showNotes = hasNotes(resource);
  const title = resource.label || "Notecard";

  // Sanitize the notes HTML before injection (audit #9 — stored XSS). Memoized
  // so the DOMPurify pass only re-runs when the source body changes.
  const safeBody = useMemo(
    () => sanitizeHtml(resource.body ?? ""),
    [resource.body],
  );

  return (
    <article className={styles.card} aria-label={`Notecard: ${title}`}>
      {/* ── Header: title + open-fullscreen affordance ─────────────────────── */}
      <header className={styles.header}>
        <h3 className={styles.title} title={title}>
          {title}
        </h3>
        {onOpenFullscreen && (
          <Button
            variant="icon"
            size="sm"
            className={styles.fullscreenBtn}
            onClick={onOpenFullscreen}
            iconAriaLabel={`Open "${title}" full screen`}
            tooltip="Open this notecard full screen — media on the left, notes on the right"
          >
            <ExpandIcon />
          </Button>
        )}
      </header>

      {/* ── Gallery — only when the card carries media. ────────────────────── */}
      {items.length > 0 && (
        <Gallery
          items={items}
          onEnlarge={onEnlarge}
          className={styles.gallery}
        />
      )}

      {/* ── Notes body — collapsed to a few lines, click to expand. ─────────
          Mirrors the weekly card: the body is a clamp at rest; the toggle row
          beneath flips it open to the full sanitized HTML. Nothing renders when
          the notecard has no notes (a media-only stack). */}
      {showNotes && (
        <div className={styles.notesWrap}>
          <div
            className={`${styles.notes} ${isExpanded ? styles.notesExpanded : styles.notesClamped}`}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: safeBody }}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={toggleExpand}
            aria-expanded={isExpanded}
          >
            <span>{isExpanded ? "Show less" : "Show more"}</span>
            <span
              className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}
              aria-hidden="true"
            >
              <ChevronDownIcon />
            </span>
          </button>
        </div>
      )}
    </article>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function ExpandIcon(): ReactNode {
  // Diagonal corner arrows — the "open full screen" affordance.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
