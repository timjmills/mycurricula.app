// theme-values.ts — the dependency-free ORIGIN of the appearance value matrix.
//
// WHY A LEAF MODULE: the server layout (app/layout.tsx) must validate the
// mc-theme-axes cookie against the frozen allowlists and derive data-tone at
// SSR time. lib/theme.tsx is a "use client" provider whose import graph drags
// in theme-sync → supabase/client and photo-luminance; importing guards from
// it into a Server Component works only by grace of tree-shaking. This module
// has ZERO imports and no "use client", so both worlds consume it safely.
// lib/theme.tsx re-exports everything here, so existing call sites are
// untouched.
//
// ── ALLOWLIST LOCKSTEP (READ BEFORE EDITING) ────────────────────────────────
// THIS FILE is the canonical origin of the frozen value matrix
// (docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md). The mirrors that MUST stay in
// lockstep with it:
//   1. lib/theme.tsx              — re-exports (no literals of its own)
//   2. lib/theme-init.tsx         — the boot script's INLINE literal arrays
//                                   (cannot import; runs pre-module)
//   3. supabase/migrations/20260624120000_v2_theme_axes.sql — SQL CHECKs
//   4. app/layout.tsx             — the SSR root attributes (via this module)
//   5. scripts/probe-theme-wave.mjs — the per-wave probe's literal copies
// If any drifts, a value one surface accepts and another rejects fails
// SILENTLY at a boundary. Keep the lists identical.

// ── v2 axis types ───────────────────────────────────────────────────────────

/** Layout character + material + emphasis. */
export type ThemeFrame = "glass" | "paper" | "color";
/** The two frosted registers of Frame A. */
export type ThemeGlass = "dark" | "light";
/** What lives behind the glass. */
export type ThemeBg = "photo" | "wash";
/** Photo prominence + text treatment (Photo only). `normal` is auto. */
export type ThemeDim = "dim" | "normal" | "bright";
/** DERIVED — never chosen or persisted. */
export type ThemeTone = "light" | "dark";
/** The home center panel only. Presentation state, not a teacher preference. */
export type ThemeCanvas = "glass-dim" | "glass-light";

/** App-wide color theme — the concrete, paintable v2 values. */
export type AppTheme =
  | "clear"
  | "night"
  | "honey"
  | "blossom"
  | "mint"
  | "sky"
  | "off";

/** The stored theme choice — an AppTheme, or "system" (resolved at runtime). */
export type ThemeSetting = AppTheme | "system";

// ── Deprecated v1 compat types (kept for flag-OFF rollback) ─────────────────

/** @deprecated v1 card-style axis. Kept for v1 rollback; dropped from v2 DOM. */
export type ThemeStyle = "quiet" | "calm" | "vivid";
/**
 * @deprecated v1 saturation axis. Literal twin of lib/palette-data.ts
 * PaletteType (structurally identical — this module stays import-free).
 */
export type ThemePalette = "normal" | "highlight";

// ── Frozen value matrix ─────────────────────────────────────────────────────

/** The seven concrete themes, in picker order. */
export const APP_THEMES: readonly AppTheme[] = [
  "clear",
  "night",
  "honey",
  "blossom",
  "mint",
  "sky",
  "off",
];

/** Frame values — LOCKSTEP. */
export const FRAME_VALUES: readonly ThemeFrame[] = ["glass", "paper", "color"];
/** Glass-register values — LOCKSTEP. */
export const GLASS_VALUES: readonly ThemeGlass[] = ["dark", "light"];
/** Background values — LOCKSTEP. */
export const BG_VALUES: readonly ThemeBg[] = ["photo", "wash"];
/** Theme values — LOCKSTEP (the "system" sentinel is handled separately). */
export const THEME_VALUES: readonly AppTheme[] = APP_THEMES;
/** Photo-brightness values — LOCKSTEP. */
export const DIM_VALUES: readonly ThemeDim[] = ["dim", "normal", "bright"];
/** Derived tone values — DERIVED, never persisted (not part of the SQL CHECK). */
export const TONE_VALUES: readonly ThemeTone[] = ["light", "dark"];
/** Canvas values — runtime presentation state, not persisted. */
export const CANVAS_VALUES: readonly ThemeCanvas[] = [
  "glass-dim",
  "glass-light",
];

