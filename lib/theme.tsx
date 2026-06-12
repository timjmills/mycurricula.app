"use client";

// theme.tsx — the app-wide theme provider.
//
// Three independent axes drive every visual surface:
//   • style       ∈ { quiet, calm, vivid }                      — card treatment
//   • paletteType ∈ { normal, highlight }                       — subject-color saturation
//   • theme       ∈ { paper, cloud, night, mint, sky, blossom } — app-wide color theme
//
// All three are written to <html> as data attributes (`data-style`,
// `data-palette`, `data-theme`) so CSS in tokens.css can react without a
// re-render, and are exposed via the useTheme() hook for components that
// branch in JS. This provider also mounts PaletteProvider so subject colors
// follow `paletteType` automatically.
//
// The theme axis also accepts the stored sentinel "system", which resolves
// to `night` or `paper` from `prefers-color-scheme`. The SETTING (which may
// be "system") is what we persist + expose as `theme`; the RESOLVED value
// (always a concrete AppTheme, never "system") is what we paint and expose as
// `resolvedTheme`. "system" must never reach the DOM.
//
// Persistence: all three axes write through to localStorage under the
// `mycurricula:user:*` keys so a teacher's choices survive a reload (this
// closes the prior audit gap where style + palette reset on every load). The
// no-FOUC boot script in lib/theme-init.tsx paints the persisted attributes
// BEFORE first paint; the mirror effect below deliberately skips its first
// run so it does not clobber what the boot script already painted.
//
// COUPLING — READ BEFORE EDITING: the theme/style/palette allowlists and the
// "system" → night/paper resolution here MUST stay in lockstep with the
// inline script in lib/theme-init.tsx. If they drift, a value one file accepts
// and the other rejects breaks SILENTLY (wrong attribute, no error).
//
// HIGHLIGHT is the development default; NORMAL must remain fully working.

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

/** Card-style axis. */
export type ThemeStyle = "quiet" | "calm" | "vivid";

/** Saturation axis — alias of the palette type. */
export type ThemePalette = PaletteType;

/** App-wide color theme — the concrete, paintable values. */
export type AppTheme = "paper" | "cloud" | "night" | "mint" | "sky" | "blossom";

/** The stored theme choice — an AppTheme, or "system" (resolved at runtime). */
export type ThemeSetting = AppTheme | "system";

/** The six concrete themes, in picker order. */
export const APP_THEMES: readonly AppTheme[] = [
  "paper",
  "cloud",
  "night",
  "mint",
  "sky",
  "blossom",
];

/** App defaults — the Vivid style paired with the Highlight palette. */
export const DEFAULT_STYLE: ThemeStyle = "vivid";
export const DEFAULT_PALETTE: ThemePalette = "highlight";
/** Default theme setting. Paper is the light baseline the artboards target. */
export const DEFAULT_THEME: ThemeSetting = "paper";

interface ThemeContextValue {
  style: ThemeStyle;
  palette: ThemePalette;
  /** The stored theme choice (may be "system"). */
  theme: ThemeSetting;
  /** The concrete theme actually painted (never "system"). */
  resolvedTheme: AppTheme;
  setStyle: (s: ThemeStyle) => void;
  setPalette: (p: ThemePalette) => void;
  setTheme: (t: ThemeSetting) => void;
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
// validated against an allowlist; anything unrecognized is ignored so a
// stale or hand-edited value can never paint an invalid attribute. All
// access is SSR-guarded + try/catch wrapped (private-mode / quota safe),
// mirroring lib/tooltip-dismissal.ts and lib/labels.tsx.

const THEME_KEY = "mycurricula:user:theme";
const STYLE_KEY = "mycurricula:user:theme-style";
const PALETTE_KEY = "mycurricula:user:theme-palette";

const STYLE_VALUES: readonly ThemeStyle[] = ["quiet", "calm", "vivid"];
const PALETTE_VALUES: readonly ThemePalette[] = ["normal", "highlight"];

function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === "system" || APP_THEMES.includes(v as AppTheme);
}
function isThemeStyle(v: unknown): v is ThemeStyle {
  return STYLE_VALUES.includes(v as ThemeStyle);
}
function isThemePalette(v: unknown): v is ThemePalette {
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

/** Persist a single key, silently ignoring storage failures (private mode). */
function writeKey(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Swallow — quota or disabled-storage errors are non-fatal.
  }
}

/** Resolve a possibly-"system" setting to a concrete theme. */
function resolveTheme(setting: ThemeSetting, systemDark: boolean): AppTheme {
  if (setting === "system") return systemDark ? "night" : "paper";
  return setting;
}

