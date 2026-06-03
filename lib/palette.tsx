"use client";

// palette.tsx — React glue for the 20-color paired palette.
//
// Re-exports the pure data/resolver from `./palette` so `@/lib/palette`
// is the single import surface, and adds:
//   • PaletteContext       — { type, mapping }
//   • PaletteProvider      — context + CSS-variable bridge in one
//   • PaletteCssBridge     — injects `.cp-subj.<id>` overrides
//   • useSubjectColor()    — resolves a subject's colors from context
//   • usePalette()         — reads the raw context value

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { SubjectId } from "./types";
import { SUBJECTS } from "./mock/subjects";
import {
  DEFAULT_SUBJECT_MAPPING,
  PALETTE_BY_ID,
  resolveSubjectColor,
} from "./palette-data";
import type { PaletteType, SubjectColor, SubjectMapping } from "./palette-data";

// Re-export the data layer so callers need only `@/lib/palette`.
export * from "./palette-data";

interface PaletteContextValue {
  type: PaletteType;
  mapping: SubjectMapping;
}

const PaletteContext = createContext<PaletteContextValue>({
  type: "highlight",
  mapping: DEFAULT_SUBJECT_MAPPING,
});

/** Read the raw palette context ({ type, mapping }). */
export function usePalette(): PaletteContextValue {
  return useContext(PaletteContext);
}

/**
 * Resolve a subject's color tokens against the active PaletteContext.
 * Returns stripe/fill/deep colors plus card-background gradients.
 */
export function useSubjectColor(subjectId: SubjectId): SubjectColor {
  const { type, mapping } = useContext(PaletteContext);
  return useMemo(
    () => resolveSubjectColor(subjectId, type, mapping),
    [subjectId, type, mapping],
  );
}

/**
 * Inject CSS variables so the existing `.cp-subj.math { --c: … }` classes
 * follow the chosen palette type. Mount once near the app root; renders a
 * single <style> element.
 */
export function PaletteCssBridge(): ReactNode {
  const { type, mapping } = useContext(PaletteContext);
  const css = useMemo(() => {
    return SUBJECTS.map((s) => {
      const swatchId = mapping[s.id] ?? DEFAULT_SUBJECT_MAPPING[s.id];
      const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID["subj-1"];
      // v1.3 recipe (mirror resolveSubjectColor): the soft tint is the fill
      // (--cl), the bright/solid accent is the outline/stripe/dot (--c), and
      // text stays dark ink (--cd). Highlight palette → bright accent; Normal
      // → muted solid. Legacy swatches fall back to highlight + a mixed tint.
      const tint =
        swatch.tint ?? `color-mix(in oklch, ${swatch.normal} 18%, #fff)`;
      const c =
        type === "highlight"
          ? (swatch.bright ?? swatch.highlight)
          : swatch.normal;
      const cd = swatch.deep;
      return `.cp-subj.${s.id} { --c: ${c}; --cl: ${tint}; --cd: ${cd}; }`;
    }).join("\n");
  }, [type, mapping]);
  return <style>{css}</style>;
}

interface PaletteProviderProps {
  /** Saturation variant. HIGHLIGHT is the dev default. */
  type?: PaletteType;
  /** Subject → swatch assignment (Core Curriculum mapping). */
  mapping?: SubjectMapping;
  children: ReactNode;
}

/** Context provider + CSS bridge in one wrapper. */
export function PaletteProvider({
  type = "highlight",
  mapping = DEFAULT_SUBJECT_MAPPING,
  children,
}: PaletteProviderProps): ReactNode {
  const value = useMemo<PaletteContextValue>(
    () => ({ type, mapping }),
    [type, mapping],
  );
  return (
    <PaletteContext.Provider value={value}>
      <PaletteCssBridge />
      {children}
    </PaletteContext.Provider>
  );
}
