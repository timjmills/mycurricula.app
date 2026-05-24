// EmptyState — centered "nothing to show" pattern.
//
// Used for empty days, empty subject filter results, empty search, empty rail
// tabs. Fills the available height of its container via `flex: 1` — mount it
// inside a flex column and it will push itself to the vertical center.
//
// Two sizes:
//   md (default) — full placeholder (48px vert padding, 96×96 icon area)
//   sm           — compact variant for tighter spaces (24px vert padding,
//                  56×56 icon area, smaller type)
//
// The `icon` prop accepts any ReactNode — typically an inline SVG composed
// from ink-300 / ink-200 tokens for the muted illustration register.
// When omitted, the icon area is not rendered.
//
// The `action` prop accepts any ReactNode — typically a <Button variant="primary">
// from wave A primitives.
//
// No entrance animation is added; reduced-motion is respected if callers add one.

import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /**
   * Optional illustration — typically an inline SVG using ink tokens.
   * Rendered in a centered fixed-size area (96×96 md / 56×56 sm).
   */
  icon?: ReactNode;
  /** Prominent heading — the primary empty message. */
  heading: string;
  /** Longer explanation below the heading. Max-width 400px, centered. */
  body?: string;
  /** Primary CTA, typically a <Button variant="primary">. */
  action?: ReactNode;
  /** Compact variant for tight containers. Defaults to "md". */
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({
  icon,
  heading,
  body,
  action,
  size = "md",
  className = "",
}: EmptyStateProps) {
  const sizeClass = size === "sm" ? styles.sm : styles.md;

  return (
    <div
      className={[styles.root, sizeClass, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={heading}
    >
      {/* Icon area — only rendered when the caller passes an icon */}
      {icon !== undefined && (
        <div className={styles.iconArea} aria-hidden="true">
          {icon}
        </div>
      )}

      {/* Heading — the primary message; no HTML heading element since
          this may appear inside an already-headed section. */}
      <p className={styles.heading}>{heading}</p>

      {/* Body — optional longer explanation */}
      {body && <p className={styles.body}>{body}</p>}

      {/* CTA — optional primary action */}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
