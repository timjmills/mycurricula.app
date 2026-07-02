"use client";

// theme.tsx — the app-wide theme provider (v2 appearance engine).
//
// THE v2 AXES (all written to <html> as data attributes so CSS reacts without a
// re-render, and exposed via useTheme() for components that branch in JS):
//   • frame  ∈ { glass, paper, color }                  — layout character + material
//   • glass  ∈ { dark, light }                           — Frame A frosted register
//   • bg     ∈ { photo, wash }                           — what lives behind the glass
//   • theme  ∈ { clear, night, honey, blossom, mint, sky, off } (+ "system" sentinel)
//   • dim    ∈ { dim, normal, bright }                   — Photo prominence + tone
//   • tone   ∈ { light, dark }   — DERIVED, never user-set, never persisted
//   • canvas ∈ { glass-dim, glass-light }                — home center panel only
//
// DERIVED data-tone: tone is computed from theme + bg + dim at paint time (see
// deriveTone). Every surface branches on data-tone, never on the theme — this is
// the legibility contract. For dim ∈ {dim, bright} and bg === "wash" / theme ===
// "night" the tone is fixed by the persisted axes. For bg === "photo" + dim ===
// "normal" the matrix calls for AUTO: sample the active photo's average luminance
// (lib/photo-luminance.ts) and resolve light (light photo → dark text) / dark.
// Until a sample is available — which is ALWAYS the case in this wave, because no
// active-photo URL source is wired yet (the photo library is a later wave) — the
// `normal` branch resolves to its safe default (dark — white text on a scrim).
// The auto path is therefore DORMANT today: autoTone stays null and `normal`
// behaves exactly as before. The boot script paints a deterministic light default
// and the post-mount effect reconciles to the derivation.
//
// DEPRECATED v1 COMPAT (kept, NOT emitted on the v2 DOM path): `style`/`palette`
// + their setters and STYLE_VALUES/PALETTE_VALUES. ~17 components and the command
// palette still read them, so removing them breaks tsc; they stay so a flag-OFF
// rollback to v1 still compiles + renders. They are still persisted + still
// mirrored to <html data-style data-palette> so a v1 rollback finds the values.
//
// mode (personal/team) is NOT owned here — it is sourced from
// useAppState().editMode so the forking state is never duplicated.
//
// Persistence: every axis writes through to localStorage under the
// `mycurricula:user:*` keys. The no-FOUC boot script in lib/theme-init.tsx paints
// the persisted attributes BEFORE first paint; the mirror effect below skips its
// first run so it does not clobber what the boot script already painted.
//
// COUPLING — READ BEFORE EDITING (ALLOWLIST LOCKSTEP): the guard arrays here are
// the ORIGIN of the frozen value matrix (docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md).
// They MUST stay byte-identical to FOUR other surfaces:
//   • lib/theme-init.tsx          — the inline boot-script literal arrays
//   • the teacher_preferences SQL CHECK constraints (the migration)
//   • app/layout.tsx              — the SSR root attributes (defaults)
//   • scripts/probe-theme-wave.mjs — the per-wave probe
// If they drift, a value one surface accepts and another rejects breaks SILENTLY
// (wrong attribute, dropped sync write — no error).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { PaletteProvider } from "./palette";
import type { PaletteType, SubjectMapping } from "./palette";
import {
  getCachedLuminance,
  luminanceToTone,
  samplePhotoLuminance,
} from "./photo-luminance";
import { loadRemotePrefs, saveRemotePrefs } from "./theme-sync";

// ── v2 axis types ─────────────────────────────────────────────────────────

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

// ── Deprecated v1 compat types (kept for flag-OFF rollback) ────────────────

/** @deprecated v1 card-style axis. Kept for v1 rollback; dropped from v2 DOM. */
export type ThemeStyle = "quiet" | "calm" | "vivid";
/** @deprecated v1 saturation axis — alias of the palette type. */
export type ThemePalette = PaletteType;

// ── Frozen value matrix (THE origin of the five-surface lockstep) ──────────

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
export const CANVAS_VALUES: readonly ThemeCanvas[] = ["glass-dim", "glass-light"];

/** @deprecated v1 card-style values — kept for v1 rollback. */
export const STYLE_VALUES: readonly ThemeStyle[] = ["quiet", "calm", "vivid"];
/** @deprecated v1 palette values — kept for v1 rollback. */
export const PALETTE_VALUES: readonly ThemePalette[] = ["normal", "highlight"];

