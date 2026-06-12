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
import { loadRemotePrefs, saveRemotePrefs } from "./theme-sync";

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

/** The card-style values, exported so consumers validate against ONE list. */
export const STYLE_VALUES: readonly ThemeStyle[] = ["quiet", "calm", "vivid"];
/** The palette values, exported for the same single-source reason. */
export const PALETTE_VALUES: readonly ThemePalette[] = [
  "normal",
  "highlight",
];

// Cross-fade pulse window. When the RESOLVED app theme actually changes, the
// mirror effect sets `data-theme-transition` on <html> for this long so the CSS
// under :root[data-theme-transition] (shipped by the theme-polish work) can
// cross-fade the color swap, then removes it. Kept just above the CSS transition
// duration so the attribute outlives the fade.
const THEME_TRANSITION_MS = 220;

// Debounce window for the best-effort remote write. Rapid toggling (e.g. arrow-
// keying through the theme picker) collapses into a single saveRemotePrefs call
// this long after the last change. Local state + localStorage update instantly;
// only the cross-device push is deferred.
const REMOTE_SAVE_DEBOUNCE_MS = 800;

/** Allowlist guards — exported so lib/theme-sync.ts (and any future consumer)
 *  validates against THIS file's lists instead of keeping duplicates. The two
 *  copies that must stay literal regardless are the inline boot script in
 *  lib/theme-init.tsx and the SQL CHECK constraints (see COUPLING headers). */