/** @deprecated v1 card-style values — kept for v1 rollback. */
export const STYLE_VALUES: readonly ThemeStyle[] = ["quiet", "calm", "vivid"];
/** @deprecated v1 palette values — kept for v1 rollback. */
export const PALETTE_VALUES: readonly ThemePalette[] = ["normal", "highlight"];

// ── Defaults (must match the SSR root attributes in app/layout.tsx) ─────────

/** Default frame — Frame A (Calm Glass). */
export const DEFAULT_FRAME: ThemeFrame = "glass";
/** Default glass register — dark frosted. */
export const DEFAULT_GLASS: ThemeGlass = "dark";
/** Default background — frosted glass over the classroom photo. */
export const DEFAULT_BG: ThemeBg = "photo";
/** Default theme — Clear, the resting theme. */
export const DEFAULT_THEME: ThemeSetting = "clear";
/** Default photo brightness — auto (samples luminance in a later stage). */
export const DEFAULT_DIM: ThemeDim = "normal";
/** Default canvas — the dark-frosted home center panel. */
export const DEFAULT_CANVAS: ThemeCanvas = "glass-dim";

/** @deprecated v1 default card style. */
export const DEFAULT_STYLE: ThemeStyle = "vivid";
/** @deprecated v1 default palette. */
export const DEFAULT_PALETTE: ThemePalette = "highlight";

// ── Allowlist guards ────────────────────────────────────────────────────────
// Every read of a persisted/cookie value flows through these; anything
// unrecognized falls to its default so a stale or hostile value can never
// paint an invalid attribute.

export function isThemeFrame(v: unknown): v is ThemeFrame {
  return FRAME_VALUES.includes(v as ThemeFrame);
}
export function isThemeGlass(v: unknown): v is ThemeGlass {
  return GLASS_VALUES.includes(v as ThemeGlass);
}
export function isThemeBg(v: unknown): v is ThemeBg {
  return BG_VALUES.includes(v as ThemeBg);
}
export function isThemeDim(v: unknown): v is ThemeDim {
  return DIM_VALUES.includes(v as ThemeDim);
}
export function isThemeCanvas(v: unknown): v is ThemeCanvas {
  return CANVAS_VALUES.includes(v as ThemeCanvas);
}
/** Accepts the v2 theme set AND the "system" sentinel. */
export function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === "system" || APP_THEMES.includes(v as AppTheme);
}
/** @deprecated v1 guard, kept for compat persistence. */
export function isThemeStyle(v: unknown): v is ThemeStyle {
  return STYLE_VALUES.includes(v as ThemeStyle);
}
/** @deprecated v1 guard, kept for compat persistence. */
export function isThemePalette(v: unknown): v is ThemePalette {
  return PALETTE_VALUES.includes(v as ThemePalette);
}

// ── Derived tone ────────────────────────────────────────────────────────────

/**
 * DERIVE the tone from the persisted axes (WAVE-2-VALUE-MATRIX.md §4).
 * Evaluated top-to-bottom; first match wins:
 *   1. theme === "night"  → dark   (the only dark theme, app-wide)
 *   2. glass === "light"  → light  (White-frosted register = a light surface)
 *   3. bg === "wash"      → light  (Night + White-frosted already handled)
 *   4. bg === "photo":  dim=dim → dark · dim=bright → light ·
 *      dim=normal → AUTO (`autoTone` when sampled, else the safe dark).
 *
 * Pure: the async photo-luminance result is passed IN as `autoTone`. The boot
 * script (lib/theme-init.tsx) and the SSR attributes (app/layout.tsx) both
 * replicate/call THIS derivation with autoTone=null — the three MUST agree or
 * first paint flashes.
 */
export function deriveTone(
  resolved: AppTheme,
  glass: ThemeGlass,
  bg: ThemeBg,
  dim: ThemeDim,
  autoTone: ThemeTone | null,
): ThemeTone {
  if (resolved === "night") return "dark";
  if (glass === "light") return "light";
  if (bg === "wash") return "light";
  if (dim === "dim") return "dark";
  if (dim === "bright") return "light";
  return autoTone ?? "dark";
}

