"use client";

// resource-type-pill.tsx — the small uppercase TYPE TAG shown beside each
// resource in the "More resources" sub-list (expanded SectionResources card)
// and the "Resource quick access" minimized card.
//
// Restyled for the 6.12.26 Resource & Notecard Redesign §2: the tag now
// wears the handoff's `.rn-typeTag` treatment (quiet muted uppercase word,
// no colored pill chrome — see resource_redesign/rn.css). The colorful
// per-type identity moved to the compact rows' 30px type-tinted icon tiles
// (the th-* token pairs), so the tag itself stays quiet. The component name
// and props are unchanged for API stability.
//
// The tag is purely decorative — the surrounding resource row already names
// the resource via its title, so the tag is just a quick visual type cue.
// aria-hidden so it never bloats the accessible name.

import type { ReactNode } from "react";
import type { SectionResource } from "@/lib/lesson-flow";
import styles from "./resource-type-pill.module.css";

export interface ResourceTypePillProps {
  /** The resource type whose label + colorway the pill represents. */
  type: SectionResource["type"];
}

/** The six display kinds the pill knows about. The seventh resource kind
 *  ("youtube") collapses to VIDEO for display; "website" collapses to LINK. */
type PillKind = "video" | "docx" | "pdf" | "link" | "slides" | "image";

/** Map a stored resource type to its display PillKind. */
function pillKindFor(type: SectionResource["type"]): PillKind {
  switch (type) {
    case "youtube":
      return "video";
    case "doc":
      return "docx";
    case "pdf":
      return "pdf";
    case "slides":
      return "slides";
    case "image":
      return "image";
    case "website":
    case "link":
    default:
      return "link";
  }
}

/** Human label rendered inside the pill — always uppercase per spec. */
function labelFor(kind: PillKind): string {
  switch (kind) {
    case "video":
      return "VIDEO";
    case "docx":
      return "DOCX";
    case "pdf":
      return "PDF";
    case "link":
      return "LINK";
    case "slides":
      return "SLIDES";
    case "image":
      return "IMAGE";
  }
}

/** The tag. Plain inline element; `data-kind` is kept on the DOM for
 *  styling hooks / tests even though the redesigned tag is monochrome. */
export function ResourceTypePill({ type }: ResourceTypePillProps): ReactNode {
  const kind = pillKindFor(type);
  return (
    <span className={styles.pill} data-kind={kind} aria-hidden="true">
      {labelFor(kind)}
    </span>
  );
}
