"use client";

// components/resources/ResourcePreview.tsx — the universal "click → enlarge"
// modal for ANY resource, opened from the Daily/Weekly Resources panel.
//
// ImageLightbox only ever handled images; everything else (PDF, slides,
// video, Google embeds, links) had no enlarge path at all — clicking a
// tile did nothing or, in list mode, opened a fabricated URL. This modal
// is the one place a teacher gets a big, readable preview of every kind:
//
//   • notecard / any card           → SPLIT view: media carousel LEFT, the
//     with a gallery and/or notes      sanitized rich-text notes RIGHT
//                                      (the NotecardFullscreen layout, hosted
//                                      inline here so every enlarge path is
//                                      one modal). A single gallery item can be
//                                      enlarged further into the normal
//                                      single-media preview below.
//   • image                         → fit-to-screen <img>
//   • youtube / vimeo / gslides
//     / gdocs / gsheets / gdrive
//     / pdf                         → large sandboxed <iframe> (via parseResourceUrl)
//   • video / audio                 → native player
//   • website / link                → OG-style card + "Open in new tab"
//                                     (arbitrary sites refuse to frame, so we
//                                      never trap the teacher in a blank iframe)
//   • no url / unknown              → honest "no preview" fallback
//
// LIVE ANNOTATION (Ultraplan §3): the visual media kinds (image, iframe/PDF,
// video, and a notecard's gallery) are wrapped in <PreviewAnnotation>, which
// overlays a toggleable draw/highlight/erase layer. That ink is SCRATCH — it is
// wiped when the modal closes and never persists (board annotation is a
// separate, persistent path). Link/no-preview bodies have nothing to draw on,
// so they skip the wrapper.
//
// Chrome (CLAUDE.md §4): all color/radii/type via tokens; no hard-coded
// hex except the dark backdrop (mirrors ImageLightbox). A11y: role=dialog +
// aria-modal, Esc + backdrop close, focus moves in on open and is restored
// to the trigger on close, and fade respects prefers-reduced-motion. The
// notes body is re-sanitized via sanitizeHtml() at inject (stored XSS under
// the forking model — a teammate's notecard reaches this screen).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LessonResource } from "@/lib/types";
import { parseResourceUrl } from "@/lib/resource-embed";
import { galleryItems, hasNotes, isNotecard } from "@/lib/notecards";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Gallery } from "@/components/notecards";
import { PreviewAnnotation } from "./PreviewAnnotation";
import styles from "./ResourcePreview.module.css";

export interface ResourcePreviewProps {
  /** The resource to enlarge. */
  resource: LessonResource;
  /** Close the modal (Esc, backdrop click, × button). */
  onClose: () => void;
}

/** Coarse preview surface for a resource — drives the body branch. */
type PreviewKind = "image" | "iframe" | "video" | "audio" | "link" | "none";

function previewKindFor(resource: LessonResource): PreviewKind {
  if (!resource.url) return "none";
  // Prefer the stored provider; fall back to deriving it from the URL so a
  // legacy row with a url but no provider still previews correctly.
  const provider = resource.provider ?? parseResourceUrl(resource.url).provider;
  switch (provider) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "youtube":
    case "vimeo":
    case "gslides":
    case "gdocs":
    case "gsheets":
    case "gdrive":
    case "pdf":
      return "iframe";
    case "website":
    default:
      return "link";
  }
}

/** A resource is shown in the split notecard layout when it is a dedicated
 *  notecard, OR it carries an explicit multi-item gallery, OR it has notes.
 *  A plain single-media resource (image/pdf/etc. with no gallery and no notes)
 *  keeps the existing single-pane enlarge. */
function isSplitCard(resource: LessonResource): boolean {
  if (isNotecard(resource)) return true;
  if (hasNotes(resource)) return true;
  return (resource.gallery?.length ?? 0) > 1;
}

