// lib/teach/backgrounds.ts — the teaching-board background catalog (Teach
// Phase 3). Mirrors classroomscreen's "Backgrounds" picker: 15 solid colours,
// 15 repeating patterns, and 15 seamless repeating gradients — all tileable.
//
// The actual CSS lives in app/tokens.css as `--teach-bg-<id>` custom properties
// (the token source where hex belongs). This module is metadata only: the id,
// human label, category, and a tiny helper that resolves an id to the
// `var(--teach-bg-<id>)` reference a board applies. Tokens-only rule intact —
// no component ever names a hex; it names a background id.

/** Which tab a background lives under in the picker. */
export type BoardBackgroundCategory =
  | "solid"
  | "lines"
  | "pattern"
  | "gradient";

export interface BoardBackgroundMeta {
  /** Stable id, persisted on `Board.background` (e.g. "solid-4"). */
  id: string;
  category: BoardBackgroundCategory;
  /** Human label shown under the swatch. */
  label: string;
  /** CSS custom-property name backing this background (without `var()`). */
  cssVar: string;
  /** True for the dark fills — the picker flags these so a teacher knows the
   *  board chrome flips to a light-on-dark read. (Widget tiles stay on paper.) */
  dark?: boolean;
}

/** Build a category's 15 entries. Labels are 1-based for teacher legibility. */
function build(
  category: BoardBackgroundCategory,
  prefix: string,
  labelWord: string,
  darkIds: number[] = [],
): BoardBackgroundMeta[] {
  return Array.from({ length: 15 }, (_, i) => {
    const n = i + 1;
    return {
      id: `${prefix}-${n}`,
      category,
      label: `${labelWord} ${n}`,
      cssVar: `--teach-bg-${prefix}-${n}`,
      dark: darkIds.includes(n) || undefined,
    };
  });
}

/** Ruled-paper styles (Teach Wave 2, B5) — the line work teachers expect on a
 *  sheet: ruled, graph/grid, dot grid, Cornell (cue-column), and primary
 *  handwriting (3-line). Named ids (not numbered) since the set is curated, not
 *  a 15-swatch family. The CSS lives in tokens.css as `--teach-bg-paper-*`. */
const PAPER_STYLES: readonly BoardBackgroundMeta[] = [
  { id: "lines-lined", category: "lines", label: "Lined", cssVar: "--teach-bg-paper-lined" },
  { id: "lines-grid", category: "lines", label: "Grid", cssVar: "--teach-bg-paper-grid" },
  { id: "lines-dot", category: "lines", label: "Dot grid", cssVar: "--teach-bg-paper-dot" },
  { id: "lines-cornell", category: "lines", label: "Cornell", cssVar: "--teach-bg-paper-cornell" },
  {
    id: "lines-handwriting",
    category: "lines",
    label: "Handwriting",
    cssVar: "--teach-bg-paper-handwriting",
  },
];

/** Solids 13–15 are the dark fills; gradients 14–15 are dark too. */
export const BOARD_BACKGROUNDS: readonly BoardBackgroundMeta[] = [
  ...build("solid", "solid", "Colour", [13, 14, 15]),
  ...PAPER_STYLES,
  ...build("pattern", "pattern", "Pattern"),
  ...build("gradient", "gradient", "Gradient", [14, 15]),
];

const BY_ID = new Map(BOARD_BACKGROUNDS.map((b) => [b.id, b]));

/** The ordered category tabs. */
export const BOARD_BACKGROUND_CATEGORIES: readonly {
  id: BoardBackgroundCategory;
  label: string;
}[] = [
  { id: "solid", label: "Colours" },
  { id: "lines", label: "Lined" },
  { id: "pattern", label: "Patterns" },
  { id: "gradient", label: "Gradients" },
];

/** Look up a background by id (null/unknown → undefined). */
export function findBackground(
  id: string | null | undefined,
): BoardBackgroundMeta | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Resolve a board's `background` id to the CSS value to apply, or undefined to
 *  fall back to the default paper surface. Used both for the live board and the
 *  picker swatches so they never drift. */
export function boardBackgroundCss(
  id: string | null | undefined,
): string | undefined {
  const meta = findBackground(id);
  return meta ? `var(${meta.cssVar})` : undefined;
}

/** Whether a background id is one of the dark fills (board chrome adapts). */
export function isDarkBackground(id: string | null | undefined): boolean {
  return findBackground(id)?.dark === true;
}
