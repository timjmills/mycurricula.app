// _WidgetKit.tsx — shared primitives for the 5.31 widget set (replicated from
// the handoff's widgets530-wkit.jsx). These are LOCAL to the new widget bodies
// (Lesson Essentials / Routines & Management / Assessment & Support); they do
// not touch the frozen shared files. Every primitive is tokens-only and sized
// in `em` so the lead's `.tw` `--w-scale` rescales the whole widget.
//
// PRIVACY (CLAUDE.md §11.4 / plan §11.4): `Avatar` renders an INITIAL on a soft
// tint ONLY — never a full name. The bodies seed sample rosters with generic
// single-letter initials ("A", "B", …), never realistic full names, and no
// name-bearing field is ever persisted.
//
// Colour rule: the only computed colours here are the per-initial `hsl(hue …)`
// avatar/face tints (a name→hue hash, the handoff's documented mechanism) and
// the mood-face SVG geometry — analogous to the handoff's pip/face exception.
// Everything else resolves through `--w-*` theme vars or the `--tone-*` palette
// defined in widgets530.module.css. No hard-coded hex, no px font-size.

import type { CSSProperties, ReactNode } from "react";
import styles from "./widgets530.module.css";

// ── Semantic tones (Pill / FootNote) ───────────────────────────────────────
/** The handoff's TONE keys; each maps to a `--tone-*-bg/-fg/-solid` triple. */
export type Tone =
  | "red"
  | "pink"
  | "amber"
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "gray";

// ── Local inline-icon set ───────────────────────────────────────────────────
// The shared `icons.tsx` set is intentionally small; the 5.31 widgets need a
// richer line-icon vocabulary (book, pencil, clock, …). These mirror the
// handoff's `I` glyphs, dependency-free and `currentColor`-driven so they
// inherit the surrounding `--w-accent` / `--w-ink`. `viewBox` coordinates are
// raw numbers (the handoff's allowed SVG-geometry exception).

export type KitIconName =
  | "target"
  | "spark"
  | "check"
  | "book"
  | "msg"
  | "pencil"
  | "users"
  | "user"
  | "clipChk"
  | "note"
  | "marker"
  | "calc"
  | "beaker"
  | "clock"
  | "boxIco"
  | "bell"
  | "chair"
  | "backpack"
  | "mega"
  | "vol2"
  | "hand"
  | "headset"
  | "puzzle"
  | "ticket"
  | "bulb"
  | "flag"
  | "laptop"
  | "easel"
  | "star"
  | "pause"
  | "moreH";

