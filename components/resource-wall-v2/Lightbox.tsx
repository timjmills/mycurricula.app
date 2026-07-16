"use client";

// Lightbox — the wall's full-screen viewer + slideshow (Wave 9a).
//
// Two modes over one frame:
//   • slideshow — a deck of cards; ←/→ (and the on-stage arrows) walk it.
//   • enlarge   — a single card, blown up. Same frame, no deck chrome.
//
// The media itself renders through `ResourceEmbed` — the audited renderer that
// consults `canEmbedResource`, rewrites provider URLs to their embed form,
// sandboxes every iframe, and falls back to the designed link card rather than
// a blank frame. This surface adds no URL handling of its own; the one link it
// owns ("Open in new tab") is gated by `isSafeUrl` and renders only when the
// row actually has a safe URL.
//
// NO SHARE BUTTON. The artboard's bar has one (resource-wall.jsx:542) backed by
// a forgeable token + a fake viewer; sharing is Wave 9b (owner-deferred). It is
// omitted rather than stubbed — a disabled/placeholder share implies a promise.
//
// Portal + focus-trap + scroll-lock + Escape + backdrop-click mechanics mirror
// components/catchup-v2/CatchUpModal (which mirrors year-v2/ExplorerShell) —
// copied so this file stays self-contained, per that file's own note.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ResourceEmbed } from "@/components/resources";
import { Button, Tooltip } from "@/components/ui";
import { isSafeUrl } from "@/lib/resource-embed";
import { stripHtml } from "@/lib/html-text";
import { wallTypeOf, type WallItem, type WallType } from "@/lib/wall-scope";
import { Annotator } from "./Annotator";
import styles from "./Lightbox.module.css";

// ── Icons ────────────────────────────────────────────────────────────────────

const IconClose = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconPrev = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const IconNext = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);
const IconPen = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 19l3-1L19 7a2 2 0 0 0-3-3L5 15l-1 3 1 1Z" />
  </svg>
);
const IconOpen = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14L21 3" />
  </svg>
);
const IconBoard = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M12 17v4M8 21h8" />
  </svg>
);

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[contenteditable="true"]',
  "[tabindex]",
]
  .map((clause) => `${clause}:not([tabindex="-1"])`)
  .join(", ");

/** Stable annotation identity for a card: the persisted row id when it has one,
 *  else its URL, else its wall key. */
function annotationIdFor(item: WallItem): string {
  return item.resource.resourceId ?? item.resource.url ?? item.key;
}

/** Uppercase family word for the fallback panel — mirrors the card face. */
const KIND_WORD: Record<WallType, string> = {
  note: "Note",
  worksheet: "PDF",
  image: "Image",
  doc: "Document",
  video: "Video",
  link: "Link",
};

/**
 * ResourceEmbed only renders visible content when the row has a URL — a url-less
 * legacy row yields an invisible marker, which left the stage empty (the viewer
 * read as broken, and the annotation canvas collapsed to 0 height). ResourceEmbed's
 * contract makes the CALLER responsible for the no-URL case, so this is that
 * fallback: a designed placeholder in the card-face idiom (glyph · label · type ·
 * a line of copy) so the viewer always shows something. A notecard carries its
 * own written body rather than an embed, so it shows that (sanitized to text)
 * instead of "no preview". Annotation stays available over this surface — a
 * teacher may still want to mark up the slot while teaching.
 */
function NoPreview({ item }: { item: WallItem }): ReactNode {
  const kind = wallTypeOf(item.resource);
  const noteBody =
    kind === "note" && item.resource.body
      ? stripHtml(item.resource.body).trim()
      : "";

  if (noteBody) {
    return <div className={styles.noPreviewNote}>{noteBody}</div>;
  }
  return (
    <div className={styles.noPreview} role="note">
      <span className={styles.noPreviewGlyph} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      </span>
      <div className={styles.noPreviewTitle}>{item.label}</div>
      <div className={styles.noPreviewKind}>{KIND_WORD[kind]}</div>
      <p className={styles.noPreviewCopy}>
        No preview available for this resource.
      </p>
    </div>
  );
}

/** True when ResourceEmbed will paint visible content (it only does with a URL);
 *  false routes the stage to {@link NoPreview}. A notecard has no URL but has a
 *  body, so NoPreview handles it too. */
