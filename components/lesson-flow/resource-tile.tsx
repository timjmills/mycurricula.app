"use client";

// resource-tile.tsx — synthetic thumbnail preview for a section resource.
//
// A section resource is rendered two ways inside LessonFlow:
//   • as a THUMBNAIL TILE — <ResourceTile>, this file — the DEFAULT view of a
//     section's resources (a responsive grid of tiles), and
//   • as a compact inline LINK — when the teacher MINIMIZES a section's
//     resources to the link list. In that minimized list, hovering or
//     focusing a link reveals a floating thumbnail preview of the resource;
//     <ResourceLinkPreview> (also in this file) is the popover wrapper that
//     drives that hover/focus reveal.
//
// Because MyCurricula is a frontend-only prototype with mock data and NO
// backend or stored files (CLAUDE.md §3 "current state of the repo"), there
// are no real thumbnails to fetch. Instead this component synthesizes a
// believable placeholder: a ~16:9 tile, subject-tinted via the cascading
// --c / --cl / --cd custom properties, with a type-appropriate frame:
//   • youtube  → dark frame + large centered play-button overlay
//   • slides   → slide frame (header bar + footer dots)
//   • pdf/doc  → document frame (page with ruled text lines)
//   • image    → image placeholder (mountain + sun glyph)
//   • link     → URL card (browser chrome bar + link glyph)
//   • website  → URL card (same as link, globe glyph)
//
// All color/type/spacing comes from tokens.css via var(); the subject color
// is read off the inherited .cp-subj cascade so a tile never invents a color.

import type { ReactNode } from "react";
import { useId, useState } from "react";
import type { SectionResource } from "@/lib/lesson-flow";
import { Button } from "@/components/ui";
import styles from "./resource-tile.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface ResourceTileProps {
  /** The resource this tile previews. */
  resource: SectionResource;
  /**
   * Minimize the section's resources away from the thumbnail grid — i.e.
   * flip the whole section to the compact inline-link list. (Named
   * `onCollapse` for the stable public API; thumbnails are now the default
   * view, so "collapse" means "minimize to the link list".)
   */
  onCollapse: () => void;
  /** Remove the resource from its section. */
  onRemove: () => void;
}

// ── Frame "kind" — groups the seven resource types into four frame looks ──
// The frame look is what makes a synthetic thumbnail read as a video vs. a
// document vs. a link at a glance.
type FrameKind = "video" | "slides" | "document" | "image" | "url";

function frameKindFor(type: SectionResource["type"]): FrameKind {
  switch (type) {
    case "youtube":
      return "video";
    case "slides":
      return "slides";
    case "pdf":
    case "doc":
      return "document";
    case "image":
      return "image";
    case "website":
    case "link":
    default:
      return "url";
  }
}

// ── ResourceTile ─────────────────────────────────────────────────────────

/** Synthetic ~16:9 thumbnail preview for a single section resource. */
export function ResourceTile({
  resource,
  onCollapse,
  onRemove,
}: ResourceTileProps): ReactNode {
  const kind = frameKindFor(resource.type);
  const label = resource.label || resource.type;

  return (
    <figure className={styles.tile} data-frame={kind}>
      {/* ── 16:9 preview frame ──────────────────────────────────────────
          The frame's appearance is keyed by data-frame so the CSS module
          owns the per-kind styling. Inside sits the synthetic artwork. */}
      <div className={styles.frame}>
        {/* Type-specific synthetic artwork. */}
        <FrameArtwork kind={kind} />

        {/* Large centered type icon — the primary at-a-glance signal. */}
        <span className={styles.bigIcon} aria-hidden="true">
          <BigResourceIcon type={resource.type} />
        </span>

        {/* Minimize-to-links control, pinned to the tile's top-right.
            Button variant="icon" carries the 44px touch target + focus ring. */}
        <Button
          variant="icon"
          size="sm"
          className={styles.collapseBtn}
          onClick={onCollapse}
          iconAriaLabel={`Minimize resources to a link list (from ${label})`}
        >
          <CollapseIcon />
        </Button>

        {/* Remove control, pinned beside collapse. */}
        <Button
          variant="icon"
          size="sm"
          className={styles.removeBtn}
          onClick={onRemove}
          iconAriaLabel={`Remove resource: ${label}`}
        >
          <RemoveIcon />
        </Button>
      </div>

      {/* ── Caption row — small type icon + label + type tag ──────────── */}
      <figcaption className={styles.caption}>
        <span className={styles.captionIcon} aria-hidden="true">
          <SmallResourceIcon type={resource.type} />
        </span>
        <span className={styles.captionLabel}>{label}</span>
        <span className={styles.captionType}>{resource.type}</span>
      </figcaption>
    </figure>
  );
}

// ── ResourceLinkPreview ──────────────────────────────────────────────────
// A hover/focus popover wrapper for a resource shown in the MINIMIZED inline-
// link list. The teacher's link row is passed as `children`; this component
// wraps it and, on mouse-enter OR keyboard focus anywhere inside, floats a
// small synthetic thumbnail preview of the resource just above the row.
//
// The preview is the same synthetic ~16:9 artwork ResourceTile draws, but
// CONTROL-FREE (no collapse / remove buttons) — it is purely a glanceable
// preview, not an interactive tile.
//
// Accessibility / motion:
//   • The reveal triggers on BOTH pointer hover and keyboard focus
//     (onFocus / onBlur), so keyboard users get the same preview.
//   • The preview is aria-hidden — it is decorative; the link itself already
//     names the resource — so it never adds noise to the accessible name.
//   • The fade-in is dropped to near-instant under prefers-reduced-motion via
//     the CSS module; no layout-shifting motion is used.