export function ResourcePreview({
  resource,
  onClose,
}: ResourcePreviewProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // A single gallery item the teacher chose to enlarge further (from the split
  // view's carousel). When set we mount a NESTED single-media ResourcePreview on
  // top so the item gets the normal fit-to-screen / native-player treatment.
  const [enlargedItem, setEnlargedItem] = useState<LessonResource | null>(null);
  // Ref mirror so the document-level Escape handler reads the latest value
  // without re-subscribing on every enlarge toggle.
  const enlargedItemRef = useRef<LessonResource | null>(null);
  enlargedItemRef.current = enlargedItem;

  // Esc to close + focus management: move focus into the dialog on open and
  // restore it to whatever held focus (the trigger tile) on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // When a NESTED single-item preview is open, that child owns Escape —
      // its own (later-registered) handler closes it. Both handlers fire on
      // `document`, and stopPropagation doesn't stop sibling document
      // listeners, so we instead no-op here while a child is up to avoid
      // closing both at once.
      if (enlargedItemRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [onClose]);

  const split = isSplitCard(resource);
  const kind = previewKindFor(resource);
  const url = resource.url;
  const isBlob = !!url && url.startsWith("blob:");
  // "Open in new tab" is offered for any safe non-blob URL — http(s) links
  // AND hosted files served via the root-relative /api/resources/{id}. It is
  // meaningless for the split-card view (whose body is a gallery), so it's
  // gated on a single-media body.
  const canOpenInTab = !split && isSafeUrl(url) && !isBlob;
  const title = resource.label || resource.type;

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
        aria-label={split ? `Notecard: ${title}` : `Preview: ${title}`}
        className={`${styles.dialog} ${split ? styles.dialogSplit : ""}`}
      >
        {/* ── Header: title + type · open · download · close ─────────────── */}
        <header className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.title} title={title}>
              {title}
            </span>
            <span className={styles.typePill}>{resource.type}</span>
          </div>
          <div className={styles.actions}>
            {canOpenInTab && url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.actionBtn}
                title="Open this resource in a new browser tab"
              >
                Open in new tab
              </a>
            )}
            {!split && isBlob && url && (
              <a
                href={url}
                download={resource.label || "resource"}
                className={styles.actionBtn}
                title="Download this file to your device"
              >
                Download
              </a>
            )}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close preview"
              title="Close preview"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* ── Body: split notecard layout OR a kind-switched single preview ─ */}
        {split ? (
          <SplitBody resource={resource} onEnlargeItem={setEnlargedItem} />
        ) : (
          <div className={styles.body}>
            <PreviewBody kind={kind} resource={resource} />
          </div>
        )}
      </div>

      {/* Nested single-item enlarge — opened from the split view's carousel.
          Reuses this same modal so a gallery image/PDF/video gets the normal
          fit-to-screen + annotation treatment, stacked above the split view. */}
      {enlargedItem && (
        <ResourcePreview
          resource={enlargedItem}
          onClose={() => setEnlargedItem(null)}
        />
      )}
    </div>
  );
}

// ── Split notecard body ──────────────────────────────────────────────────────
// Media carousel LEFT (annotatable), sanitized rich-text notes RIGHT. Mirrors
// NotecardFullscreen's layout but lives inside this modal so every enlarge path
// is one dialog. On phone the two panes stack (handled in the CSS module).

