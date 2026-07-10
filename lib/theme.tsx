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
import type { SubjectMapping } from "./palette";
import {
  getCachedLuminance,
  luminanceToTone,
  samplePhotoLuminance,
} from "./photo-luminance";
import { loadRemotePrefs, saveRemotePrefs } from "./theme-sync";

// ── v2 axis types + frozen value matrix ────────────────────────────────────
//
// MOVED to lib/theme-values.ts — the dependency-free leaf the SERVER layout
// imports for cookie validation + SSR tone derivation without dragging this
// file's theme-sync → supabase/client graph into the server bundle. That file
// is now the canonical ALLOWLIST LOCKSTEP origin; everything is re-exported
// here so existing call sites are untouched.
import {
  APP_THEMES,
  DEFAULT_FRAME,
  DEFAULT_GLASS,
  DEFAULT_BG,
  DEFAULT_THEME,
  DEFAULT_DIM,
  DEFAULT_CANVAS,
  DEFAULT_STYLE,
  DEFAULT_PALETTE,
  TONE_VALUES,
  isThemeFrame,
  isThemeGlass,
  isThemeBg,
  isThemeDim,
  isThemeSetting,
  isThemeStyle,
  isThemePalette,
  deriveTone,
  encodeThemeAxesCookie,
  THEME_AXES_COOKIE,
  THEME_AXES_COOKIE_MAX_AGE,
} from "./theme-values";
import type {
  ThemeFrame,
  ThemeGlass,
  ThemeBg,
  ThemeDim,
  ThemeTone,
  ThemeCanvas,
  AppTheme,
  ThemeSetting,
  ThemeStyle,
  ThemePalette,
} from "./theme-values";

export {
  APP_THEMES,
  FRAME_VALUES,
  GLASS_VALUES,
  BG_VALUES,
  THEME_VALUES,
  DIM_VALUES,
  TONE_VALUES,
  CANVAS_VALUES,
  STYLE_VALUES,
  PALETTE_VALUES,
  DEFAULT_FRAME,
  DEFAULT_GLASS,
  DEFAULT_BG,
  DEFAULT_THEME,
  DEFAULT_DIM,
  DEFAULT_CANVAS,
  DEFAULT_STYLE,
  DEFAULT_PALETTE,
  isThemeFrame,
  isThemeGlass,
  isThemeBg,
  isThemeDim,
  isThemeCanvas,
  isThemeSetting,
  isThemeStyle,
  isThemePalette,
} from "./theme-values";
export type {
  ThemeFrame,
  ThemeGlass,
  ThemeBg,
  ThemeDim,
  ThemeTone,
  ThemeCanvas,
  AppTheme,
  ThemeSetting,
  ThemeStyle,
  ThemePalette,
} from "./theme-values";

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
// Last LOCAL write stamp for the SYNCED axes (epoch ms as a string; W3.1b
// widened the synced set to the full persisted snapshot). NOT an
// axis key — never validated, not part of the SQL/boot lockstep. It is the local
// half of the last-writer-wins gate on the remote pull (W3.1): written whenever
// a persist actually CHANGES one of the synced axes, compared against the
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
// MOVED to lib/theme-values.ts (imported + re-exported above) so the server
// layout validates the mc-theme-axes cookie against the same single origin.
// The two copies that MUST stay literal (they run before any module loads /
// live in SQL) are the inline boot script in lib/theme-init.tsx and the
// migration's CHECK constraints.

// NOTE: NOT a lockstep axis guard. Tone is DERIVED, never persisted as an axis;
// this only validates the separate per-URL `photo-tone:<url>` presentation cache
// (the AUTO seed) so a stale/hand-edited value can never seed an invalid tone.
function isThemeTone(v: unknown): v is ThemeTone {
  return TONE_VALUES.includes(v as ThemeTone);
}

// v1 theme values accepted ONLY on read for the one-time remap (paper|cloud →
// clear). They never reach the DOM and are never returned as a ThemeSetting.
const V1_THEME_REMAP: Record<string, ThemeSetting> = {
  paper: "clear",
  cloud: "clear",
};

// (isThemeStyle / isThemePalette moved to lib/theme-values.ts; re-exported above.)

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

/**
 * Mirror the persisted axes into the mc-theme-axes cookie — the SSR no-flash
 * hint (FRAME-FLASH-SSR-DESIGN.md). Value is the theme-values codec's packed
 * form (frozen-set members only, so no encoding is needed); attributes follow
 * the design: 1-year Max-Age (renewed on every load by the mount effect),
 * Lax, path-wide, Secure on https. NOT HttpOnly by necessity — this client
 * code writes it. Carries zero secrets (presentation prefs only).
 */