function hasEmbeddableMedia(item: WallItem): boolean {
  return !!item.resource.url?.trim();
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface LightboxProps {
  /** The deck. In "enlarge" mode this is a single card. */
  slides: WallItem[];
  /** Index of the visible card within `slides`. */
  index: number;
  onIndexChange: (next: number) => void;
  /** "enlarge" drops the deck chrome (counter + arrows). Default "slideshow". */
  mode?: "slideshow" | "enlarge";
  onClose: () => void;
  onBoard: (item: WallItem, fromLessonId?: string) => void;
  /** Phone — view-only: no annotation affordance (viewing is still fine). */
  readOnly: boolean;
}

export function Lightbox({
  slides,
  index,
  onIndexChange,
  mode = "slideshow",
  onClose,
  onBoard,
  readOnly,
}: LightboxProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [annotating, setAnnotating] = useState(false);

  // Mount gate — the portal appears only after the first client paint, so an
  // SSR'd-open lightbox can never mismatch hydration (the CatchUpModal rule).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Clamp defensively: the deck can shrink under us (a card deleted elsewhere).
  const safeIndex = Math.min(
    Math.max(index, 0),
    Math.max(slides.length - 1, 0),
  );
  const item: WallItem | undefined = slides[safeIndex];
  const isDeck = mode === "slideshow" && slides.length > 1;

  const goPrev = useCallback(
    () => onIndexChange(Math.max(0, safeIndex - 1)),
    [onIndexChange, safeIndex],
  );
  const goNext = useCallback(
    () => onIndexChange(Math.min(slides.length - 1, safeIndex + 1)),
    [onIndexChange, safeIndex, slides.length],
  );

  // A phone must never be left in an annotating state (view-only).
  useEffect(() => {
    if (readOnly) setAnnotating(false);
  }, [readOnly]);

  // ── Escape closes; arrows walk the deck ───────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // Escape backs out of annotating first, then closes — otherwise the
        // teacher loses the whole viewer when they only meant to stop drawing.
        if (annotating) setAnnotating(false);
        else onClose();
        return;
      }
      if (!isDeck) return;
      // Don't hijack arrows while the teacher is typing (annotation text tool).
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotating, isDeck, goNext, goPrev, onClose]);

  // ── Focus in, restore on close, lock body scroll ──────────────────────────
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    let cancelled = false;
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const panel = panelRef.current;
        if (!panel || panel.contains(document.activeElement)) return;
        panel.querySelector<HTMLElement>("[data-lb-close]")?.focus();
      });
    });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  // ── Focus trap ────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  if (!mounted || typeof document === "undefined") return null;
  if (!item) return null;

  const openUrl = isSafeUrl(item.resource.url) ? item.resource.url : null;

  return createPortal(
    <div
      className={`${styles.scrim} rw-lb-scrim`}
      onClick={(e) => {
        // Never close from a stray click that started on the canvas/toolbar.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        title="Resource viewer — page through the deck, annotate, or send to a board"
        className={`${styles.frame} rw-lb-frame`}
        data-mode={mode}
        onKeyDown={handleKeyDown}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className={styles.top}>
          <span id={titleId} className={styles.title}>
            {item.label}
          </span>
          {isDeck && (
            <span className={styles.count} aria-live="polite">
              {safeIndex + 1} of {slides.length}
            </span>
          )}
          <Button
            variant="icon"
            size="sm"
            data-lb-close
            className={styles.close}
            iconAriaLabel="Close the viewer"
            onClick={onClose}
          >
            <IconClose />
          </Button>
        </div>

        {/* ── Stage ─────────────────────────────────────────────────────── */}
        <div className={styles.stage}>
          {isDeck && safeIndex > 0 && (
            <Button
              variant="icon"
              size="sm"
              className={`${styles.nav} ${styles.navPrev}`}
              iconAriaLabel="Previous resource"
              onClick={goPrev}
            >
              <IconPrev />
            </Button>
          )}

          {/* The media box is the annotator's positioned parent — ink is locked
              to the RESOURCE, not the frame, so it lines up at every size. A
              min-height floor (see the CSS module) guarantees the stage AND the
              annotation canvas always have room, even for a short link card or
              the url-less fallback. */}
          <div className={styles.media}>
            {hasEmbeddableMedia(item) ? (
              <ResourceEmbed resource={item.resource} variant="tile" />
            ) : (
              <NoPreview item={item} />
            )}
            {annotating && !readOnly && (
              <Annotator
                // Remount per card: ink is scoped to one resource, and a fresh
                // key guarantees no stroke bleeds across a slide change.
                key={annotationIdFor(item)}
                lessonId={item.lessonId}
                resourceId={annotationIdFor(item)}
              />
            )}
          </div>

          {isDeck && safeIndex < slides.length - 1 && (
            <Button
              variant="icon"
              size="sm"
              className={`${styles.nav} ${styles.navNext}`}
              iconAriaLabel="Next resource"
              onClick={goNext}
            >
              <IconNext />
            </Button>
          )}
        </div>

        {/* ── Bar ───────────────────────────────────────────────────────── */}
        <div className={styles.bar}>
          {!readOnly && (
            <Tooltip
              content="Draw on top of this resource while you teach — marks are never saved"
              tooltipId="rw-lb-annotate"
              side="top"
            >
              <Button
                variant={annotating ? "primary" : "secondary"}
                size="sm"
                leadingIcon={<IconPen />}
                aria-pressed={annotating}
                onClick={() => setAnnotating((v) => !v)}
              >
                {annotating ? "Stop annotating" : "Annotate"}
              </Button>
            </Tooltip>
          )}

          {openUrl && (
            <Tooltip
              content="Open the original in a new browser tab"
              tooltipId="rw-lb-newtab"
              side="top"
            >
              <a
                className={styles.link}
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconOpen />
                <span>Open in new tab</span>
              </a>
            </Tooltip>
          )}

          {!readOnly && (
            <Tooltip
              content="Put this resource on a teaching board, ready to project"
              tooltipId="rw-lb-board"
              side="top"
            >
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<IconBoard />}
                onClick={() => onBoard(item, item.lessonId)}
              >
                Send to Teaching Board
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>,
    document.querySelector(".cp-root") ?? document.body,
  );
}