function SplitBody({
  resource,
  onEnlargeItem,
}: {
  resource: LessonResource;
  onEnlargeItem: (item: LessonResource) => void;
}): ReactNode {
  const items = galleryItems(resource);
  const showNotes = hasNotes(resource);

  // Re-sanitize the notes HTML at inject (stored XSS — a teammate's notecard
  // reaches this screen under the forking model). Memoized on the source body.
  const safeBody = useMemo(
    () => sanitizeHtml(resource.body ?? ""),
    [resource.body],
  );

  return (
    <div className={styles.split}>
      <section className={styles.mediaPane} aria-label="Media">
        {items.length > 0 ? (
          // The carousel is annotatable scratch glass; a click on the current
          // item (onEnlarge) opens it in the nested single-media preview.
          <PreviewAnnotation className={styles.mediaAnnotate}>
            <Gallery
              items={items}
              onEnlarge={(index) =>
                // Enlarge as SINGLE media — strip notes/gallery so the nested
                // preview is never itself a split card. Without this, a notes-
                // only resource (whose galleryItems is [itself]) would reopen the
                // same split view on every enlarge click, stacking modals (L1).
                onEnlargeItem({
                  ...items[index],
                  body: undefined,
                  gallery: undefined,
                })
              }
              className={styles.carousel}
            />
          </PreviewAnnotation>
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
  );
}

// ── Single-media body renderer ───────────────────────────────────────────────

function PreviewBody({
  kind,
  resource,
}: {
  kind: PreviewKind;
  resource: LessonResource;
}): ReactNode {
  // Defense-in-depth: only ever feed an http(s)/blob URL into an
  // <iframe>/<img>/<video>/<a> here. Anything else (javascript:, data:, …)
  // is dropped → the branches below all gate on `url`, so an unsafe scheme
  // falls through to the honest "no preview" fallback instead of executing.
  const url = isSafeUrl(resource.url) ? resource.url : undefined;

  if (kind === "image" && url) {
    return (
      <PreviewAnnotation>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={resource.label} className={styles.image} />
      </PreviewAnnotation>
    );
  }

  if (kind === "video" && url) {
    return (
      <PreviewAnnotation>
        <video
          src={url}
          controls
          autoPlay={false}
          preload="metadata"
          className={styles.video}
          aria-label={resource.label}
        />
      </PreviewAnnotation>
    );
  }

  if (kind === "audio" && url) {
    return (
      <div className={styles.audioWrap}>
        <audio
          src={url}
          controls
          preload="metadata"
          className={styles.audio}
          aria-label={resource.label}
        />
      </div>
    );
  }

  if (kind === "iframe" && url) {
    // Only ever frame a resource we can vouch for: either a recognized provider
    // produced a real embeddable URL (trusted host — YouTube/Vimeo/Google), OR
    // it is our OWN same-origin hosted file (root-relative /api/resources/{id},
    // e.g. a PDF). An attacker-authored row (forking model) can claim
    // provider:"youtube" while pointing url at an arbitrary cross-origin site;
    // parseResourceUrl yields no embedUrl for it, so we must NOT fall back to
    // framing the raw url with allow-scripts allow-same-origin (M2). Untrusted
    // rows fall through to the safe link card below instead of being framed.
    const embedUrl = parseResourceUrl(url).embedUrl;
    const rootRelative = /^\/(?![/\\])/.test(url);
    const frameSrc = embedUrl ?? (rootRelative ? url : null);
    if (frameSrc) {
      return (
        <PreviewAnnotation className={styles.frameAnnotate}>
          <div className={styles.frame}>
            <iframe
              src={frameSrc}
              title={resource.label}
              className={styles.iframe}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            />
          </div>
        </PreviewAnnotation>
      );
    }
    // No trusted embed + not same-origin → don't frame it; fall through to the
    // link card (a deliberate "Open in new tab" beats auto-loading an untrusted
    // origin in a script-enabled frame).
  }

  if ((kind === "link" || kind === "iframe") && url) {
    // Arbitrary sites set X-Frame-Options / frame-ancestors and refuse to
    // load in an iframe, so we never trap the teacher in a blank frame —
    // we show an OG-style card and a clear "Open in new tab" action.
    return (
      <div className={styles.linkCard}>
        {resource.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.thumbnailUrl}
            alt=""
            className={styles.linkThumb}
          />
        ) : (
          <span className={styles.linkThumbFallback} aria-hidden="true">
            <GlobeIcon />
          </span>
        )}
        <span className={styles.linkTitle}>
          {resource.previewTitle || resource.label}
        </span>
        {resource.previewDescription ? (
          <span className={styles.linkDesc}>{resource.previewDescription}</span>
        ) : null}
        <span className={styles.linkDomain}>{safeHost(url)}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.openBtn}
        >
          Open in new tab
        </a>
      </div>
    );
  }

  // No url / unknown — honest fallback rather than a blank panel.
  return (
    <div className={styles.fallback}>
      <GlobeIcon />
      <p className={styles.fallbackText}>
        No preview is available for this resource yet.
      </p>
    </div>
  );
}

/** True for http(s), blob:, and same-origin root-relative ("/…") URLs — the
 *  schemes safe to place in an <iframe>/<img>/<video> src or an <a href>.
 *  Root-relative is allowed for hosted files served via /api/resources/{id};
 *  protocol-relative "//host" is rejected. Blocks javascript:, data:, etc. */
function isSafeUrl(url: string | undefined): url is string {
  if (!url) return false;
  if (/^(https?|blob):/i.test(url)) return true;
  // Same-origin root-relative path (e.g. /api/resources/{id}). Reject
  // protocol-relative ("//host") and backslash tricks ("/\host") that
  // browsers normalize to a foreign origin.
  return /^\/(?![/\\])/.test(url);
}

function safeHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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

function GlobeIcon(): ReactNode {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
