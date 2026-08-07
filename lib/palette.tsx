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

// ── CSS-colour grammar guard ──────────────────────────────────────────────────
// PaletteCssBridge interpolates colour values into a <style> element. Today
// every value it can reach comes from the static PALETTE_BY_ID table or is a
// `var(--subj-N-*)` reference this file constructs, so the sink is closed by
// construction. The subjects-as-data build (Phase 1B) makes subject colours
// TEAM-WRITABLE, and docs/audits/2026-07-31-subject-colour-system.md flags this
// interpolation as the CSS-injection sink that arms at that moment: a stored
// string reaching a stylesheet can close the declaration and write arbitrary
// rules for every teammate — a cross-tenant vector, not a rendering bug.
//
// This guard makes that future misuse fail CLOSED. Values must match a strict
// colour grammar: a hex literal, or one of var()/rgb()/rgba()/hsl()/hsla()/
// oklch()/color-mix()/linear-gradient() whose argument span cannot contain
// `; { } < > @` or `url(` — the characters/tokens needed to escape a
// declaration, open a new rule, or fetch remote content. Anything else emits
// the neutral fallback instead of the stored value. Validation ALSO belongs at
// the write boundary when subject colours become editable; this read-side
// guard is defence-in-depth, not the whole answer.
const SAFE_CSS_COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|(?:var|rgb|rgba|hsl|hsla|oklch|color-mix|linear-gradient)\((?:(?!url\()[^;{}<>@])*\))$/;

/** Neutral emission used when a colour value fails the grammar — visibly grey,
 *  never the unvalidated string. */
const REJECTED_COLOR_FALLBACK = "var(--idle)";

/**
 * Return `value` when it matches the strict CSS-colour grammar above, else the
 * neutral fallback. Exported for tests; PaletteCssBridge passes every
 * interpolated value through it.
 */
export function guardCssColor(value: string): string {
  return SAFE_CSS_COLOR_RE.test(value) ? value : REJECTED_COLOR_FALLBACK;
}

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
 *
 * Dual-emits both the v1 trio (`--c/--cl/--cd`) and the v2 trio
 * (`--sc/--sct/--sci`, consumed by v2 modes.css). Both trios derive from the
 * SAME context mapping — which is seeded from `DEFAULT_SUBJECT_MAPPING` and now
 * carries the handoff's subject→slot map, so this global rule is correct for
 * both the v2 and the flag-OFF v1 path. (It previously carried a divergent map,
 * with the handoff's map parked in a second constant awaiting per-callsite
 * inline emission that never landed. That constant is gone and this is now the
 * only subject→slot map, so there is no remap to apply anywhere else.)
 */
export function PaletteCssBridge(): ReactNode {
  const { mapping } = useContext(PaletteContext);
  const css = useMemo(() => {
    return SUBJECTS.map((s) => {
      // Selector-position twin of the value guard above: an id reaching a
      // SELECTOR can escape with `{`/`}` just as a value can with `;`. Static
      // ids always pass today; a future data-driven id that doesn't is dropped
      // wholesale rather than interpolated.
      if (!/^[a-z][a-z0-9-]*$/.test(s.id)) return "";
      const swatchId = mapping[s.id] ?? DEFAULT_SUBJECT_MAPPING[s.id];
      const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID["subj-1"];
      // v1.3 recipe (mirror resolveSubjectColor): the soft tint is the fill
      // (--cl), the solid accent is the outline/stripe/dot (--c), and
      // text stays dark ink (--cd).
      //
      // For v1.3 slots (id `subj-N`) emit token REFERENCES so the night theme's
      // per-slot overrides in tokens.css cascade through. Legacy swatches have
      // no token family, so they keep their hexes — with the tint fallback
      // mixing toward var(--tint-base) (white on light, dark surface on night).
      // ADDITIVE v2 emission: alongside the v1 `--c/--cl/--cd` trio, also emit
      // the v2 `--sc/--sct/--sci` trio (subject-color / subject-tint /
      // subject-ink) that v2 modes.css consumes. Both trios read the SAME
      // context mapping, so a subject is the same hue whichever trio a surface
      // consumes — that is the property that makes this emission the whole
      // subject-colour path rather than a fallback for some inline one.
      // data-palette RETIREMENT (2026-08-07, decision 4): the emission no
      // longer branches on the palette type. The v2 handoff's own exemplar
      // (7.2 design-system/modes.css:19) wires `--sc: var(--subj-N)` — the
      // BASE solid — and reserves `-bright` for dots/outlines consumed via
      // their own token tier. The old "highlight" branch emitted bright for
      // EVERYTHING, which is why every route visibly shifted hue seconds
      // after load when the stored preference arrived (first paint was this
      // base emission; the flip took it to the over-bright one). First paint
      // is now the final hue by construction. The deprecated axis state in
      // lib/theme.tsx keeps flipping <html data-palette> for the v1
      // flag-OFF path until that path is deleted; nothing here reads it.
      if (/^subj-\d+$/.test(swatch.id)) {
        const c = `var(--${swatch.id})`;
        const cl = `var(--${swatch.id}-tint)`;
        const cd = `var(--${swatch.id}-ink)`;
        return `.cp-subj.${s.id} { --c: ${c}; --cl: ${cl}; --cd: ${cd}; --sc: ${c}; --sct: ${cl}; --sci: ${cd}; }`;
      }
      const tint = guardCssColor(
        swatch.tint ??
          `color-mix(in oklch, ${swatch.normal} 18%, var(--tint-base))`,
      );
      const c = guardCssColor(swatch.normal);
      const cd = guardCssColor(swatch.deep);
      return `.cp-subj.${s.id} { --c: ${c}; --cl: ${tint}; --cd: ${cd}; --sc: ${c}; --sct: ${tint}; --sci: ${cd}; }`;
    }).join("\n");
  }, [mapping]);
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
