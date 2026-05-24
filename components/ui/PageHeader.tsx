// PageHeader — canonical page-level title row.
//
// Used at the top of every route page (Daily, Subject, Year, Settings, etc.).
// The YearView page header (components/year/YearView.module.css .pageHeader)
// is the closest existing reference; this primitive formalizes that pattern
// and makes it importable across all pages.
//
// Layout: flex row, space-between.
//   Left: optional eyebrow → h1 title → optional subtitle (stacked column).
//   Right: optional actions cluster (typically <Button> elements from wave A).
//
// Responsive:
//   Desktop (1024+): padding 24px 28px, title var(--t-24).
//   Tablet  (600–900): padding 20px 20px.
//   Phone   (360–480): padding 16px 16px, title var(--t-22).
//   At ≤540px the actions wrap to a second line below the title block.
//
// All values come from tokens; no hex.

import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  /** Page title — the dominant H1. */
  title: string;
  /** Secondary line below the title, e.g. "24 lessons · Q1 2025–26". */
  subtitle?: string;
  /** Right-aligned action cluster, typically a flex row of <Button>s. */
  actions?: ReactNode;
  /**
   * Small uppercase eyebrow above the title, e.g. "WEEKLY PLAN".
   * Styled: var(--t-11) weight 800 uppercase letter-spacing 0.12em.
   */
  eyebrow?: string;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(" ")}>
      {/* Left column: eyebrow → title → subtitle */}
      <div className={styles.left}>
        {eyebrow && (
          <span className={styles.eyebrow} aria-label={eyebrow}>
            {eyebrow}
          </span>
        )}
        {/* h1 — one per page, scoped to this header. Consumers own the
            DOM hierarchy above this component. */}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      {/* Right cluster — wraps below the title block at narrow widths */}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