// ── Defaults (must match the SSR root attributes in app/layout.tsx) ────────

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

interface ThemeContextValue {
  // v2 axes
  frame: ThemeFrame;
  glass: ThemeGlass;
  bg: ThemeBg;
  /** The stored theme choice (may be "system"). */
  theme: ThemeSetting;
  /** The concrete theme actually painted (never "system"). */
  resolvedTheme: AppTheme;
  dim: ThemeDim;
  /** DERIVED — read-only, never a setter. */
  tone: ThemeTone;
  canvas: ThemeCanvas;
  setFrame: (f: ThemeFrame) => void;
  setGlass: (g: ThemeGlass) => void;
  setBg: (b: ThemeBg) => void;
  setTheme: (t: ThemeSetting) => void;
  setDim: (d: ThemeDim) => void;
  setCanvas: (c: ThemeCanvas) => void;

  // Deprecated v1 compat — kept so the ~17 v1 consumers still compile/render.
  /** @deprecated v1 card style; dropped from the v2 DOM path. */
  style: ThemeStyle;
  /** @deprecated v1 palette saturation. */
  palette: ThemePalette;
  /** @deprecated */
  setStyle: (s: ThemeStyle) => void;
  /** @deprecated */
  setPalette: (p: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Access the current theme axes and their setters. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}

// ── Storage keys + allowlist validation ──────────────────────────────────
//
// Keys follow the repo's `mycurricula:user:*` convention. Every read is
// validated against an allowlist; anything unrecognized is ignored so a stale
// or hand-edited value can never paint an invalid attribute. All access is
// SSR-guarded + try/catch wrapped (private-mode / quota safe).

const THEME_KEY = "mycurricula:user:theme";
const FRAME_KEY = "mycurricula:user:theme-frame";
const GLASS_KEY = "mycurricula:user:theme-glass";
const BG_KEY = "mycurricula:user:theme-bg";
const DIM_KEY = "mycurricula:user:theme-dim";
// v1 keys — kept for the one-time migration shim + deprecated compat persistence.
const STYLE_KEY = "mycurricula:user:theme-style";
const PALETTE_KEY = "mycurricula:user:theme-palette";
// Last LOCAL write stamp for the SYNCED v1 triple (epoch ms as a string). NOT an
// axis key — never validated, not part of the SQL/boot lockstep. It is the local
// half of the last-writer-wins gate on the remote pull (W3.1): written whenever
// a persist actually CHANGES one of theme/style/palette, compared against the
// remote row's updated_at before remote values are applied. Any test/probe that
// seeds the axis keys directly must seed this too, or the remote row will
// out-time the seed exactly like the pre-fix clobber.
const THEME_STAMP_KEY = "mycurricula:user:theme-updated-at";

// Per-photo auto-tone cache key prefix (NOT a lockstep axis key). The `normal`
// AUTO path samples a photo's luminance once; we cache the derived tone keyed by
// the photo URL so a revisit can seed `autoTone` synchronously and skip the
// post-hydration flash while the async re-sample confirms it. This is a SEPARATE
// presentation cache — it is NEVER one of the lockstep theme axes, never sent to
// teacher_preferences / theme-sync, and never validated against an axis guard.
// Shape: `mycurricula:photo-tone:<url>` → "light" | "dark".
const PHOTO_TONE_KEY_PREFIX = "mycurricula:photo-tone:";
const photoToneKey = (url: string): string => `${PHOTO_TONE_KEY_PREFIX}${url}`;

// ── Allowlist guards ───────────────────────────────────────────────────────
//
// Exported so lib/theme-sync.ts (and any future consumer) validates against
// THIS file's lists instead of keeping duplicates. The two copies that MUST
// stay literal (they run before any module loads / live in SQL) are the inline
// boot script in lib/theme-init.tsx and the migration's CHECK constraints.

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
// NOTE: NOT a lockstep axis guard. Tone is DERIVED, never persisted as an axis;
// this only validates the separate per-URL `photo-tone:<url>` presentation cache
// (the AUTO seed) so a stale/hand-edited value can never seed an invalid tone.
function isThemeTone(v: unknown): v is ThemeTone {
  return TONE_VALUES.includes(v as ThemeTone);
}
/** Accepts the v2 theme set AND the "system" sentinel. */
export function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === "system" || APP_THEMES.includes(v as AppTheme);
}

