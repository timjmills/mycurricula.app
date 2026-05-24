// Card — generalized Weekly-card recipe.
//
// Two variants:
//   subject  — carries the .cp-subj.<id> cascade; header tint, deep left
//              border, and focus ring all draw from the per-subject role tokens.
//   neutral  — no subject; header uses ink-50 flat + ink-150 hairline.
//              Left border is ink-200; focus ring is ink-900.
//
// When `onClick` is provided, the root element becomes a <button> for full
// keyboard a11y (Enter / Space activate, tab-focusable, focus-visible ring).
// Touch target is the whole card face; the card body must be ≥44px tall when
// interactive (the header + body padding typically exceeds this).
//
// Density:
//   comfortable (default) — 12px/14px padding
//   compact                — 8px/12px padding — used in tight columns (e.g.
//                            Year lane rows, Daily list items)
//
// Reduced-motion: hover lift is suppressed; transition collapses to near-zero.
// See app/tokens.css §(prefers-reduced-motion) for the global guard.

"use client";

import type { ReactNode } from "react";
import type { SubjectId } from "@/lib/types";
import styles from "./Card.module.css";

export interface CardProps {
  /**
   * When set, the card carries `.cp-subj.<subjectId>` so the header tint,
   * left border, and shadow draw from subject role tokens. When undefined,
   * the card renders in the neutral ink variant.
   */
  subjectId?: SubjectId;
  /**
   * Optional header content — sits inside the tinted header band.
   * When omitted the card is body-only (no header strip rendered).
   */
  header?: ReactNode;
  /** Card body content. */
  children: ReactNode;
  /**
   * When provided, the card root becomes a <button> — full keyboard a11y,
   * hover lift on desktop, focus ring. The whole card face is the hit target.
   */
  onClick?: () => void;
  /** Accessible name for interactive cards. Ignored when onClick is absent. */
  ariaLabel?: string;
  /** Visual density. Defaults to "comfortable". */
  density?: "compact" | "comfortable";
  className?: string;
}

export function Card({
  subjectId,
  header,
  children,
  onClick,
  ariaLabel,
  density = "comfortable",
  className = "",
}: CardProps) {
  // Build the className set: module class + optional cp-subj cascade + caller extras.
  const subjectClass = subjectId ? `cp-subj ${subjectId}` : "";
  const variantClass = subjectId ? styles.subject : styles.neutral;
  const densityClass =
    density === "compact" ? styles.compact : styles.comfortable;
  const rootClass = [
    styles.card,
    variantClass,
    densityClass,
    subjectClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // The card becomes a <button> when interactive; a plain <div> otherwise.
  // Using a button (not a div with role="button") gives us free keyboard events,
  // focus management, and :focus-visible without any extra JS.
  const Tag = onClick ? "button" : "div";
  const interactiveProps = onClick
    ? {
        type: "button" as const,
        onClick,
        "aria-label": ariaLabel,
      }
    : {};

  return (
    <Tag className={rootClass} {...interactiveProps}>
      {/* Header strip — tinted gradient for subject variant, flat ink-50 for neutral.
          Only rendered when the caller passes header content. */}
      {header !== undefined && <div className={styles.header}>{header}</div>}

      {/* Body — always --paper background */}
      <div className={styles.body}>{children}</div>
    </Tag>
  );
}
