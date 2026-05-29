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
  resolveBoardSrc,
} from "@/lib/board-embed";
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
  const parsed: ParsedResource | null = useMemo(
    () => (resource.url ? parseResourceUrl(resource.url) : null),
    [resource.url],
  );
  const kind = useMemo(
    () => boardEffectiveKind(resource, parsed),
    [resource, parsed],
  );
  const src = useMemo(() => resolveBoardSrc(resource), [resource]);
  const canEmbed = boardCanEmbed(resource, parsed, kind);

  return (
    <div
      className={[styles.frame, className].filter(Boolean).join(" ")}
      title={`Resource: ${resource.label}`}
    >
      {!src || !canEmbed ? (
        <LinkFallback resource={resource} />
      ) : kind === "embed" || kind === "pdf" ? (
        <IframeView resource={resource} src={src} />
      ) : kind === "image" ? (
        <ImageView resource={resource} src={src} />
      ) : kind === "video" ? (
        <VideoView resource={resource} src={src} />
      ) : kind === "audio" ? (
        <AudioView resource={resource} src={src} />
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
        src={src}
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
  const href = resource.url ?? undefined;
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
