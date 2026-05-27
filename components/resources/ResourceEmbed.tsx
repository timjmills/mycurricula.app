"use client";

// components/resources/ResourceEmbed.tsx
//
// The single kind-switched renderer for every resource. Used by:
//   • components/lesson-flow/resource-tile.tsx       (section thumbnails)
//   • components/lesson-flow/section-resources.tsx   (primary 2x2 + lists)
//   • components/subject/ResourcesSort.tsx           (all-resources table)
//   • components/daily/ResourceComposer.tsx          (capture-strip preview)
//
// The component does NOT call /api/og-preview itself — OG enrichment
// happens once at link-creation time on the server (the POST /api/resources
// route dogfoods the OG-preview route). The row arrives here with
// preview_title/_description/_thumbnail_url already set.
//
// Caller contract: pass `resource.url`. When the URL is absent, this
// component renders a hidden marker — that's how the section-resources /
// resource-tile callers keep their legacy synthetic-glyph branches working.

import type { ReactNode, MouseEvent } from "react";
import { useState } from "react";
import type { LessonResource } from "@/lib/types";
import { parseResourceUrl } from "@/lib/resource-embed";
import { ImageLightbox } from "./ImageLightbox";
import styles from "./ResourceEmbed.module.css";

export interface ResourceEmbedProps {
  resource: LessonResource;
  /** Visual variant.
   *   tile  — 16:9 thumbnail (default; used in PrimaryCard + section grids).
   *   row   — compact inline row (used in ResourcesSort).
   *   card  — OG-style preview card (used for thumbnail-mode links). */
  variant?: "tile" | "row" | "card";
  /** Optional click handler that supersedes the default behavior
   *  (e.g. the composer's "open in lightbox" preview overrides). */
  onClick?: () => void;
}

export function ResourceEmbed({
  resource,
  variant = "tile",
  onClick,
}: ResourceEmbedProps): ReactNode {
  const { url, provider, displayMode = "thumbnail" } = resource;

  // Legacy fixture row — no URL. Caller decides what to render in this
  // case; we surface a tiny invisible marker so a wrong call here is
  // visible in dev (CSS toggles it on with a data attribute).
  if (!url) {
    return <span className={styles.legacyMarker} aria-hidden="true" />;
  }

  switch (provider) {
    case "youtube":
    case "vimeo":
    case "gslides":
    case "gdocs":
    case "gsheets":
    case "gdrive":
    case "pdf":
      return <IframeEmbed resource={resource} variant={variant} />;
    case "image":
      return (
        <ImageEmbed resource={resource} variant={variant} onClick={onClick} />
      );
    case "video":
      return <VideoEmbed resource={resource} />;
    case "audio":
      return <AudioEmbed resource={resource} />;
    case "website":
    default:
      return (
        <LinkEmbed
          resource={resource}
          displayMode={displayMode}
          variant={variant}
        />
      );
  }
}

// ── Iframe variants (YouTube / Vimeo / Google / hosted PDF) ───────────────

function IframeEmbed({
  resource,
  variant,
}: {
  resource: LessonResource;
  variant: "tile" | "row" | "card";
}): ReactNode {
  // The sandbox allowlist is the minimum each allowed provider needs to
  // render a working player / preview. We intentionally do not allow
  // allow-top-navigation or allow-forms — there's no use-case here for
  // those, and disallowing them limits the blast radius if a provider's
  // embed ever turned hostile.
  //
  // Always run resource.url through parseResourceUrl() so providers that
  // ship a non-embeddable canonical URL (YouTube watch page, Vimeo
  // /<id>, Google Slides /edit, Drive /view, Google Doc/Sheet /edit) get
  // rewritten to their /embed or /preview form. Without this the iframe
  // src points at the watch page which sets X-Frame-Options: sameorigin
  // and refuses to load.
  const parsed = resource.url ? parseResourceUrl(resource.url) : null;
  const src = parsed?.embedUrl ?? resource.url ?? "";
  return (
    <div className={[styles.aspect, styles[`v_${variant}`]].join(" ")}>
      <iframe
        src={src}
        title={resource.label}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
        className={styles.iframe}
      />
    </div>
  );
}

// ── Image (click → lightbox) ──────────────────────────────────────────────

function ImageEmbed({
  resource,
  variant,
  onClick,
}: {
  resource: LessonResource;
  variant: "tile" | "row" | "card";
  onClick?: () => void;
}): ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick();
      return;
    }
    e.preventDefault();
    setLightboxOpen(true);
  };
  return (
    <>
      <button
        type="button"
        className={[styles.imageBtn, styles[`v_${variant}`]].join(" ")}
        onClick={handleClick}
        aria-label={`Open image: ${resource.label}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resource.thumbnailUrl ?? resource.url}
          alt={resource.label}
          loading="lazy"
          className={styles.image}
        />
      </button>
      {lightboxOpen && resource.url && (
        <ImageLightbox
          src={resource.url}
          alt={resource.label}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ── Native video / audio ──────────────────────────────────────────────────

function VideoEmbed({ resource }: { resource: LessonResource }): ReactNode {
  return (
    <div className={styles.aspect}>
      <video
        src={resource.url}
        controls
        preload="metadata"
        className={styles.media}
        aria-label={resource.label}
      />
    </div>
  );
}

function AudioEmbed({ resource }: { resource: LessonResource }): ReactNode {
  return (
    <audio
      src={resource.url}
      controls
      preload="metadata"
      className={styles.audio}
      aria-label={resource.label}
    />
  );
}

// ── Link (three display modes + OG card) ──────────────────────────────────

function LinkEmbed({
  resource,
  displayMode,
  variant,
}: {
  resource: LessonResource;
  displayMode: "literal" | "hyperlink" | "thumbnail";
  variant: "tile" | "row" | "card";
}): ReactNode {
  if (displayMode === "literal") {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.literal}
      >
        {resource.url}
      </a>
    );
  }
  if (displayMode === "hyperlink") {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.hyperlink}
      >
        {resource.linkText || resource.label}
      </a>
    );
  }
  // thumbnail (OG card)
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className={[styles.ogCard, styles[`v_${variant}`]].join(" ")}
    >
      {resource.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resource.thumbnailUrl}
          alt=""
          loading="lazy"
          className={styles.ogThumb}
        />
      ) : (
        <span className={styles.ogThumbFallback} aria-hidden="true" />
      )}
      <span className={styles.ogBody}>
        <span className={styles.ogTitle}>
          {resource.previewTitle || resource.label}
        </span>
        {resource.previewDescription ? (
          <span className={styles.ogDesc}>{resource.previewDescription}</span>
        ) : null}
        <span className={styles.ogDomain}>{safeHost(resource.url)}</span>
      </span>
    </a>
  );
}

function safeHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