export interface ResourceLinkPreviewProps {
  /** The resource to preview in the floating thumbnail. */
  resource: SectionResource;
  /** The inline link row (icon + label + remove button) this wraps. */
  children: ReactNode;
}

/** Wraps a minimized resource link row and floats a synthetic thumbnail
 *  preview of the resource above it on hover or focus. */
export function ResourceLinkPreview({
  resource,
  children,
}: ResourceLinkPreviewProps): ReactNode {
  // `shown` is true while the row is hovered OR holds keyboard focus. Pointer
  // and focus are tracked together — either one keeps the preview up.
  const [shown, setShown] = useState(false);
  const kind = frameKindFor(resource.type);
  const previewId = useId();

  return (
    <span
      className={styles.previewWrap}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      // focus/blur bubble from the link's controls, so a keyboard user
      // tabbing onto the row reveals the same preview a mouse hover would.
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {children}

      {/* Floating thumbnail preview — only mounted while shown, so it costs
          nothing at rest. aria-hidden: decorative, the link names the
          resource already. */}
      {shown && (
        <span
          className={styles.previewPopover}
          id={previewId}
          role="presentation"
          aria-hidden="true"
        >
          <span className={styles.previewFrame} data-frame={kind}>
            <FrameArtwork kind={kind} />
            <span className={styles.previewBigIcon}>
              <BigResourceIcon type={resource.type} />
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

// ── Synthetic frame artwork ──────────────────────────────────────────────
// Per-kind decorative SVG that fills the frame behind the big icon. These
// are deliberately abstract — geometric placeholders, not faux content.

function FrameArtwork({ kind }: { kind: FrameKind }): ReactNode {
  switch (kind) {
    case "video":
      // Dark video plate — the .frame[data-frame="video"] CSS supplies the
      // dark fill; artwork adds a subtle scrubber bar near the bottom.
      return (
        <svg
          className={styles.artwork}
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="14" y="76" width="132" height="3" rx="1.5" opacity="0.3" />
          <rect x="14" y="76" width="46" height="3" rx="1.5" opacity="0.7" />
          <circle cx="60" cy="77.5" r="3.4" opacity="0.85" />
        </svg>
      );
    case "slides":
      // Slide frame — a header bar plus a row of progress dots.
      return (
        <svg
          className={styles.artwork}
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="20" y="16" width="78" height="7" rx="3.5" opacity="0.55" />
          <circle cx="74" cy="74" r="2.6" opacity="0.4" />
          <circle cx="84" cy="74" r="2.6" opacity="0.7" />
          <circle cx="94" cy="74" r="2.6" opacity="0.4" />
        </svg>
      );
    case "document":
      // Document frame — a page with ruled "text" lines.
      return (
        <svg
          className={styles.artwork}
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="44" y="22" width="72" height="5" rx="2.5" opacity="0.5" />
          <rect x="44" y="34" width="72" height="3.4" rx="1.7" opacity="0.3" />
          <rect x="44" y="43" width="72" height="3.4" rx="1.7" opacity="0.3" />
          <rect x="44" y="52" width="48" height="3.4" rx="1.7" opacity="0.3" />
        </svg>
      );
    case "image":
      // Image placeholder — a horizon line; the big mountain icon sits above.
      return (
        <svg
          className={styles.artwork}
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="0" y="68" width="160" height="22" opacity="0.18" />
        </svg>
      );
    case "url":
    default:
      // URL card — a faux browser chrome bar across the top of the frame.
      return (
        <svg
          className={styles.artwork}
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="0" y="0" width="160" height="16" opacity="0.22" />
          <circle cx="9" cy="8" r="2.4" opacity="0.6" />
          <circle cx="18" cy="8" r="2.4" opacity="0.6" />
          <circle cx="27" cy="8" r="2.4" opacity="0.6" />
          <rect x="38" y="4.5" width="112" height="7" rx="3.5" opacity="0.4" />
        </svg>
      );
  }
}

// ── Big resource icon ────────────────────────────────────────────────────
// The large centered glyph. youtube gets a filled play triangle inside a
// ring (the classic play-button overlay); everything else gets its outline
// type icon at a large render size.

function BigResourceIcon({
  type,
}: {
  type: SectionResource["type"];
}): ReactNode {
  if (type === "youtube") {
    return (
      <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="currentColor" fillOpacity="0.92" />
        <path d="M20 16l13 8-13 8V16z" fill="var(--paper)" />
      </svg>
    );
  }

  // All non-video kinds reuse the same stroked icon family at 36px.
  const common = {
    width: 36,
    height: 36,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "slides":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "website":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

// ── Small caption icon ───────────────────────────────────────────────────
// 12px stroked type icon used in the tile's caption row.

function SmallResourceIcon({
  type,
}: {
  type: SectionResource["type"];
}): ReactNode {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "slides":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case "website":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

// ── Control icons ────────────────────────────────────────────────────────

function CollapseIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Collapse-inward arrows — minimize affordance. */}
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function RemoveIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
