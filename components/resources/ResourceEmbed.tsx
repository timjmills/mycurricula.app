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
//
// EMBED AUTHORITY (6.12.26 redesign P5): the iframe-vs-fallback decision is
// routed through `canEmbedResource()` in lib/resource-embed — the SINGLE
// predicate shared with ResourcePreview. When it says no, the designed
// link card (`ResourceLinkCard`, the §5 `.rn-linkCard` recipe) renders
// instead — never a blank refused-to-connect iframe, never a raw URL dump.

import type { ReactNode, MouseEvent } from "react";
import { useState } from "react";
import type { LessonResource, ResourceProvider } from "@/lib/types";
import {
  canEmbedResource,
  embedDenialReason,
  parseResourceUrl,
} from "@/lib/resource-embed";
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
  const { url, displayMode = "thumbnail" } = resource;

  // Legacy fixture row — no URL. Caller decides what to render in this
  // case; we surface a tiny invisible marker so a wrong call here is
  // visible in dev (CSS toggles it on with a data attribute).
  if (!url) {
    return <span className={styles.legacyMarker} aria-hidden="true" />;
  }

  switch (effectiveProvider(resource)) {
    case "youtube":
    case "vimeo":
    case "gslides":
    case "gdocs":
    case "gsheets":
    case "gdrive":
    case "pdf":
      // P5 — the single embed authority. A row whose provider claims an
      // embeddable host but whose URL does not actually yield a trusted
      // embed target (crafted/imported rows, session blob: files) gets the
      // designed link card, NEVER a blank iframe. ResourcePreview consults
      // the same predicate, so both surfaces always agree.
      if (!canEmbedResource(resource)) {
        return <ResourceLinkCard resource={resource} variant={variant} />;
      }
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
      // Teacher-chosen inline text renderings of a plain link keep working —
      // literal/hyperlink are deliberate display modes, not embed fallbacks.
      if (displayMode === "literal" || displayMode === "hyperlink") {
        return <LinkEmbed resource={resource} displayMode={displayMode} />;
      }
      // The "website" taxonomy can never embed (canEmbedResource() is false
      // for it by construction) → the designed link card.
      return <ResourceLinkCard resource={resource} variant={variant} />;
  }
}

/** Resolve the render branch for a row. The stored provider wins unless it
 *  is missing or the generic "website" (legacy rows; hosted uploads), in
 *  which case the mime type, then the URL, decide — the same taxonomy
 *  `canEmbedResource()` uses internally, so the chosen branch and the embed
 *  predicate can never disagree. Shared with ResourcePreview (the other P5
 *  surface) via a folder-internal import. */
export function effectiveProvider(resource: LessonResource): ResourceProvider {
  const stored = resource.provider;
  if (stored && stored !== "website") return stored;
  const mime = resource.mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return resource.url ? parseResourceUrl(resource.url).provider : "website";
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
  const rawSrc = parsed?.embedUrl ?? resource.url ?? "";
  // Defense-in-depth: never point the iframe at a non-http(s)/blob scheme
  // (javascript:, data:, …). Unreachable via normal input today (the composer
  // forces provider="website" for any non-http scheme and parseResourceUrl
  // only embeds http(s)), but a crafted/imported row must not get a
  // script-capable frame. about:blank renders inert.
  const src = isSafeUrl(rawSrc) ? rawSrc : "about:blank";
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
  // §4a review L7 — gate the chosen <img> src through the same isSafeUrl the
  // iframe/link branches use. A crafted/imported row can carry a javascript:/
  // data:text/protocol-relative value in thumbnailUrl or url; an unsafe pick
  // never reaches an <img> — the row falls through to the designed link card
  // (whose own thumb/href gates re-vet everything they render).
  const src = resource.thumbnailUrl ?? resource.url;
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick();
      return;
    }
    e.preventDefault();
    setLightboxOpen(true);
  };
  if (!isSafeUrl(src)) {
    return <ResourceLinkCard resource={resource} variant={variant} />;
  }
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
          src={src}
          alt={resource.label}
          loading="lazy"
          className={styles.image}
        />
      </button>
      {lightboxOpen && isSafeUrl(resource.url) && (
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

// ── Link (inline text display modes) ──────────────────────────────────────

function LinkEmbed({
  resource,
  displayMode,
}: {
  resource: LessonResource;
  displayMode: "literal" | "hyperlink";
}): ReactNode {
  // Only expose an anchor target for safe schemes; a dangerous scheme
  // (javascript:, data:, …) yields an inert anchor (no href / no navigation).
  const safeHref = isSafeUrl(resource.url) ? resource.url : undefined;
  if (displayMode === "literal") {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.literal}
      >
        {resource.url}
      </a>
    );
  }
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.hyperlink}
    >
      {resource.linkText || resource.label}
    </a>
  );
}

