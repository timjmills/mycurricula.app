"use client";

// resource-type-pill.tsx — the small TYPE PILL shown beside a resource row.
// Its original host (the SectionResources card) was replaced by the 6.11.26
// phase/resChip presentation; the pill survives as a standalone primitive
// consumed by the Daily planning tabs.
//
// NOT migrated to Badge primitive — by design.
//
// The Badge primitive uses the semantic palette (success/info/warn/danger/
// neutral) and derives background + text from design tokens. The resource-
// type pills use EXACT HEX color pairs mandated by the spec (Plugin
// Directions §4.4) as the published visual language for resource types:
//
//   VIDEO    #fce7f3 / #9d174d
//   DOCX     #dbeafe / #1e40af
//   PDF      #fee2e2 / #991b1b
//   LINK     #f3f4f6 / #374151
//   SLIDES   #fef3c7 / #92400e
//   IMAGE    #dcfce7 / #166534
//
// These pairs are bespoke, spec-locked, and not expressible through the
// token system without adding six new token groups. Badge does not accept a
// raw hex pair; adding a "resource" variant would bleed domain-specific
// knowledge into a generic primitive. The correct solution (when the design
// matures) is a subject-neutral ResourceTypePill primitive in components/ui/
// that accepts a colorway prop — not retrofitting Badge. Until then, this
// component stays bespoke and explicitly documented as such.
//
// The pill is purely decorative — the surrounding resource row already names
// the resource via its title/URL subtitle, so the pill is just a quick visual
// type tag. aria-hidden so it never bloats the accessible name.

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

/** The pill. Plain inline element; `data-kind` keyed for CSS to paint the
 *  exact spec hex color pair. */
export function ResourceTypePill({ type }: ResourceTypePillProps): ReactNode {
  const kind = pillKindFor(type);
  return (
    <span className={styles.pill} data-kind={kind} aria-hidden="true">
      {labelFor(kind)}
    </span>
  );
}