const KIT_PATHS: Record<KitIconName, ReactNode> = {
  target: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </g>
  ),
  spark: (
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2" />
  ),
  check: <path d="M5 12l4 4 10-10" />,
  book: (
    <g>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </g>
  ),
  msg: <path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z" />,
  pencil: (
    <g>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      <path d="M14.5 5.5l3 3" />
    </g>
  ),
  users: (
    <g>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" />
    </g>
  ),
  user: (
    <g>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
    </g>
  ),
  clipChk: (
    <g>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 13l2 2 4-4" />
    </g>
  ),
  note: (
    <g>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </g>
  ),
  marker: (
    <g>
      <path d="M4 20l1-4 9-9 3 3-9 9z" />
      <path d="M13 7l3 3" />
    </g>
  ),
  calc: (
    <g>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4" />
    </g>
  ),
  beaker: (
    <g>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </g>
  ),
  clock: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </g>
  ),
  boxIco: (
    <g>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </g>
  ),
  bell: (
    <g>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </g>
  ),
  chair: (
    <g>
      <path d="M6 4v8M18 4v8M6 12h12M7 12l-1 8M17 12l1 8" />
      <path d="M6 8h12" />
    </g>
  ),
  backpack: (
    <g>
      <path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M9 8a3 3 0 0 1 6 0M8 13h8M10 21v-5h4v5" />
    </g>
  ),
  mega: (
    <g>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M19 8a4 4 0 0 1 0 8" />
    </g>
  ),
  vol2: (
    <g>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    </g>
  ),
  hand: (
    <path d="M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V6a1.5 1.5 0 0 1 3 0v6c0 4-2 9-6 9s-5-3-7-6l-1-2a1.6 1.6 0 0 1 2.6-1.8L7 13" />
  ),
  headset: (
    <g>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" />
      <path d="M20 19a3 3 0 0 1-3 3h-3" />
    </g>
  ),
  puzzle: (
    <path d="M10 4a2 2 0 0 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 0 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 0 0-4 0v1H6a1 1 0 0 1-1-1v-3H4a2 2 0 0 1 0-4h1V6a1 1 0 0 1 1-1h4z" />
  ),
  ticket: (
    <g>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
      <path d="M14 6v12" />
    </g>
  ),
  bulb: (
    <g>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    </g>
  ),
  flag: (
    <g>
      <path d="M5 21V4M5 4l11 2-2 4 2 4-11 2" />
    </g>
  ),
  laptop: (
    <g>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 20h20M9 20l1-2h4l1 2" />
    </g>
  ),
  easel: (
    <g>
      <path d="M4 9l8-5 8 5-8 5z" />
      <path d="M12 14v7M8 21h8" />
    </g>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  pause: (
    <g>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  moreH: (
    <g>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </g>
  ),
};

export interface KitIconProps {
  name: KitIconName;
  /** Size in `em` so it scales with the widget's `--w-scale`. Default 1.4em. */
  size?: number;
  title?: string;
}

/** A single line icon, sized in `em`, inheriting colour via `currentColor`. */
export function KitIcon({ name, size = 1.4, title }: KitIconProps): ReactNode {
  return (
    <svg
      width={`${size}em`}
      height={`${size}em`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {KIT_PATHS[name]}
    </svg>
  );
}

// ── WHead ───────────────────────────────────────────────────────────────────
/** The compact uppercase widget label. Chrome (pin/expand/…) is owned by the
 *  lead's `.tw` wrapper, so the body only renders the label. */
export function WHead({ label }: { label: string }): ReactNode {
  return (
    <div className={styles.head}>
      <span className={styles.headLabel}>{label}</span>
    </div>
  );
}

// ── Avatar (privacy-safe: initial on a name-hashed tint) ────────────────────
/** Hash a label to a stable hue (0–359). Identical to the handoff's `hueFor`. */
export function hueFor(label: string): number {
  let h = 0;
  for (const c of label || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export interface AvatarProps {
  /** A short label — an INITIAL or generic id ("A"); never a full name. */
  label?: string;
  /** Override the hashed hue. */
  hue?: number;
  /** Diameter in `em`. Default 2.2em. */
  size?: number;
}

/** Initial-on-tint stand-in for a student photo. Renders the first character
 *  only — by contract callers pass single-letter initials, so no name leaks. */
export function Avatar({ label = "", hue, size = 2.2 }: AvatarProps): ReactNode {
  const H = hue == null ? hueFor(label) : hue;
  const style: CSSProperties = {
    width: `${size}em`,
    height: `${size}em`,
    background: `linear-gradient(160deg, hsl(${H} 65% 88%), hsl(${H} 60% 80%))`,
    color: `hsl(${H} 45% 38%)`,
    fontSize: `${size * 0.4}em`,
  };
  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {(label[0] || "?").toUpperCase()}
    </span>
  );
}

// ── Face (mood emoji from basic shapes) ─────────────────────────────────────
export type FaceMood = "happy" | "meh" | "sad" | "calm" | "worried";

export interface FaceProps {
  mood: FaceMood;
  /** Tint hue. */
  hue: number;
  /** Diameter in `em`. Default 1.9em. */
  size?: number;
}

/** A mood face — a circle tint plus an SVG expression. The hue tint + SVG path
 *  coordinates are the handoff's documented face-geometry exception. */
export function Face({ mood, hue, size = 1.9 }: FaceProps): ReactNode {
  const ink = `hsl(${hue} 55% 38%)`;
  const tint = `hsl(${hue} 72% 88%)`;
  const inner = size * 0.62;
  return (
    <span
      className={styles.face}
      style={{ width: `${size}em`, height: `${size}em`, background: tint }}
      aria-hidden="true"
    >
      <svg width={`${inner}em`} height={`${inner}em`} viewBox="0 0 24 24">
        <circle cx="8.5" cy="9.5" r="1.6" fill={ink} />
        <circle cx="15.5" cy="9.5" r="1.6" fill={ink} />
        {(mood === "happy" || mood === "calm") && (
          <path
            d="M7 14a5 5 0 0 0 10 0"
            fill="none"
            stroke={ink}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
        {mood === "meh" && (
          <line
            x1="8"
            y1="15"
            x2="16"
            y2="15"
            stroke={ink}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
        {mood === "sad" && (
          <path
            d="M7 16.5a5 5 0 0 1 10 0"
            fill="none"
            stroke={ink}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
        {mood === "worried" && (
          <path
            d="M8 16a4 4 0 0 1 8 0"
            fill="none"
            stroke={ink}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

// ── Pill (status badge) ─────────────────────────────────────────────────────
export interface PillProps {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
}

/** A coloured status pill. Colours resolve through the `--tone-*` palette
 *  (composed from existing tokens in widgets530.module.css). */
export function Pill({ tone = "gray", children, icon }: PillProps): ReactNode {
  const style: CSSProperties = {
    background: `var(--tone-${tone}-bg)`,
    color: `var(--tone-${tone}-fg)`,
  };
  return (
    <span className={styles.pill} style={style}>
      {icon ? <span className={styles.pillIcon}>{icon}</span> : null}
      {children}
    </span>
  );
}

// ── StepNum (numbered step circle) ──────────────────────────────────────────
export interface StepNumProps {
  n: number;
  /** Solid fill colour. Defaults to the widget accent. */
  color?: string;
  /** Diameter in `em`. Default 1.9em. */
  size?: number;
}

export function StepNum({
  n,
  color = "var(--w-accent)",
  size = 1.9,
}: StepNumProps): ReactNode {
  const style: CSSProperties = {
    width: `${size}em`,
    height: `${size}em`,
    background: color,
    fontSize: `${size * 0.46}em`,
  };
  return (
    <span className={styles.step} style={style} aria-hidden="true">
      {n}
    </span>
  );
}

// ── FootNote (footer encouragement bar) ─────────────────────────────────────
export interface FootNoteProps {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}

export function FootNote({
  tone = "blue",
  icon,
  children,
}: FootNoteProps): ReactNode {
  const style: CSSProperties = {
    background: `var(--tone-${tone}-bg)`,
    color: `var(--tone-${tone}-fg)`,
  };
  return (
    <div className={styles.foot} style={style}>
      <span className={styles.footIcon}>
        {icon ?? <KitIcon name="star" size={1} />}
      </span>
      <span>{children}</span>
    </div>
  );
}