function writeAxesCookie(axes: {
  frame: ThemeFrame;
  glass: ThemeGlass;
  bg: ThemeBg;
  theme: ThemeSetting;
  dim: ThemeDim;
  style: ThemeStyle;
  palette: ThemePalette;
}): void {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${THEME_AXES_COOKIE}=${encodeThemeAxesCookie(axes)}` +
      `; Path=/; Max-Age=${THEME_AXES_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // Swallow — cookie-disabled environments just keep today's boot-heal path.
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

// deriveTone MOVED to lib/theme-values.ts (imported above) so the SSR layout,
// this provider, and the boot script's replica share ONE derivation. The
// glass=light rationale (Wave-2 re-audit MAJOR) travels with it.

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
  // app-state is available. (Placement note: the v2 reference sets data-mode on
  // `.home`; the W3.3 ChromeShell deliberately mirrors it onto <html> instead so
  // the team glow reaches portals/overlays that render outside the shell — the
  // OWNERSHIP split is what this note guarantees, not the node.)

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
    if (seededFrame !== null) {
      setFrame(seededFrame);
      // Persist the shim result IMMEDIATELY (W3.1b §4a Codex High): the boot
      // script normally persists this same seed pre-paint, but if its setItem
      // failed (quota/private mode) the mirror effect would read prev===null,
      // classify the MIGRATION as a local edit, stamp, and heal-push the
      // inferred frame over a newer remote row. A migration is not an edit —
      // writing the key here makes the mirror read prev === value (no stamp).
      if (savedFrameRaw === null) writeKey(FRAME_KEY, seededFrame);
    }

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
    // W3.1b: raw-at-mount captures for the four widened axes. Taken BEFORE the
    // cookie→storage back-seed below, so a back-seeded key reads as "touched"
    // and blocks a same-load remote apply for that axis — the rare
    // storage-cleared+cookie-kept+remote-fresher overlap self-heals on the
    // NEXT load (storage then holds a value, untouched() passes).
    const rawFrameAtMount = readRaw(FRAME_KEY);
    const rawGlassAtMount = readRaw(GLASS_KEY);
    const rawBgAtMount = readRaw(BG_KEY);
    const rawDimAtMount = readRaw(DIM_KEY);
    const savedTheme = readThemeMigrated();
    if (savedTheme !== null) setTheme(savedTheme);

    // Cookie→storage back-seed (§4a review Low #1): if localStorage is
    // readable but EMPTY for an axis while the cookie-derived initial state is
    // non-default (privacy tooling cleared storage but kept cookies), the boot
    // script painted defaults this load and — with nothing to seed — no state
    // change would ever repaint or re-persist, leaving SSR/tree and attrs
    // durably split. Writing the initial (cookie) value back into storage
    // heals the NEXT load's boot paint; this load's mixed frame is a one-off.
    // Closure state here IS the initial-prop (cookie) value — the seeding
    // setStates above only take effect next render.
    if (savedFrameRaw === null && seededFrame === null && frame !== DEFAULT_FRAME)
      writeKey(FRAME_KEY, frame);
    if (savedGlass === null && glass !== DEFAULT_GLASS)
      writeKey(GLASS_KEY, glass);
    if (savedBg === null && bg !== DEFAULT_BG) writeKey(BG_KEY, bg);
    if (savedDim === null && dim !== DEFAULT_DIM) writeKey(DIM_KEY, dim);
    if (savedTheme === null && theme !== DEFAULT_THEME)
      writeKey(THEME_KEY, theme);

    // ── Deprecated v1 compat axes (still loaded so a rollback finds them) ──
    if (savedStyle !== null) setStyle(savedStyle);
    const savedPalette = readValidated(PALETTE_KEY, isThemePalette);
    if (savedPalette !== null) setPalette(savedPalette);

    // Cross-device sync (best-effort, OFF unless NEXT_PUBLIC_THEME_SYNC=1).
    // W3.1b: widened to the FULL persisted snapshot — the five v2 axes
    // (frame/glass/bg/theme/dim) plus the deprecated v1 compat pair
    // (style/palette). Derived tone/canvas and the per-view local UI keys
    // (cc_editmode/cc_pblayout/cc_deLeftW) are excluded by design (plan C5).
    // Reads the CURRENT local look for the heal-push / empty-seed paths.
    const readLocalSnapshot = () => ({
      frame: readValidated(FRAME_KEY, isThemeFrame) ?? DEFAULT_FRAME,
      glass: readValidated(GLASS_KEY, isThemeGlass) ?? DEFAULT_GLASS,
      bg: readValidated(BG_KEY, isThemeBg) ?? DEFAULT_BG,
      theme: readThemeMigrated() ?? DEFAULT_THEME,
      dim: readValidated(DIM_KEY, isThemeDim) ?? DEFAULT_DIM,
      style: readValidated(STYLE_KEY, isThemeStyle) ?? DEFAULT_STYLE,
      palette: readValidated(PALETTE_KEY, isThemePalette) ?? DEFAULT_PALETTE,
    });
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
          const local = readLocalSnapshot();
          const diverges = (
            ["frame", "glass", "bg", "theme", "dim", "style", "palette"] as const
          ).some((k) => remote.prefs[k] !== undefined && remote.prefs[k] !== local[k]);
          if (diverges) {
            void saveRemotePrefs(local);
          }
          return;
        }
        // "Untouched since mount" — with one deliberate widening (W3.1b §4a
        // Codex Medium): a key that was ABSENT at mount but now holds the
        // DEFAULT also counts as untouched. On a fresh store, any state
        // change in the fetch window (canvas, tone sample) re-runs the mirror
        // effect, which persists the DEFAULTS — that mirror write is not a
        // user edit and must not block the first-load remote apply.
        // ACCEPTED GAP (independent §4a review F1): a user who explicitly
        // picks the DEFAULT value on a fresh store inside the sub-second
        // fetch window is indistinguishable from the mirror write — an
        // edit-to-default does NOT bump the stamp (syncedEdited(null, dflt,
        // dflt) is false by the fresh-store rule), so a divergent remote
        // value would override that pick this once. Fresh-store-only,
        // default-pick-only, sub-second window, self-heals on the next
        // edit/reload; accepted over blocking every fresh device's first
        // remote apply.
        const untouched = (
          key: string,
          atMount: string | null,
          dflt: string,
        ): boolean => {
          try {
            const cur = window.localStorage.getItem(key);
            return cur === atMount || (atMount === null && cur === dflt);
          } catch {
            return true;
          }
        };
        // Apply each remote axis (guarded), and ECHO-SUPPRESS (plan C5
        // follow-up): write the applied value into storage IMMEDIATELY, so the
        // mirror effect's edited-gate reads prev === value and neither
        // re-stamps nor re-pushes an echo of what the server just told us.
        // Applying is not a local edit.
        const apply = <T extends string>(
          value: T | undefined,
          saved: T | null,
          key: string,
          atMount: string | null,
          dflt: string,
          setX: (v: T) => void,
        ): void => {
          if (value === undefined) return;
          if (value === saved) return;
          if (!untouched(key, atMount, dflt)) return;
          setX(value);
          writeKey(key, value);
        };
        apply(
          remote.prefs.frame,
          seededFrame,
          FRAME_KEY,
          rawFrameAtMount,
          DEFAULT_FRAME,
          setFrame,
        );
        apply(
          remote.prefs.glass,
          savedGlass,
          GLASS_KEY,
          rawGlassAtMount,
          DEFAULT_GLASS,
          setGlass,
        );
        apply(remote.prefs.bg, savedBg, BG_KEY, rawBgAtMount, DEFAULT_BG, setBg);
        apply(
          remote.prefs.theme,
          savedTheme,
          THEME_KEY,
          rawThemeAtMount,
          DEFAULT_THEME,
          setTheme,
        );
        apply(remote.prefs.dim, savedDim, DIM_KEY, rawDimAtMount, DEFAULT_DIM, setDim);
        apply(
          remote.prefs.style,
          savedStyle,
          STYLE_KEY,
          rawStyleAtMount,
          DEFAULT_STYLE,
          setStyle,
        );
        apply(
          remote.prefs.palette,
          savedPalette,
          PALETTE_KEY,
          rawPaletteAtMount,
          DEFAULT_PALETTE,
          setPalette,
        );
        return;
      }

      if (remote.kind === "empty") {
        // Seed the row from local values so an existing teacher's look reaches
        // their other devices (see the long rationale in theme-sync.ts). Seed
        // whenever ANY axis has a locally-stored value (W3.1b: full snapshot).
        const anyStored =
          rawFrameAtMount !== null ||
          rawGlassAtMount !== null ||
          rawBgAtMount !== null ||
          rawThemeAtMount !== null ||
          rawDimAtMount !== null ||
          rawStyleAtMount !== null ||
          rawPaletteAtMount !== null;
        if (anyStored) {
          void saveRemotePrefs(readLocalSnapshot());
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
    // Mount-only BY DESIGN: the frame/glass/bg/theme/dim reads above are the
    // INITIAL (cookie-derived prop) values via the mount closure — exactly
    // what the cookie→storage back-seed must compare (a later state change
    // re-running this load/seed/subscribe effect would be a bug).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cookie RENEWAL (FRAME-FLASH-SSR-DESIGN.md §3b, review must-change #2): the
  // mirror effect's write is change-gated (first-run skip + setX(same) no-ops),
  // so a teacher whose look never changes would let the cookie lapse at
  // Max-Age and the flash would silently return a year later. Re-write it once
  // per load, unconditionally, from the CURRENT state refs. Runs AFTER the
  // load effect above (declaration order), and idempotently repeats whatever
  // the mirror effect writes in the changed case. StrictMode double-run safe.
  const axesRef = useRef({ frame, glass, bg, theme, dim, style, palette });
  axesRef.current = { frame, glass, bg, theme, dim, style, palette };
  useEffect(() => {
    // Defer past this commit so the load effect's seeding setStates (if any)
    // land first and the renewal serializes the RECONCILED axes.
    const t = setTimeout(() => writeAxesCookie(axesRef.current), 0);
    return () => clearTimeout(t);
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
    // Stamp the last local write that CHANGES a SYNCED axis (the
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
    // W3.1b: the four widened axes normalize with their plain guards (no v1
    // remap exists for them; an unrecognized stored value degrades to the
    // fresh-store rule, same as style/palette).
    const normFrame = (v: string | null): string | null =>
      v !== null && isThemeFrame(v) ? v : null;
    const normGlass = (v: string | null): string | null =>
      v !== null && isThemeGlass(v) ? v : null;
    const normBg = (v: string | null): string | null =>
      v !== null && isThemeBg(v) ? v : null;
    const normDim = (v: string | null): string | null =>
      v !== null && isThemeDim(v) ? v : null;
    const syncedEdited = (
      prev: string | null,
      value: string,
      dflt: string,
    ): boolean => (prev === null ? value !== dflt : prev !== value);
    // Did any SYNCED axis actually change this run? W3.1b widened the synced
    // set from the v1 triple to the FULL persisted snapshot (frame/glass/bg/
    // theme/dim + the deprecated style/palette). The local stamp AND the
    // remote push key off the SAME condition. Derived tone and runtime canvas
    // are in this effect's dep array but NOT here — a push keyed on them
    // would write a fresh server updated_at without a matching local edit and
    // out-time (clobber) a genuine edit from another device (Wave-3 audit;
    // the original reason frame/glass/bg/dim were once excluded). Computed
    // from the raw stored values BEFORE the writeKey calls below update them,
    // so it reads "changed since last persisted". Remote-apply writes storage
    // in the apply() path first, so an applied value reads prev === value
    // here — no stamp, no echo push.
    const syncedAxisEdited =
      syncedEdited(normFrame(readKeyRaw(FRAME_KEY)), frame, DEFAULT_FRAME) ||
      syncedEdited(normGlass(readKeyRaw(GLASS_KEY)), glass, DEFAULT_GLASS) ||
      syncedEdited(normBg(readKeyRaw(BG_KEY)), bg, DEFAULT_BG) ||
      syncedEdited(normTheme(readKeyRaw(THEME_KEY)), theme, DEFAULT_THEME) ||
      syncedEdited(normDim(readKeyRaw(DIM_KEY)), dim, DEFAULT_DIM) ||
      syncedEdited(normStyle(readKeyRaw(STYLE_KEY)), style, DEFAULT_STYLE) ||
      syncedEdited(
        normPalette(readKeyRaw(PALETTE_KEY)),
        palette,
        DEFAULT_PALETTE,
      );
    if (syncedAxisEdited) {
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
    // SSR no-flash mirror (FRAME-FLASH-SSR-DESIGN.md §3b): pack the same axes
    // into the mc-theme-axes cookie so the server layout's NEXT render seeds
    // true attrs + provider initials. Sits inside this effect so it inherits
    // the first-run skip and every writer path (seeding, cross-tab, remote
    // apply) converges through it. localStorage stays the source of truth.
    writeAxesCookie({ frame, glass, bg, theme, dim, style, palette });

    // Best-effort cross-device push (no-op unless NEXT_PUBLIC_THEME_SYNC=1).
    // Gated on `syncedAxisEdited` so every server write carries a matching
    // local stamp (see the clobber note above) — never re-push an unchanged
    // snapshot. W3.1b: pushes the FULL persisted snapshot (5 v2 axes + the
    // deprecated compat pair).
    if (remoteSettledRef.current && syncedAxisEdited) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveRemotePrefs({ frame, glass, bg, theme, dim, style, palette });
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
