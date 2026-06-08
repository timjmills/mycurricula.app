"use client";

// components/resources/ResourcePreview.tsx — the universal "click → enlarge"
// modal for ANY resource, opened from the Daily/Weekly Resources panel.
//
// ImageLightbox only ever handled images; everything else (PDF, slides,
// video, Google embeds, links) had no enlarge path at all — clicking a
// tile did nothing or, in list mode, opened a fabricated URL. This modal
// is the one place a teacher gets a big, readable preview of every kind:
//
//   • image                     → fit-to-screen <img>
//   • youtube / vimeo / gslides
//     / gdocs / gsheets / gdrive
//     / pdf                     → large sandboxed <iframe> (via parseResourceUrl)
//   • video / audio             → native player
//   • website / link            → OG-style card + "Open in new tab"
//                                 (arbitrary sites refuse to frame, so we
//                                  never trap the teacher in a blank iframe)
//   • no url / unknown          → honest "no preview" fallback
//
// Chrome (CLAUDE.md §4): all color/radii/type via tokens; no hard-coded
// hex except the dark backdrop (mirrors ImageLightbox). A11y: role=dialog +
// aria-modal, Esc + backdrop close, focus moves in on open and is restored
// to the trigger on close, and fade respects prefers-reduced-motion.

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import type { LessonResource } from "@/lib/types";
import { parseResourceUrl } from "@/lib/resource-embed";
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

export function ResourcePreview({
  resource,
  onClose,
}: ResourcePreviewProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc to close + focus management: move focus into the dialog on open and
  // restore it to whatever held focus (the trigger tile) on close.
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

  const kind = previewKindFor(resource);
  const url = resource.url;
  const isHttp = !!url && /^https?:\/\//i.test(url);
  const isBlob = !!url && url.startsWith("blob:");
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
        aria-label={`Preview: ${title}`}
        className={styles.dialog}
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
            {isHttp && (
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
            {isBlob && (
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

        {/* ── Body: kind-switched large preview ─────────────────────────── */}
        <div className={styles.body}>
          <PreviewBody kind={kind} resource={resource} />
        </div>
      </div>
    </div>
  );
}

// ── Body renderer ──────────────────────────────────────────────────────────

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
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={resource.label} className={styles.image} />
    );
  }

  if (kind === "video" && url) {
    return (
      <video
        src={url}
        controls
        autoPlay={false}
        preload="metadata"
        className={styles.video}
        aria-label={resource.label}
      />
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
    // Rewrite watch/edit/view URLs to their embeddable form (e.g. YouTube
    // /watch → /embed, Google /edit → /preview); fall back to the raw url.
    const embedUrl = parseResourceUrl(url).embedUrl ?? url;
    return (
      <div className={styles.frame}>
        <iframe
          src={embedUrl}
          title={resource.label}
          className={styles.iframe}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
        />
      </div>
    );
  }

  if (kind === "link" && url) {
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

/** True only for http(s) and blob: URLs — the schemes safe to place in an
 *  <iframe>/<img>/<video> src or an <a href>. Guards against javascript:,
 *  data:, and other dangerous schemes regardless of upstream validation. */
function isSafeUrl(url: string | undefined): url is string {
  return !!url && /^(https?|blob):/i.test(url);
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
