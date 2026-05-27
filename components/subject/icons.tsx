// components/subject/icons.tsx — file-type icons for the ResourcesSort row.
//
// Single-stroke, currentColor, 16×16 viewBox to match the lesson-card icon
// vocabulary (see components/lesson-card/icon.tsx). Mapping is by
// `LessonResource.provider` first (more specific) with a fallback to
// `LessonResource.type` when provider is absent.
//
// CLAUDE.md §4: tokens only. Color comes from the parent `color: var(...)`,
// the SVG uses `currentColor`. No fills, no hex.

import type { ReactNode } from "react";
import type { LessonResource } from "@/lib/types";

interface SvgBoxProps {
  children: ReactNode;
  size?: number;
}

/** Common SVG wrapper — single-stroke, currentColor, 16x16 viewBox. */
function SvgBox({ children, size = 14 }: SvgBoxProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Per-type glyphs ─────────────────────────────────────────────────────────
// Visual style matches components/lesson-card/icon.tsx: thin stroke, no fill,
// dimensions inside a 16×16 box. Each one is a small recognizable mark.

/** PDF — a document with "PDF"-ish triple horizontal lines. */
function PdfIcon(): ReactNode {
  return (
    <SvgBox>
      <path d="M3 1.5h6l3 3V14H3z M9 1.5V4.5H12" />
      <path d="M5 8h5M5 10.5h5M5 13h3" />
    </SvgBox>
  );
}

/** Doc (Word / Google Doc / generic doc) — document with body lines. */
function DocIcon(): ReactNode {
  return (
    <SvgBox>
      <path d="M3 1.5h6l3 3V14H3z M9 1.5V4.5H12" />
      <path d="M5 8h6M5 10.5h6M5 13h4" />
    </SvgBox>
  );
}

/** Slides (Google Slides, Keynote, PowerPoint) — rectangle with content lines
 *  inside (the "deck on a stand" silhouette). */
function SlidesIcon(): ReactNode {
  return (
    <SvgBox>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
      <path d="M4 5.5h8M4 8h6" />
      <path d="M8 11.5v2M5.5 13.5h5" />
    </SvgBox>
  );
}

/** Sheets (Google Sheets) — grid. */
function SheetsIcon(): ReactNode {
  return (
    <SvgBox>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
    </SvgBox>
  );
}

/** Drive (generic Google Drive) — triangular folder mark. */
function DriveIcon(): ReactNode {
  return (
    <SvgBox>
      <path d="M5.5 2h5l4 7-2.5 4h-8L1.5 9z" />
      <path d="M5.5 2L1.5 9M10.5 2l4 7M4 13l3-4h8" />
    </SvgBox>
  );
}

/** Image — mountain + sun. */
function ImageIcon(): ReactNode {
  return (
    <SvgBox>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <circle cx="5.5" cy="6" r="1.3" />
      <path d="M2 12l4-4 3 3 2-2 3 3" />
    </SvgBox>
  );
}

/** Video / play button — rounded rect + triangle play. */
function PlayIcon(): ReactNode {
  return (
    <SvgBox>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
      <path d="M7 6l3 2-3 2z" fill="currentColor" stroke="none" />
    </SvgBox>
  );
}

/** Link — chain links. Reused from lesson-card icon set. */
function LinkIcon(): ReactNode {
  return (
    <SvgBox>
      <path d="M6.5 9.5l3-3M5 11l-1 1a2.5 2.5 0 1 1-3.5-3.5l1-1M11 5l1-1a2.5 2.5 0 1 1 3.5 3.5l-1 1" />
    </SvgBox>
  );
}

/** Website — globe. */
function GlobeIcon(): ReactNode {
  return (
    <SvgBox>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2 2 10 0 12c-2-2-2-10 0-12z" />
    </SvgBox>
  );
}

/** Generic file — rounded rect + horizontal divider (matches the previous
 *  FileIcon fallback the row used pre-W3-C4). */
function FileIcon(): ReactNode {
  return (
    <SvgBox>
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M3 6h10" />
    </SvgBox>
  );
}

// ── Mapping ────────────────────────────────────────────────────────────────

/**
 * Pick the right icon for a resource. Provider (fine-grained, e.g. `gslides`)
 * wins over type (coarse, e.g. `slides`); both fall through to a sensible
 * generic icon and finally to a plain file mark.
 */
export function ResourceTypeIcon({
  resource,
}: {
  resource: LessonResource;
}): ReactNode {
  const { provider, type } = resource;

  // Provider — most specific signal.
  switch (provider) {
    case "youtube":
    case "vimeo":
    case "video":
      return <PlayIcon />;
    case "gslides":
      return <SlidesIcon />;
    case "gdocs":
      return <DocIcon />;
    case "gsheets":
      return <SheetsIcon />;
    case "gdrive":
      return <DriveIcon />;
    case "pdf":
      return <PdfIcon />;
    case "image":
      return <ImageIcon />;
    case "audio":
      return <PlayIcon />;
    case "website":
      return <GlobeIcon />;
    default:
      break;
  }

  // Type — coarse fallback (used when provider isn't set on legacy fixtures).
  switch (type) {
    case "pdf":
      return <PdfIcon />;
    case "doc":
      return <DocIcon />;
    case "slides":
      return <SlidesIcon />;
    case "image":
      return <ImageIcon />;
    case "youtube":
      return <PlayIcon />;
    case "website":
      return <GlobeIcon />;
    case "link":
      return <LinkIcon />;
    default:
      return <FileIcon />;
  }
}