// ── mc-theme-axes cookie codec ──────────────────────────────────────────────
//
// The SSR no-flash hint (docs/v2-rebuild/FRAME-FLASH-SSR-DESIGN.md). The
// client mirrors the persisted axes into this cookie; the server layout
// decodes + validates it to render true <html data-*> attributes and true
// ThemeProvider initial props. localStorage stays the client source of truth —
// the cookie is best-effort and self-heals via the boot script.
//
// FORMAT (version-tagged, dot-packed):
//   v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>
// All values are lowercase-alpha members of the frozen sets above (plus the
// "system" theme sentinel), so no percent-encoding is ever needed.
//
// ⚠ FIELD-ORDER LOCKSTEP (§4a design review, must-change #3): the dot-field
// ORDER is a contract between encode and decode. "normal" is a LEGAL VALUE IN
// TWO SLOTS (dim AND palette) — an order drift between the two functions would
// validate into the WRONG axis silently. Encode and decode live ONLY here as a
// matched pair; never hand-inline a join/split at a call site. The round-trip
// + field-order tests in tests/theme-values.test.ts pin this.

/** Cookie name. */
export const THEME_AXES_COOKIE = "mc-theme-axes";
/** Cookie format version tag (bump when the field list changes). */
export const THEME_AXES_COOKIE_VERSION = "v1";
/** One year, in seconds — renewed on every load by the provider. */
export const THEME_AXES_COOKIE_MAX_AGE = 31536000;

/** The persisted axes the cookie carries (theme is the SETTING, may be "system"). */
export interface ThemeAxesSnapshot {
  frame: ThemeFrame;
  glass: ThemeGlass;
  bg: ThemeBg;
  theme: ThemeSetting;
  dim: ThemeDim;
  /** @deprecated v1 axis — still drives live inline-style surfaces. */
  style: ThemeStyle;
  /** @deprecated v1 axis — carried for completeness with `style`. */
  palette: ThemePalette;
}

/** Every axis at its default — what SSR renders with no/invalid cookie. */
export const DEFAULT_THEME_AXES: ThemeAxesSnapshot = {
  frame: DEFAULT_FRAME,
  glass: DEFAULT_GLASS,
  bg: DEFAULT_BG,
  theme: DEFAULT_THEME,
  dim: DEFAULT_DIM,
  style: DEFAULT_STYLE,
  palette: DEFAULT_PALETTE,
};

/** Serialize the axes into the cookie VALUE (name/attributes are the caller's). */
export function encodeThemeAxesCookie(axes: ThemeAxesSnapshot): string {
  return [
    THEME_AXES_COOKIE_VERSION,
    axes.frame,
    axes.glass,
    axes.bg,
    axes.theme,
    axes.dim,
    axes.style,
    axes.palette,
  ].join(".");
}

/**
 * Parse + validate a raw cookie value. NEVER throws. Per-field allowlist
 * validation: any missing/unknown/malformed field falls to its default, so a
 * hostile or stale cookie can only ever select among the frozen values — no
 * unvalidated byte reaches an HTML attribute (the boot script's
 * XSS-safe-by-construction posture, extended to SSR).
 */
export function decodeThemeAxesCookie(
  raw: string | undefined | null,
): ThemeAxesSnapshot {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) {
    return { ...DEFAULT_THEME_AXES };
  }
  const parts = raw.split(".");
  if (parts[0] !== THEME_AXES_COOKIE_VERSION) {
    return { ...DEFAULT_THEME_AXES };
  }
  const [, frame, glass, bg, theme, dim, style, palette] = parts;
  return {
    frame: isThemeFrame(frame) ? frame : DEFAULT_FRAME,
    glass: isThemeGlass(glass) ? glass : DEFAULT_GLASS,
    bg: isThemeBg(bg) ? bg : DEFAULT_BG,
    theme: isThemeSetting(theme) ? theme : DEFAULT_THEME,
    dim: isThemeDim(dim) ? dim : DEFAULT_DIM,
    style: isThemeStyle(style) ? style : DEFAULT_STYLE,
    palette: isThemePalette(palette) ? palette : DEFAULT_PALETTE,
  };
}
