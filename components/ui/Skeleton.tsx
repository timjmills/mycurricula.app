// Skeleton — the canonical loading placeholder.
//
// A themed shimmer block for "content is on its way" states. Use it wherever a
// surface would otherwise show a blank or, worse, a false empty message while
// the planner hydrate chain (11–16s over Supabase) is still in flight. The
// PlannerEmpty wrapper renders this automatically on `pending`; reach for the
// bare primitive when you need a bespoke loading shape (a rail, a card grid).
//
// Accessibility: the container is role="status" aria-busy with a
// visually-hidden label, so a screen reader hears "Loading…" instead of being
// told the surface is empty (which is what happens today). The animated bars
// are aria-hidden. Under prefers-reduced-motion the shimmer is a static fill.
//
// Tokens only: --skeleton-base / --skeleton-sheen (themed via the ink tier).

import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /**
   * Number of placeholder bars to stack. Defaults to 3 — a reasonable stand-in
   * for a short list. Use 1 for a single block (a header, a card).
   */
  lines?: number;
  /** Compact register for tight containers (thinner bars, less gap). */
  size?: "sm" | "md";
  /** Accessible label announced while loading. */
  label?: string;
  className?: string;
}

export function Skeleton({
  lines = 3,
  size = "md",
  label = "Loading…",
  className = "",
}: SkeletonProps) {
  const sizeClass = size === "sm" ? styles.sm : styles.md;
  return (
    <div
      className={[styles.root, sizeClass, className].filter(Boolean).join(" ")}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className={styles.srOnly}>{label}</span>
      {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
        <span key={i} className={styles.bar} aria-hidden="true">
          <span className={styles.sheen} />
        </span>
      ))}
    </div>
  );
}