// v1 theme values accepted ONLY on read for the one-time remap (paper|cloud →
// clear). They never reach the DOM and are never returned as a ThemeSetting.
const V1_THEME_REMAP: Record<string, ThemeSetting> = {
  paper: "clear",
  cloud: "clear",
};

/** @deprecated v1 guard — kept for theme-sync + the compat axis. */
export function isThemeStyle(v: unknown): v is ThemeStyle {
  return STYLE_VALUES.includes(v as ThemeStyle);
}
/** @deprecated v1 guard — kept for theme-sync + the compat axis. */
export function isThemePalette(v: unknown): v is ThemePalette {
  return PALETTE_VALUES.includes(v as ThemePalette);
}

/** Read + validate a single key. Returns null when absent/invalid/unavailable. */
function readValidated<T>(
  key: string,
  guard: (v: unknown) => v is T,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return guard(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Read + validate the stored theme, applying the one-time v1 remap. Accepts a
 * v2 value (or "system") directly; remaps a v1 paper/cloud to clear; returns
 * null for anything unrecognized. Idempotent — re-reading "clear" yields "clear".
 */
function readThemeMigrated(): ThemeSetting | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === null) return null;
    if (isThemeSetting(raw)) return raw;
    if (raw in V1_THEME_REMAP) return V1_THEME_REMAP[raw];
    return null;
  } catch {
    return null;
  }
}

/** Persist a single key, silently ignoring storage failures (private mode). */
function writeKey(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Swallow — quota or disabled-storage errors are non-fatal.
  }
}

/** Raw, unvalidated read of a single key — null on SSR or storage failure. */
function readKeyRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Cross-fade pulse window. When the RESOLVED theme actually changes, the mirror
// effect sets `data-theme-transition` on <html> for this long so the CSS can
// cross-fade the color swap, then removes it. Kept just above the CSS transition
// duration so the attribute outlives the fade.
const THEME_TRANSITION_MS = 220;

// Debounce window for the best-effort remote write. Rapid toggling collapses
// into a single saveRemotePrefs call this long after the last change.
const REMOTE_SAVE_DEBOUNCE_MS = 800;

/** Resolve a possibly-"system" setting to a concrete theme. */
function resolveTheme(setting: ThemeSetting, systemDark: boolean): AppTheme {
  if (setting === "system") return systemDark ? "night" : "clear";
  return setting;
}

/**
 * The ACTIVE-PHOTO-URL SEAM for the `dim === "normal"` AUTO tone.
 *
 * Today this yields null: NO code populates an active-photo URL anywhere (the
 * photo library / upload is a LATER wave). The CSS stage already references an
 * empty `var(--stage-photo, none)` slot (app/themes.css); when the photo wave
 * lands it will set `<html data-stage-photo="<url>">` (or repoint this getter at
 * whatever photo context it introduces), and the AUTO path lights up with no
 * further change here. Until then `autoTone` stays null → `normal` resolves to
 * dark exactly as before, so the mechanism is dormant + safe this wave.
 */
function getActivePhotoUrl(): string | null {
  if (typeof document === "undefined") return null;
  const url = document.documentElement.dataset.stagePhoto;
  return url && url.length > 0 ? url : null;
}

/**
 * DERIVE the tone from the persisted axes (see WAVE-2-VALUE-MATRIX.md §4).
 * Evaluated top-to-bottom; first match wins:
 *   1. theme === "night"  → dark   (the only dark theme, app-wide)
 *   2. glass === "light"  → light  (White-frosted register = a light surface)
 *   3. bg === "wash"      → light  (Night + White-frosted already handled)
 *   4. bg === "photo":
 *        dim === "dim"     → dark   (manual override — scrim, white text)
 *        dim === "bright"  → light  (manual override — ink on white frosted)
 *        dim === "normal"  → AUTO. Resolve the photo-luminance-derived `autoTone`
 *                            when one is available; until then (the common case,
 *                            and ALWAYS this wave — no active-photo URL is wired)
 *                            default to dark (the safe white-text-on-scrim state).
 *
 * Pure: the auto result is passed IN as `autoTone` (computed by the effect from
 * the luminance sample), so this stays a plain function of its arguments.
 */