// ── Designed link-card fallback (P5 — the §5 `.rn-linkCard` recipe) ───────

export interface ResourceLinkCardProps {
  resource: LessonResource;
  /** tile / card — the vertical designed card; row — compact 44px row;
   *  preview — the ResourcePreview pane variant (static card with an
   *  explicit Open button instead of a whole-card anchor). */
  variant?: "tile" | "row" | "card" | "preview";
}

/**
 * The ONE designed render for a resource that cannot embed: 120px
 * `--ink-100` thumb area (OG thumbnail when present + safe, globe glyph
 * otherwise), bold title, optional OG description, and a domain row with a
 * favicon-initial. Folder-internal — ResourcePreview reuses it so the
 * fallback looks identical on every surface.
 */
export function ResourceLinkCard({
  resource,
  variant = "tile",
}: ResourceLinkCardProps): ReactNode {
  const url = resource.url;
  // Mirror the Resources panel's openResource guard — only a real http(s)
  // target ever opens in a new tab; blob:/hosted/unsafe rows render inert.
  const href = url && /^https?:\/\//i.test(url) ? url : undefined;
  const domain = safeHost(url);
  const thumb = isSafeUrl(resource.thumbnailUrl)
    ? resource.thumbnailUrl
    : undefined;
  // Quiet caption only for the "this site just won't frame" case — unsafe
  // schemes and missing URLs stay captionless (nothing actionable to say).
  const showCaption = embedDenialReason(resource) === "not-embeddable";

  const body = (
    <>
      <span className={styles.linkThumb} aria-hidden="true">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className={styles.linkThumbImg}
          />
        ) : (
          <GlobeIcon />
        )}
      </span>
      <span className={styles.linkBody}>
        <span className={styles.linkTitle}>
          {resource.previewTitle || resource.label}
        </span>
        {resource.previewDescription ? (
          <span className={styles.linkDesc}>{resource.previewDescription}</span>
        ) : null}
        {domain ? (
          <span className={styles.linkDomain}>
            <span className={styles.linkFavicon} aria-hidden="true">
              {domain.charAt(0).toUpperCase()}
            </span>
            <span className={styles.linkDomainText}>{domain}</span>
            {variant === "preview" && href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkOpen}
              >
                Open <OpenIcon />
              </a>
            ) : null}
          </span>
        ) : null}
        {showCaption ? (
          <span className={styles.linkCaption}>
            This site can&apos;t be embedded — open it directly
          </span>
        ) : null}
      </span>
    </>
  );

  const className = [styles.linkCard, styles[`v_${variant}`]]
    .filter(Boolean)
    .join(" ");

  // tile / row / card: the whole card is the open-in-new-tab anchor.
  // preview: a static card — the explicit Open button above carries the
  // action (nested anchors are invalid HTML).
  if (variant !== "preview" && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {body}
      </a>
    );
  }
  return <span className={className}>{body}</span>;
}

/** True for http(s), blob:, and same-origin root-relative ("/…") URLs — the
 *  schemes safe to feed into an <iframe> src or an <a href>. Root-relative is
 *  allowed for hosted files served via /api/resources/{id}; protocol-relative
 *  "//host" is rejected (it resolves to a foreign origin). Blocks javascript:,
 *  data:, and other dangerous schemes regardless of upstream validation. */
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

// ── Icons (Lucide-family line icons, per the §5 artboards) ─────────────────

function GlobeIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function OpenIcon(): ReactNode {
  return (
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
}
