"use client";

// components/teach/canvas/BoardCanvasResource.tsx — the full-bleed resource
// renderer for the Teach center (plan §5.1, artboards T3/T4).
//
// Renders a `TeachResource` to fill the board box, branching on
// `boardEffectiveKind` (provider/mime first, then parsed URL kind). Embeds
// reuse the EXACT sandbox/allow strings the rest of the app ships
// (lib/board-embed.ts, lifted from components/resources/ResourceEmbed.tsx).
// Hosted files are always served via `/api/resources/{id}` — never a raw
// presigned URL.
//
// SECURITY (plan §15): we only ever set `src`/`href`; no HTML is injected.
// Every iframe carries referrerPolicy="no-referrer" and a tiered sandbox, and
// never `allow-top-navigation`. A generic link that frame-blocks
// (canEmbed:false) falls back to the "can't display" card instead of a blank
// iframe.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EmptyState, Button } from "@/components/ui";
import { parseResourceUrl, type ParsedResource } from "@/lib/resource-embed";
import {
  BOARD_IFRAME_ALLOW,
  boardCanEmbed,
  boardEffectiveKind,
  boardSandboxFor,
  isSafeBoardUrl,
  resolveBoardSrc,
} from "@/lib/board-embed";
import { isNotecard, notecardPoster } from "@/lib/notecards";
import { toTeachResource } from "@/lib/teach/toTeachResource";
import type { TeachResource } from "@/lib/types";
import styles from "./BoardCanvasResource.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardCanvasResourceProps {
  /** The resource to render full-bleed. */
  resource: TeachResource;
  /** Extra class for the outer frame (e.g. to compose with the annotation
   *  layer's stacking context). */
  className?: string;
}

// How long to wait for an embed/media to signal load before showing the
// timeout fallback (plan §5.1). Reduced-motion-agnostic (it's a content
// fallback, not an animation), but we still respect reduced motion for the
// skeleton shimmer.
const LOAD_TIMEOUT_MS = 6000;

export function BoardCanvasResource({
  resource,
  className,
}: BoardCanvasResourceProps): ReactNode {
  // Notecard on the board (board-inspector fix): a `type:"notecard"` row has
  // no top-level url — only a `gallery` (poster + flip-through media) and/or a
  // rich-text `body`. Without this branch it falls straight to LinkFallback and
  // loses everything. SMALLEST fix: render the notecard's POSTER (gallery[0])
  // as the board tile face by routing the pipeline below through the poster as
  // a TeachResource. The card stays "openable large" because this IS the large
  // canvas; the deferred deeper work is the inline gallery flip-through + the
  // split media|notes layout (the NotecardFullscreen / ResourcePreview view),
  // which needs a trigger wired from TeachWorkspace and lives outside this file.
  // A notes-only notecard (no poster) keeps the LinkFallback "can't display"
  // card. We never recurse: a poster is flat media by the gallery contract, but
  // we still guard against a poster that is itself a notecard.
  const poster = isNotecard(resource) ? notecardPoster(resource) : undefined;
  const renderResource: TeachResource = useMemo(
    () => (poster && !isNotecard(poster) ? toTeachResource(poster) : resource),
    [poster, resource],
  );

  const parsed: ParsedResource | null = useMemo(
    () => (renderResource.url ? parseResourceUrl(renderResource.url) : null),
    [renderResource.url],
  );
  const kind = useMemo(
    () => boardEffectiveKind(renderResource, parsed),
    [renderResource, parsed],
  );
  const src = useMemo(() => resolveBoardSrc(renderResource), [renderResource]);
  const canEmbed = boardCanEmbed(renderResource, parsed, kind);
  // P5 sink gate (board-inspector fix): every media element on the board must
  // re-vet its src through the same scheme rule the planner surfaces use
  // (isSafeBoardUrl IS lib/resource-embed's isSafeUrl, re-exported — one
  // implementation, no drift). resolveBoardSrc is allowed to return any stored
  // url; a protocol-relative / data: / javascript: value must never reach an
  // <iframe>/<img>/<video>/<audio> src — it demotes to the LinkFallback
  // (whose own href is gated below) instead.
  const safeSrc = isSafeBoardUrl(src) ? src : null;

  return (
    <div
      className={[styles.frame, className].filter(Boolean).join(" ")}
      title={`Resource: ${resource.label}`}
    >
      {!safeSrc || !canEmbed ? (
        <LinkFallback resource={resource} />
      ) : kind === "embed" || kind === "pdf" ? (
        <IframeView resource={renderResource} src={safeSrc} />
      ) : kind === "image" ? (
        <ImageView resource={renderResource} src={safeSrc} />
      ) : kind === "video" ? (
        <VideoView resource={renderResource} src={safeSrc} />
      ) : kind === "audio" ? (
        <AudioView resource={renderResource} src={safeSrc} />
      ) : (
        <LinkFallback resource={resource} />
      )}
    </div>
  );
}