function deriveTone(
  resolved: AppTheme,
  glass: ThemeGlass,
  bg: ThemeBg,
  dim: ThemeDim,
  autoTone: ThemeTone | null,
): ThemeTone {
  if (resolved === "night") return "dark";
  // The White-frosted register IS a light surface (translucent-white panels +
  // dark ink), so it forces light tone app-wide — this is what makes the
  // legibility contract self-consistent instead of relying on a per-element
  // re-flip allowlist (Wave-2 re-audit MAJOR; Night still wins above). It sets
  // the surface/text register, NOT the background, so "glass must never wash the
  // background" still holds.
  if (glass === "light") return "light";
  if (bg === "wash") return "light";
  // bg === "photo"
  if (dim === "dim") return "dark";
  if (dim === "bright") return "light";
  // dim === "normal" — AUTO: the luminance-derived tone when sampled, else dark.
  return autoTone ?? "dark";
}

interface ThemeProviderProps {
  /** Initial frame. */
  initialFrame?: ThemeFrame;
  /** Initial glass register. */
  initialGlass?: ThemeGlass;
  /** Initial background. */
  initialBg?: ThemeBg;
  /** Initial theme setting. */
  initialTheme?: ThemeSetting;
  /** Initial photo brightness. */
  initialDim?: ThemeDim;
  /** Initial canvas. */
  initialCanvas?: ThemeCanvas;
  /** @deprecated initial card style (v1 compat). */
  initialStyle?: ThemeStyle;
  /** @deprecated initial palette (v1 compat). */
  initialPalette?: ThemePalette;
  /** Core Curriculum subject → swatch mapping passed to PaletteProvider. */
  mapping?: SubjectMapping;
  children: ReactNode;
}

/**
 * Provides theme state, mirrors the v2 axes onto
 * <html data-frame data-glass data-bg data-theme data-dim data-tone>, and wraps
 * children in a PaletteProvider bound to the (deprecated) palette axis.
 *
 * Hydration model (SSR no-FOUC contract): the useState initializers ALWAYS
 * return the passed initial* / defaults (never read localStorage), so the
 * server-rendered HTML and the first client render match exactly. Persisted
 * values are loaded in a post-mount effect (with the one-time v1→v2 key shim);
 * the boot script in lib/theme-init.tsx has already painted them onto <html>,
 * so the load effect only reconciles React state, and the mirror effect skips
 * its first run to avoid clobbering the boot script's attributes with defaults.
 */
