import styles from "./ThemeWash.module.css";

/**
 * Animated, theme-tinted gradient-mesh background layer — the /home hero wash,
 * extracted so any page can reuse the same living background. Retints per theme
 * through the --mesh-a/b/c + --grad-hero tokens and drifts slowly (suppressed
 * under prefers-reduced-motion).
 *
 * Usage: drop it as the first child of a `position: relative; overflow: hidden`
 * container; it fills the container (inset: -12% bleeds the soft edges past the
 * frame, behind the content). Decorative, so it is aria-hidden. Pass `className`
 * to tweak placement/opacity for a specific surface.
 */
export function ThemeWash({ className }: { className?: string }) {
  return (
    <div
      className={`${styles.wash}${className ? ` ${className}` : ""}`}
      aria-hidden
    />
  );
}
