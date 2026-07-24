// ProgressRing.tsx — small SVG completion ring for the Unit Explorer.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0) so the workspace can reuse it
// alongside the unit tabs. Style-agnostic: the track + value colors arrive as
// class-name props, so the ring re-tints per host (white on the gradient header,
// subject color in the Overview body) without owning any CSS of its own.

import { type ReactNode } from "react";

/** Small SVG progress ring. `pct` is 0–1. The track + value both use
 *  currentColor-adjacent tokens so the ring re-tints per host (white on the
 *  gradient header, subject color in the Overview body). */
export function ProgressRing({
  pct,
  size = 44,
  stroke = 5,
  className,
  trackClass,
  valueClass,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  trackClass: string;
  valueClass: string;
  label: string;
}): ReactNode {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        className={trackClass}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={valueClass}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