export function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === "system" || APP_THEMES.includes(v as AppTheme);
}
export function isThemeStyle(v: unknown): v is ThemeStyle {
  return STYLE_VALUES.includes(v as ThemeStyle);
}
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
    // Guards async state-sets (the remote load below) against a unmount that
    // races the in-flight promise.
    let active = true;

    const savedStyle = readValidated(STYLE_KEY, isThemeStyle);
    if (savedStyle !== null) setStyle(savedStyle);
    const savedPalette = readValidated(PALETTE_KEY, isThemePalette);
    if (savedPalette !== null) setPalette(savedPalette);
    const savedTheme = readValidated(THEME_KEY, isThemeSetting);
    if (savedTheme !== null) setTheme(savedTheme);

    // Cross-device sync (best-effort, OFF unless NEXT_PUBLIC_THEME_SYNC=1). After
    // the synchronous localStorage reconciliation above, pull the teacher's
    // remote prefs. loadRemotePrefs() returns a discriminated result and no-ops
    // (kind "unavailable") in the default prototype path, so this whole branch is
    // inert until the flag flips.
    void loadRemotePrefs().then((remote) => {
      // Settle BEFORE applying/seeding: the mirror effect refuses to schedule
      // remote saves until the initial remote read has resolved, so a device with
      // stale localStorage can never upsert over newer remote prefs during the
      // load race.
      remoteSettledRef.current = true;
      if (!active) return;

      if (remote.kind === "loaded") {
        // A row exists — adopt its values for axes the user hasn't touched since
        // mount, so the look follows them across devices. The mirror effect
        // persists every user change to localStorage synchronously, so a re-read
        // that differs from the mount-time capture means the user changed that
        // axis while this read was in flight — their fresh choice wins over the
        // (older) remote value. Each applied setState re-runs the mirror effect,
        // which (now that remoteSettledRef is true) pushes the reconciled triple
        // back, keeping every device's row in agreement.
        const untouched = (key: string, atMount: string | null): boolean => {
          try {
            return window.localStorage.getItem(key) === atMount;
          } catch {
            return true;
          }
        };
        if (
          remote.prefs.style !== undefined &&
          remote.prefs.style !== savedStyle &&
          untouched(STYLE_KEY, savedStyle)
        ) {
          setStyle(remote.prefs.style);
        }
        if (
          remote.prefs.palette !== undefined &&
          remote.prefs.palette !== savedPalette &&
          untouched(PALETTE_KEY, savedPalette)
        ) {
          setPalette(remote.prefs.palette);
        }
        if (
          remote.prefs.theme !== undefined &&
          remote.prefs.theme !== savedTheme &&
          untouched(THEME_KEY, savedTheme)
        ) {
          setTheme(remote.prefs.theme);
        }
        return;
      }

      if (remote.kind === "empty") {
        // The query succeeded and the teacher has NO row yet. This is the common
        // first-load state at rollout for an existing teacher whose look lives
        // only in localStorage. Seed the row from the authoritative local values
        // (re-read here so a change made during the in-flight read is captured)
        // so their existing look reaches their other devices. The mirror effect
        // alone would NOT do this: its setStates from localStorage land before
        // remoteSettledRef flips, so its post-settle save never fires without a
        // later change. Skip brand-new users with no stored prefs at all — there
        // is nothing to preserve, and their first real change persists via the
        // mirror effect (remoteSettledRef is true by now). Gated on `active`
        // like the apply path above: under React StrictMode's dev mount/unmount/
        // remount, the first (inactive) read is skipped and only the live mount
        // seeds, so the row is never written twice.
        const localStyle = readValidated(STYLE_KEY, isThemeStyle);
        const localPalette = readValidated(PALETTE_KEY, isThemePalette);
        const localTheme = readValidated(THEME_KEY, isThemeSetting);
        if (localStyle !== null || localPalette !== null || localTheme !== null) {
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
      active = false;
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
  // The last RESOLVED theme actually painted to <html>. Seeded on the first run
  // from the DOM (what the boot script painted), NOT from React's default state
  // — otherwise the load effect's catch-up to the persisted value would look
  // like a change and fire a spurious cross-fade on every page load.
  const prevResolvedRef = useRef<AppTheme | null>(null);
  // Timers for the cross-fade attribute removal and the debounced remote save;
  // held in refs so successive runs can cancel a pending one (clearTimeout-safe
  // across rapid switches).
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the initial loadRemotePrefs() has resolved (with OR without a
  // row). Until then the mirror effect must NOT schedule remote saves — a
  // device booting with stale localStorage would otherwise upsert those stale
  // values over newer remote prefs while the read was still in flight.
  const remoteSettledRef = useRef(false);
  useEffect(() => {
    const root = document.documentElement;

    if (!mounted.current) {
      mounted.current = true;
      // Baseline the cross-fade tracker from the live DOM (boot-script paint),
      // so the first real change is measured against what is actually on screen.
      const painted = root.dataset.theme;
      prevResolvedRef.current = APP_THEMES.includes(painted as AppTheme)
        ? (painted as AppTheme)
        : resolvedTheme;
      return;
    }

    // Cross-fade trigger (CONTRACT with the theme cross-fade CSS): ONLY when the
    // resolved app theme actually changes from the previously-painted value —
    // not on style/palette-only changes, and not on this skipped first run. Set
    // `data-theme-transition` BEFORE writing dataset.theme so the CSS under
    // :root[data-theme-transition] cross-fades the swap, then remove it after the
    // pulse window. clearTimeout makes rapid theme switches collapse to one
    // attribute lifetime rather than a premature removal mid-fade.
    if (resolvedTheme !== prevResolvedRef.current) {
      root.setAttribute("data-theme-transition", "");
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => {
        root.removeAttribute("data-theme-transition");
        transitionTimerRef.current = null;
      }, THEME_TRANSITION_MS);
    }

    root.dataset.style = style;
    root.dataset.palette = palette;
    root.dataset.theme = resolvedTheme;
    prevResolvedRef.current = resolvedTheme;
    // Persist the SETTING for theme (may be "system"); style/palette are
    // already concrete. Reads validate against the same allowlists.
    writeKey(STYLE_KEY, style);
    writeKey(PALETTE_KEY, palette);
    writeKey(THEME_KEY, theme);

    // Best-effort cross-device push (no-op unless NEXT_PUBLIC_THEME_SYNC=1).
    // Debounced so rapid toggling collapses to one write; localStorage above is
    // the immediate source of truth, so a failed/slow remote save never delays
    // or affects the local paint. saveRemotePrefs swallows its own errors.
    // Gated on the initial remote read having settled (remoteSettledRef) so a
    // boot race can never push stale local values over newer remote ones.
    if (remoteSettledRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveRemotePrefs({ theme, style, palette });
        saveTimerRef.current = null;
      }, REMOTE_SAVE_DEBOUNCE_MS);
    }
  }, [style, palette, resolvedTheme, theme]);

  // Clear any pending pulse/save timers on unmount so they cannot fire against a
  // torn-down tree.
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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
