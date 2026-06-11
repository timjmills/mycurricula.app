"use client";

// components/notecards/NotecardFullscreen.tsx — the split-screen notecard view.
//
// The "open large" surface for a notecard (Ultraplan §3, §4): a full-screen
// modal split into a media carousel on the LEFT and the written notes on the
// RIGHT. The teacher flips the gallery (each item enlargeable via
// onEnlargeItem) while the notes stay readable alongside. On phone (≤640px)
// the split stacks — media on top, notes below — so neither pane gets crushed.
//
// Modal mechanics mirror ResourcePreview (the house pattern): role="dialog" +
// aria-modal, Esc + backdrop close, focus moves into the dialog on open and is
// restored to the trigger on close, and the fade respects
// prefers-reduced-motion (CSS module).
//
// Chrome (CLAUDE.md §4): all color/radii/type via tokens (the dark backdrop
// scrim is the one literal, matching ResourcePreview); the notes body is
// sanitized with sanitizeHtml() before dangerouslySetInnerHTML (audit #9 —
// stored XSS under the forking model); the close button carries a ≥44px touch
// target on phone + an aria-label.

import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LessonResource } from "@/lib/types";
import { galleryItems, hasNotes } from "@/lib/notecards";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Gallery } from "./Gallery";
import styles from "./NotecardFullscreen.module.css";

export interface NotecardFullscreenProps {
  /** The notecard to present full screen. */
  resource: LessonResource;
  /** Close the modal (Esc, backdrop click, × button). */
  onClose: () => void;
  /** Enlarge a single gallery item further (e.g. a true 1:1 image lightbox),
   *  called with the carousel's current index. Optional — when omitted the
   *  carousel items are not separately click-to-enlarge. */
  onEnlargeItem?: (index: number) => void;
}

/** Full-screen split view: media carousel left, written notes right. */
export function NotecardFullscreen({
  resource,
  onClose,
  onEnlargeItem,
}: NotecardFullscreenProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc to close + focus management: move focus into the dialog on open and
  // restore it to whatever held focus (the trigger) on close. Identical to
  // ResourcePreview so the two modals behave the same.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [onClose]);

  const items = galleryItems(resource);
  const showNotes = hasNotes(resource);
  const title = resource.label || "Notecard";

  // Sanitize the notes HTML before injection (audit #9 — stored XSS).
  const safeBody = useMemo(
    () => sanitizeHtml(resource.body ?? ""),
    [resource.body],
  );

  // Clicking the backdrop (but not the dialog surface) closes.
  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Notecard: ${title}`}
        className={styles.dialog}
      >
        {/* ── Header: title + close ────────────────────────────────────────── */}
        <header className={styles.header}>
          <span className={styles.title} title={title}>
            {title}
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close notecard"
            title="Close notecard"
          >
            <CloseIcon />
          </button>
        </header>

        {/* ── Split body: media carousel left, notes right (stacked on phone) ── */}
        <div className={styles.split}>
          <section className={styles.mediaPane} aria-label="Media">
            {items.length > 0 ? (
              <Gallery
                items={items}
                onEnlarge={onEnlargeItem}
                className={styles.carousel}
              />
            ) : (
              <p className={styles.emptyMedia}>This notecard has no media.</p>
            )}
          </section>

          <section className={styles.notesPane} aria-label="Notes">
            {showNotes ? (
              <div
                className={styles.notes}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
            ) : (
              <p className={styles.emptyNotes}>No notes on this card yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function CloseIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
