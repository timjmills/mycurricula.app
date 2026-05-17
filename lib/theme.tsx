"use client";

// theme.tsx — the app-wide theme provider.
//
// Two independent axes drive every visual surface:
//   • style       ∈ { quiet, calm, vivid }   — card treatment
//   • paletteType ∈ { normal, highlight }     — subject-color saturation
//
// Both are written to <html> as data attributes (`data-style`,
// `data-palette`) so CSS in tokens.css can react without a re-render, and
// are exposed via the useTheme() hook for components that branch in JS.
// This provider also mounts PaletteProvider so subject colors follow
// `paletteType` automatically.
//
// HIGHLIGHT is the development default; NORMAL must remain fully working.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PaletteProvider } from "./palette";
import type { PaletteType, SubjectMapping } from "./palette";

/** Card-style axis. */
export type ThemeStyle = "quiet" | "calm" | "vivid";

/** Saturation axis — alias of the palette type. */
export type ThemePalette = PaletteType;

/** Dev defaults. HIGHLIGHT is the default palette per the design brief. */
export const DEFAULT_STYLE: ThemeStyle = "quiet";
export const DEFAULT_PALETTE: ThemePalette = "highlight";

interface ThemeContextValue {
  style: ThemeStyle;
  palette: ThemePalette;
  setStyle: (s: ThemeStyle) => void;
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

interface ThemeProviderProps {
  /** Initial card style. */
  initialStyle?: ThemeStyle;
  /** Initial palette type. */
  initialPalette?: ThemePalette;
  /** Core Curriculum subject → swatch mapping passed to PaletteProvider. */
  mapping?: SubjectMapping;
  children: ReactNode;
}

/**
 * Provides theme state, mirrors it onto <html data-style data-palette>,
 * and wraps children in a PaletteProvider bound to the palette axis.
 */
export function ThemeProvider({
  initialStyle = DEFAULT_STYLE,
  initialPalette = DEFAULT_PALETTE,
  mapping,
  children,
}: ThemeProviderProps): ReactNode {
  const [style, setStyle] = useState<ThemeStyle>(initialStyle);
  const [palette, setPalette] = useState<ThemePalette>(initialPalette);

  // Mirror both axes onto the document element so CSS can key off them.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.style = style;
    root.dataset.palette = palette;
  }, [style, palette]);

  const value = useMemo<ThemeContextValue>(
    () => ({ style, palette, setStyle, setPalette }),
    [style, palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaletteProvider type={palette} mapping={mapping}>
        {children}
      </PaletteProvider>
    </ThemeContext.Provider>
  );
}