export function ThemeProvider({
  initialFrame = DEFAULT_FRAME,
  initialGlass = DEFAULT_GLASS,
  initialBg = DEFAULT_BG,
  initialTheme = DEFAULT_THEME,
  initialDim = DEFAULT_DIM,
  initialCanvas = DEFAULT_CANVAS,
  initialStyle = DEFAULT_STYLE,
  initialPalette = DEFAULT_PALETTE,
  mapping,
  children,
}: ThemeProviderProps): ReactNode {
  // NOTE on mode (personal/team): the forking edit mode is owned by app-state
  // (useAppState().editMode) and the data-mode attribute is set by the
  // forking-aware planner shell — NOT here. ThemeProvider deliberately does NOT
  // consume useAppState(): it lives in the ROOT layout, ABOVE the
  // <AppStateProvider> (which is mounted per route group), so the context is not
  // in scope at this level. Duplicating the forking state here would both
  // violate the single-source rule and crash at mount. The mode axis stays where
  // app-state is available, exactly as the v2 reference sets data-mode on `.home`
  // (a descendant), never on <html>.

  const [frame, setFrame] = useState<ThemeFrame>(initialFrame);
  const [glass, setGlass] = useState<ThemeGlass>(initialGlass);
  const [bg, setBg] = useState<ThemeBg>(initialBg);
  const [theme, setTheme] = useState<ThemeSetting>(initialTheme);
  const [dim, setDim] = useState<ThemeDim>(initialDim);
  const [canvas, setCanvas] = useState<ThemeCanvas>(initialCanvas);
  // Deprecated v1 compat axes.
  const [style, setStyle] = useState<ThemeStyle>(initialStyle);
  const [palette, setPalette] = useState<ThemePalette>(initialPalette);
  // Tracks the OS dark-mode preference, used only when theme === "system".
  const [systemDark, setSystemDark] = useState(false);
  // The photo-luminance-derived tone for the `dim === "normal"` AUTO path. NULL
  // until an active photo is sampled — which is ALWAYS the case this wave (no
  // active-photo URL is wired yet), so `normal` falls back to dark. Initialized
  // to null (never read storage in the initializer — preserves the SSR no-FOUC
  // contract: server HTML + first client render must match). It is NOT persisted
  // as tone (tone is derived, never persisted); the per-URL `photo-tone:<url>`
  // cache that seeds it is a separate, non-axis presentation cache.
  const [autoTone, setAutoTone] = useState<ThemeTone | null>(null);

  // Load effect — declared FIRST so it runs before the mirror effect on mount.
  // Reads + validates the persisted axes (NEW v2 keys), runs the one-time v1
  // shim, reconciles state; reads the OS color-scheme preference and subscribes
  // to changes; subscribes to cross-tab `storage` events. SSR never runs this.
  useEffect(() => {
    // Guards async state-sets (the remote load below) against an unmount that
    // races the in-flight promise.
    let active = true;

    // ── New v2 axes ──────────────────────────────────────────────────────
    const savedFrameRaw = readValidated(FRAME_KEY, isThemeFrame);
    // One-time shim: if `frame` is unset, seed it from the deprecated v1
    // `theme-style` (calm→glass, quiet→paper, vivid→color). Mirrors the SQL
    // migration's frame-seed UPDATE so DB + client agree.
    const savedStyle = readValidated(STYLE_KEY, isThemeStyle);
    const seededFrame: ThemeFrame | null =
      savedFrameRaw !== null
        ? savedFrameRaw
        : savedStyle === "calm"
          ? "glass"
          : savedStyle === "quiet"
            ? "paper"
            : savedStyle === "vivid"
              ? "color"
              : null;
    if (seededFrame !== null) setFrame(seededFrame);

    const savedGlass = readValidated(GLASS_KEY, isThemeGlass);
    if (savedGlass !== null) setGlass(savedGlass);
    const savedBg = readValidated(BG_KEY, isThemeBg);
    if (savedBg !== null) setBg(savedBg);
    const savedDim = readValidated(DIM_KEY, isThemeDim);
    if (savedDim !== null) setDim(savedDim);
    // Theme with the one-time v1 paper/cloud → clear remap. We also capture the
    // RAW stored string at mount — distinct from the migrated/validated value —
    // so the remote-sync race guard below can compare the live stored value
    // against what was there at mount (an in-flight user change differs). The
    // RAW string (not the validated form) is what matters: comparing against a
    // validated value would mis-fire the guard if the stored string ever
    // differs from its validated form (an invalid value, or a future
    // remappable one like theme's paper→clear). style/palette use the same raw
    // capture so the guard stays correct if they ever become remappable too.
    const readRaw = (key: string): string | null =>
      typeof window === "undefined"
        ? null
        : (() => {
            try {
              return window.localStorage.getItem(key);
            } catch {
              return null;
            }
          })();
    const rawThemeAtMount = readRaw(THEME_KEY);
    const rawStyleAtMount = readRaw(STYLE_KEY);
    const rawPaletteAtMount = readRaw(PALETTE_KEY);
    const savedTheme = readThemeMigrated();
    if (savedTheme !== null) setTheme(savedTheme);

    // ── Deprecated v1 compat axes (still loaded so a rollback finds them) ──
    if (savedStyle !== null) setStyle(savedStyle);
    const savedPalette = readValidated(PALETTE_KEY, isThemePalette);
    if (savedPalette !== null) setPalette(savedPalette);

    // Cross-device sync (best-effort, OFF unless NEXT_PUBLIC_THEME_SYNC=1).
    // theme-sync still carries the v1 triple (theme/style/palette) — it is a
    // SEPARATE later stage to widen it to the v2 axes, so we keep it intact and
    // only reconcile the compat axes from it here.
    void loadRemotePrefs().then((remote) => {
      remoteSettledRef.current = true;
      if (!active) return;

      if (remote.kind === "loaded") {
        // LAST-WRITER-WINS gate (W3.1). The untouched() guard below only
        // protects a change made WHILE this load was in flight; a change
        // written just BEFORE the page load — a reload inside the save
        // debounce, or a probe/test seeding the keys — reads as "untouched"
        // and was silently clobbered by the stale remote row. The stamp is
        // written by the persist effect on every real local change of the
        // synced triple; a stamp at-or-after the row's updated_at means THIS
        // device holds the fresher look — skip the apply, and re-push local
        // (only when the values actually diverge) so the lost debounced write
        // heals and other devices converge.
        // CLOCK-SKEW DECISION (documented, accepted): localAt is client time,
        // remote.updatedAt is server time, compared raw with no margin. Same-
        // device sequences end value-EQUAL (our own save echoes back), so skew
        // only decides ties between near-simultaneous edits on DIFFERENT
        // devices — where either winner is acceptable. A margin would trade
        // that for masking genuine cross-device recency; not worth it.
        // (`trim()` guard: an empty/whitespace stamp would Number() to 0 and
        // beat a missing updated_at tie — treat it as no stamp instead.)
        const rawStamp = readRaw(THEME_STAMP_KEY);
        const localAt =
          rawStamp !== null &&
          rawStamp.trim() !== "" &&
          Number.isFinite(Number(rawStamp))
            ? Number(rawStamp)
            : Number.NEGATIVE_INFINITY;
        if (localAt >= remote.updatedAt) {
          const localTheme = readThemeMigrated();
          const localStyle = readValidated(STYLE_KEY, isThemeStyle);
          const localPalette = readValidated(PALETTE_KEY, isThemePalette);
          const diverges =
            (remote.prefs.theme !== undefined &&
              remote.prefs.theme !== (localTheme ?? DEFAULT_THEME)) ||
            (remote.prefs.style !== undefined &&
              remote.prefs.style !== (localStyle ?? DEFAULT_STYLE)) ||
            (remote.prefs.palette !== undefined &&
              remote.prefs.palette !== (localPalette ?? DEFAULT_PALETTE));
          if (diverges) {
            void saveRemotePrefs({
              theme: localTheme ?? DEFAULT_THEME,
              style: localStyle ?? DEFAULT_STYLE,
              palette: localPalette ?? DEFAULT_PALETTE,
            });
          }
          return;
        }
        const untouched = (key: string, atMount: string | null): boolean => {
          try {
            return window.localStorage.getItem(key) === atMount;
          } catch {
            return true;
          }
        };
        if (
          remote.prefs.theme !== undefined &&
          remote.prefs.theme !== savedTheme &&
          untouched(THEME_KEY, rawThemeAtMount)
        ) {
          setTheme(remote.prefs.theme);
        }
        if (
          remote.prefs.style !== undefined &&
          remote.prefs.style !== savedStyle &&
          untouched(STYLE_KEY, rawStyleAtMount)
        ) {
          setStyle(remote.prefs.style);
        }
        if (
          remote.prefs.palette !== undefined &&
          remote.prefs.palette !== savedPalette &&
          untouched(PALETTE_KEY, rawPaletteAtMount)
        ) {
          setPalette(remote.prefs.palette);
        }
        return;
      }

      if (remote.kind === "empty") {
        // Seed the row from local values so an existing teacher's look reaches
        // their other devices (see the long rationale in theme-sync.ts). Only
        // the v1 triple is synced this stage.
        const localTheme = readThemeMigrated();
        const localStyle = readValidated(STYLE_KEY, isThemeStyle);
        const localPalette = readValidated(PALETTE_KEY, isThemePalette);
        if (localTheme !== null || localStyle !== null || localPalette !== null) {
          void saveRemotePrefs({
            theme: localTheme ?? DEFAULT_THEME,
            style: localStyle ?? DEFAULT_STYLE,
            palette: localPalette ?? DEFAULT_PALETTE,
          });
        }
      }
      // kind === "unavailable": sync off / no session / read error — do nothing.
    });

    // OS dark-mode preference + live subscription (drives "system").
    let unsubscribeScheme: (() => void) | null = null;
    const onSchemeChange = (e: MediaQueryListEvent): void =>
      setSystemDark(e.matches);
    try {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      setSystemDark(mql.matches);
      mql.addEventListener("change", onSchemeChange);
      unsubscribeScheme = () =>
        mql.removeEventListener("change", onSchemeChange);
    } catch {
      // matchMedia/addEventListener unavailable — "system" falls back to its
      // clear default and never live-updates on this browser.
    }

    // Cross-tab sync: re-validate + apply changes from OTHER tabs.
    const onStorage = (e: StorageEvent): void => {
      if (e.key === FRAME_KEY) {
        const v = readValidated(FRAME_KEY, isThemeFrame);
        if (v !== null) setFrame(v);
      } else if (e.key === GLASS_KEY) {
        const v = readValidated(GLASS_KEY, isThemeGlass);
        if (v !== null) setGlass(v);
      } else if (e.key === BG_KEY) {
        const v = readValidated(BG_KEY, isThemeBg);
        if (v !== null) setBg(v);
      } else if (e.key === DIM_KEY) {
        const v = readValidated(DIM_KEY, isThemeDim);
        if (v !== null) setDim(v);
      } else if (e.key === THEME_KEY) {
        const v = readThemeMigrated();
        if (v !== null) setTheme(v);
      } else if (e.key === STYLE_KEY) {
        const v = readValidated(STYLE_KEY, isThemeStyle);
        if (v !== null) setStyle(v);
      } else if (e.key === PALETTE_KEY) {
        const v = readValidated(PALETTE_KEY, isThemePalette);
        if (v !== null) setPalette(v);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      if (unsubscribeScheme) unsubscribeScheme();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedTheme = useMemo<AppTheme>(
    () => resolveTheme(theme, systemDark),
    [theme, systemDark],
  );

  // DERIVED tone — recomputed from the persisted axes (+ the AUTO `autoTone`)
  // whenever they change. Never persisted; never a setter. `autoTone` only ever
  // affects the bg === "photo" + dim === "normal" branch (deriveTone); for every
  // other combination it is ignored, so its null default this wave is inert.
  const tone = useMemo<ThemeTone>(
    () => deriveTone(resolvedTheme, glass, bg, dim, autoTone),
    [resolvedTheme, glass, bg, dim, autoTone],
  );

  // AUTO photo-luminance effect (matrix §4, rule 3, `dim === "normal"`). Runs
  // only when bg === "photo" AND dim === "normal" AND an active photo URL exists.
  // Today getActivePhotoUrl() always returns null (no photo source wired this
  // wave), so this effect resets autoTone to null on every run and never samples
  // — the dormant, zero-behavior-change state. When the later photo wave feeds a
  // URL through the seam, this (a) seeds autoTone synchronously from the in-memory
  // / per-URL localStorage cache to avoid a flash, then (b) samples the photo and
  // sets autoTone via luminanceToTone, writing both caches. NEVER runs on the
  // server; resilient to a missing URL; guards async sets against unmount.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const url =
      bg === "photo" && dim === "normal" ? getActivePhotoUrl() : null;

    // Conditions unmet (wash / night-via-theme handled upstream, dim/bright
    // overrides, or no active photo — the common case): no auto tone applies, so
    // `normal` falls back to dark. Resetting to null keeps deriveTone pure.
    if (url === null) {
      setAutoTone(null);
      return;
    }

    let active = true;

    // (a) Synchronous seed — avoid a post-hydration flash on revisit. Prefer the
    // in-memory luminance cache; else the per-URL localStorage tone cache. Either
    // is a hint that the async sample below confirms/overrides.
    const cachedLum = getCachedLuminance(url);
    if (typeof cachedLum === "number") {
      setAutoTone(luminanceToTone(cachedLum));
    } else {
      const storedTone = readValidated(photoToneKey(url), isThemeTone);
      if (storedTone !== null) setAutoTone(storedTone);
    }

    // (b) Sample (de-duped + memoized in photo-luminance.ts). On a readable photo
    // set the derived tone + persist the per-URL cache; on failure (load error /
    // CORS taint / no canvas) keep whatever seed we had (or the dark fallback) —
    // never force a wrong tone.
    void samplePhotoLuminance(url).then((lum) => {
      if (!active || lum === null) return;
      const derived = luminanceToTone(lum);
      setAutoTone(derived);
      writeKey(photoToneKey(url), derived);
    });

    return () => {
      active = false;
    };
  }, [bg, dim]);

  // Mirror effect — declared SECOND. Writes the axes onto <html> and persists
  // them. It SKIPS its first invocation: the boot script already painted the
  // correct attributes pre-paint; running on mount would overwrite them with
  // the (default) initializer state for a frame — the FOUC the boot script
  // prevents. When the load effect's setStates land, this re-runs and DOES
  // write/persist. Fresh users never change state, so the effect never re-runs
  // and the server-rendered defaults already on <html> are correct.
  const mounted = useRef(false);
  // The last RESOLVED theme actually painted to <html>. Seeded on the first run
  // from the DOM (what the boot script painted), NOT from React default state,
  // so the load effect's catch-up does not fire a spurious cross-fade on load.
  const prevResolvedRef = useRef<AppTheme | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteSettledRef = useRef(false);
  useEffect(() => {
    const root = document.documentElement;

    if (!mounted.current) {
      mounted.current = true;
      const painted = root.dataset.theme;
      prevResolvedRef.current = APP_THEMES.includes(painted as AppTheme)
        ? (painted as AppTheme)
        : resolvedTheme;
      return;
    }

    // Cross-fade trigger (CONTRACT with the theme cross-fade CSS): ONLY when the
    // resolved theme actually changes from the previously-painted value — not on
    // other axis changes, and not on the skipped first run. Reduced-motion
    // suppression lives in the CSS under :root[data-theme-transition].
    if (resolvedTheme !== prevResolvedRef.current) {
      root.setAttribute("data-theme-transition", "");
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => {
        root.removeAttribute("data-theme-transition");
        transitionTimerRef.current = null;
      }, THEME_TRANSITION_MS);
    }

    // v2 DOM attributes. data-style is INTENTIONALLY dropped from the v2 path;
    // data-palette is kept because the PaletteProvider bridge + some v1 surfaces
    // still read it.
    root.dataset.frame = frame;
    root.dataset.glass = glass;
    root.dataset.bg = bg;
    root.dataset.theme = resolvedTheme;
    root.dataset.dim = dim;
    root.dataset.tone = tone;
    root.dataset.canvas = canvas;
    root.dataset.palette = palette;
    prevResolvedRef.current = resolvedTheme;

    // Persist. Theme persists the SETTING (may be "system"). canvas/tone are NOT
    // persisted (tone is derived; canvas is runtime presentation state).
    // Stamp the last local write that CHANGES the SYNCED triple (the
    // theme-sync last-writer-wins gate) — read-before-write, so the hydration
    // re-write of identical values never re-stamps. Three loads must NOT read
    // as fresh local edits, or the stamp would block — and via the heal-push,
    // CLOBBER — the teacher's remote look: a plain page load (stored value ===
    // state), a FRESH store's default write (nothing stored + state still the
    // default — initialization, not an edit), and a MIGRATION/NORMALIZATION
    // rewrite (a v1 remnant like theme="paper" loads as "clear"; comparing the
    // raw string would mis-read that plain reload as an edit — §4a finding).
    // So `prev` is NORMALIZED exactly the way the load path reads it: theme
    // through the v1 remap + guard, style/palette through their guards; an
    // unrecognized prev degrades to the fresh-store rule.
    const normTheme = (v: string | null): string | null =>
      v === null
        ? null
        : isThemeSetting(v)
          ? v
          : v in V1_THEME_REMAP
            ? V1_THEME_REMAP[v]
            : null;
    const normStyle = (v: string | null): string | null =>
      v !== null && isThemeStyle(v) ? v : null;
    const normPalette = (v: string | null): string | null =>
      v !== null && isThemePalette(v) ? v : null;
    const syncedEdited = (
      prev: string | null,
      value: string,
      dflt: string,
    ): boolean => (prev === null ? value !== dflt : prev !== value);
    if (
      syncedEdited(normTheme(readKeyRaw(THEME_KEY)), theme, DEFAULT_THEME) ||
      syncedEdited(normStyle(readKeyRaw(STYLE_KEY)), style, DEFAULT_STYLE) ||
      syncedEdited(
        normPalette(readKeyRaw(PALETTE_KEY)),
        palette,
        DEFAULT_PALETTE,
      )
    ) {
      writeKey(THEME_STAMP_KEY, String(Date.now()));
    }
    writeKey(FRAME_KEY, frame);
    writeKey(GLASS_KEY, glass);
    writeKey(BG_KEY, bg);
    writeKey(THEME_KEY, theme);
    writeKey(DIM_KEY, dim);
    // Deprecated compat persistence (so a v1 rollback finds the values).
    writeKey(STYLE_KEY, style);
    writeKey(PALETTE_KEY, palette);

    // Best-effort cross-device push (no-op unless NEXT_PUBLIC_THEME_SYNC=1).
    // Still the v1 triple this stage (widening theme-sync is a later stage).
    if (remoteSettledRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveRemotePrefs({ theme, style, palette });
        saveTimerRef.current = null;
      }, REMOTE_SAVE_DEBOUNCE_MS);
    }
  }, [frame, glass, bg, resolvedTheme, dim, tone, canvas, theme, style, palette]);

  // Clear any pending pulse/save timers on unmount.
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      frame,
      glass,
      bg,
      theme,
      resolvedTheme,
      dim,
      tone,
      canvas,
      setFrame,
      setGlass,
      setBg,
      setTheme,
      setDim,
      setCanvas,
      // deprecated compat
      style,
      palette,
      setStyle,
      setPalette,
    }),
    [frame, glass, bg, theme, resolvedTheme, dim, tone, canvas, style, palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaletteProvider type={palette} mapping={mapping}>
        {children}
      </PaletteProvider>
    </ThemeContext.Provider>
  );
}