interface ThemeProviderProps {
  /** Initial card style. */
  initialStyle?: ThemeStyle;
  /** Initial palette type. */
  initialPalette?: ThemePalette;
  /** Initial theme setting. */
  initialTheme?: ThemeSetting;
  /** Core Curriculum subject → swatch mapping passed to PaletteProvider. */
  mapping?: SubjectMapping;
  children: ReactNode;
}

/**
 * Provides theme state, mirrors all three axes onto
 * <html data-style data-palette data-theme>, and wraps children in a
 * PaletteProvider bound to the palette axis.
 *
 * Hydration model: the useState initializers ALWAYS return the passed
 * initial* / defaults (never read localStorage), so the server-rendered HTML
 * and the first client render match exactly — the repo's SSR convention.
 * Persisted values are loaded in a post-mount effect; the boot script in
 * lib/theme-init.tsx has already painted them onto <html>, so the load effect
 * only reconciles React state, and the mirror effect skips its first run to
 * avoid clobbering the boot script's attributes with the defaults.
 */
export function ThemeProvider({
  initialStyle = DEFAULT_STYLE,
  initialPalette = DEFAULT_PALETTE,
  initialTheme = DEFAULT_THEME,
  mapping,
  children,
}: ThemeProviderProps): ReactNode {
  const [style, setStyle] = useState<ThemeStyle>(initialStyle);
  const [palette, setPalette] = useState<ThemePalette>(initialPalette);
  const [theme, setTheme] = useState<ThemeSetting>(initialTheme);
  // Tracks the OS dark-mode preference, used only when theme === "system".
  const [systemDark, setSystemDark] = useState(false);

  // Load effect — declared FIRST so it runs before the mirror effect on
  // mount. Reads + validates the persisted axes and reconciles state; reads
  // the OS color-scheme preference and subscribes to changes; subscribes to
  // cross-tab `storage` events so a change made in another tab (e.g. via the
  // Settings picker) reflects here. SSR never runs this path.
  useEffect(() => {
    const savedStyle = readValidated(STYLE_KEY, isThemeStyle);
    if (savedStyle !== null) setStyle(savedStyle);
    const savedPalette = readValidated(PALETTE_KEY, isThemePalette);
    if (savedPalette !== null) setPalette(savedPalette);
    const savedTheme = readValidated(THEME_KEY, isThemeSetting);
    if (savedTheme !== null) setTheme(savedTheme);

    // OS dark-mode preference + live subscription (drives "system").
    // `unsubscribeScheme` is assigned ONLY after addEventListener succeeds, so
    // cleanup can never call removeEventListener on a MediaQueryList that
    // failed to subscribe (older WebKit lacks add/removeEventListener here).
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
      // matchMedia/addEventListener unavailable — "system" falls back to
      // its paper default and never live-updates on this browser.
    }

    // Cross-tab sync: re-validate + apply changes from OTHER tabs.
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STYLE_KEY) {
        const v = readValidated(STYLE_KEY, isThemeStyle);
        if (v !== null) setStyle(v);
      } else if (e.key === PALETTE_KEY) {
        const v = readValidated(PALETTE_KEY, isThemePalette);
        if (v !== null) setPalette(v);
      } else if (e.key === THEME_KEY) {
        const v = readValidated(THEME_KEY, isThemeSetting);
        if (v !== null) setTheme(v);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      if (unsubscribeScheme) unsubscribeScheme();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedTheme = useMemo<AppTheme>(
    () => resolveTheme(theme, systemDark),
    [theme, systemDark],
  );

  // Mirror effect — declared SECOND. Writes the three axes onto <html> and
  // persists them. It SKIPS its first invocation: the boot script in
  // lib/theme-init.tsx already painted the correct attributes pre-paint, and
  // running on mount would overwrite them with the (default) initializer
  // state for a frame — the exact FOUC the boot script exists to prevent.
  //
  // The guard skips only the FIRST run. When the load effect's setStates land
  // (i.e. stored values actually differed from the defaults), this effect
  // re-runs and that second invocation DOES write/persist. If no stored
  // values existed (fresh user), state never changes, the effect never
  // re-runs, and that is correct: the server-rendered defaults are already on
  // <html> and there is nothing to persist yet.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const root = document.documentElement;
    root.dataset.style = style;
    root.dataset.palette = palette;
    root.dataset.theme = resolvedTheme;
    // Persist the SETTING for theme (may be "system"); style/palette are
    // already concrete. Reads validate against the same allowlists.
    writeKey(STYLE_KEY, style);
    writeKey(PALETTE_KEY, palette);
    writeKey(THEME_KEY, theme);
  }, [style, palette, resolvedTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      style,
      palette,
      theme,
      resolvedTheme,
      setStyle,
      setPalette,
      setTheme,
    }),
    [style, palette, theme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaletteProvider type={palette} mapping={mapping}>
        {children}
      </PaletteProvider>
    </ThemeContext.Provider>
  );
}