// ── Loading state hook (shared skeleton + timeout) ────────────────────────

function useLoadState(deps: unknown): {
  loaded: boolean;
  timedOut: boolean;
  markLoaded: () => void;
} {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Reset whenever the source changes.
  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [deps]);

  return {
    loaded,
    timedOut,
    markLoaded: () => {
      setLoaded(true);
      setTimedOut(false);
    },
  };
}

function Skeleton(): ReactNode {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={styles.skeletonShimmer} />
    </div>
  );
}

// ── Iframe (embeds + browser-native PDF) ──────────────────────────────────

function IframeView({
  resource,
  src,
}: {
  resource: TeachResource;
  src: string;
}): ReactNode {
  const { loaded, timedOut, markLoaded } = useLoadState(src);
  const sandbox = boardSandboxFor(resource.provider);
  // Defense-in-depth (mirrors ResourceEmbed's IframeEmbed): the parent's
  // safeSrc gate means an unsafe scheme can't normally reach here, but a
  // crafted/imported row must never get a script-capable frame even if a
  // future caller wires this view directly. about:blank renders inert.
  const safeSrc = isSafeBoardUrl(src) ? src : "about:blank";

  return (
    <div className={styles.fill}>
      {!loaded && !timedOut ? <Skeleton /> : null}
      {timedOut && !loaded ? (
        <LinkFallback
          resource={resource}
          heading="This is taking a while to load"
          body="The resource may block embedding, or your connection is slow. Open it in a new tab instead."
        />
      ) : null}
      <iframe
        src={safeSrc}
        title={resource.label}
        className={styles.iframe}
        data-loaded={loaded ? "true" : undefined}
        loading="lazy"
        referrerPolicy="no-referrer"
        allow={BOARD_IFRAME_ALLOW}
        sandbox={sandbox}
        onLoad={markLoaded}
      />
    </div>
  );
}

// ── Image (contain, centered) ─────────────────────────────────────────────

function ImageView({
  resource,
  src,
}: {
  resource: TeachResource;
  src: string;
}): ReactNode {
  const { loaded, timedOut, markLoaded } = useLoadState(src);
  return (
    <div className={styles.fill}>
      {!loaded && !timedOut ? <Skeleton /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={resource.label}
        className={styles.image}
        data-loaded={loaded ? "true" : undefined}
        referrerPolicy="no-referrer"
        onLoad={markLoaded}
        onError={markLoaded}
      />
    </div>
  );
}

// ── Native video / audio ──────────────────────────────────────────────────

function VideoView({
  resource,
  src,
}: {
  resource: TeachResource;
  src: string;
}): ReactNode {
  return (
    <div className={styles.fill}>
      <video
        src={src}
        controls
        preload="metadata"
        className={styles.video}
        aria-label={resource.label}
      />
    </div>
  );
}

function AudioView({
  resource,
  src,
}: {
  resource: TeachResource;
  src: string;
}): ReactNode {
  return (
    <div className={styles.audioWrap}>
      <audio
        src={src}
        controls
        preload="metadata"
        className={styles.audio}
        aria-label={resource.label}
      />
    </div>
  );
}

// ── Link fallback ("can't display") ───────────────────────────────────────

function LinkFallback({
  resource,
  heading = "This link can't be displayed here",
  body = "Some sites block being shown inside another page. Open it in a new tab to view it.",
}: {
  resource: TeachResource;
  heading?: string;
  body?: string;
}): ReactNode {
  // Gate the Open-in-new-tab href through the same scheme rule as every other
  // sink (matches ResourceLinkCard's href gate): an unsafe scheme yields no
  // button rather than a navigable javascript:/data: link.
  const href = isSafeBoardUrl(resource.url) ? resource.url : undefined;
  return (
    <div className={styles.fallback}>
      <EmptyState
        heading={heading}
        body={body}
        action={
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.fallbackLink}
            >
              <Button variant="primary" size="md">
                Open in new tab
              </Button>
            </a>
          ) : undefined
        }
      />
    </div>
  );
}
