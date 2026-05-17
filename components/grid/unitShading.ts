// unitShading.ts — resolves the per-cell background tint for a subject row.
//
// Per planning_document §6.2, units cycle through three shade levels
// (light / medium / deep) of the same hue so a teacher can tell Unit 1
// from Unit 2 at a glance. The Weekly grid paints that shade onto the
// day/subject cell behind the lesson cards.
//
// §6.2 spec table — the shading expression depends on the style axis:
//   • Quiet      → neutral grayscale steps (color carries subject identity
//                  via the card stripe, not the cell; cells stay calm).
//   • Calm       → same as Quiet — reserved white-ish surface.
//   • Vivid      → subject-tint steps (light / mid / deep of the hue),
//                  the "Mid-Vivid" treatment from artboards-middle-v1.
//
// `shade` is the Unit.shade field (1 = light, 2 = medium, 3 = deep).

import type { ThemeStyle } from "@/lib/theme";
import type { SubjectColor } from "@/lib/palette";

/** Background + accent colors for a day/subject cell. */
export interface CellShade {
  /** Cell background fill. */
  bg: string;
  /** Hover/drop-target accent (subject-tinted). */
  accent: string;
}

// Grayscale steps for Quiet / Calm — three near-white neutrals so unit
// boundaries read without competing with the subject-colored cards.
const GRAY_STEPS: Record<number, string> = {
  1: "color-mix(in oklch, var(--ink-100) 45%, transparent)",
  2: "color-mix(in oklch, var(--ink-150) 60%, transparent)",
  3: "color-mix(in oklch, var(--ink-200) 65%, transparent)",
};

/**
 * Resolve the cell shade for a subject row under the active style.
 *
 * @param style   the card-style axis (quiet / calm / vivid)
 * @param color   the resolved subject color tokens
 * @param shade   Unit.shade (1–3); falls back to 2 if out of range
 */
export function resolveCellShade(
  style: ThemeStyle,
  color: SubjectColor,
  shade: number,
): CellShade {
  const step = shade === 1 || shade === 2 || shade === 3 ? shade : 2;

  if (style === "vivid") {
    // Subject-tint steps — a faint wash of the subject hue. Kept very low
    // so the cards (which carry the strong color in Vivid) stay dominant.
    const pct = step === 1 ? 6 : step === 2 ? 11 : 17;
    return {
      bg: `color-mix(in oklch, ${color.c} ${pct}%, var(--paper))`,
      accent: color.c,
    };
  }

  // Quiet + Calm — neutral grayscale steps, subject-tinted accent only.
  return {
    bg: GRAY_STEPS[step],
    accent: color.c,
  };
}
