// palette.jsx — The 25-color paired palette + theme system.
//
// Architecture per latest decision:
//   • Core Curriculum has ONE subject → swatch_id mapping, set by the
//     team lead. All teachers see the same hue family for each subject.
//   • Each swatch is a PAIR: a Normal (saturated, school-workbook tone)
//     and a Highlight (electric highlighter-marker tone). The two are
//     DIFFERENT aesthetics, not just light/dark of the same color.
//   • Each teacher picks Normal or Highlight as a viewing preference.
//   • The chosen palette ALSO tints the menu chrome (sidebars, top
//     bar, nav) — described in <PaletteCssBridge> below.
//   • The chosen palette does NOT affect the three view modes
//     (Advanced grid, Simple, Task). Those keep their own neutral
//     chrome so the mode toggle reads as a structural switch, not
//     a color one.
//   • Personal subjects: the teacher picks their own swatch from the
//     same 25-color pool.
//   • Modified lessons: dashed stripe in the subject color.

// ── The 25 paired swatches ─────────────────────────────────────────
//
//   normal     — confident saturated hex. School-workbook feel. Slight
//                green-shift in the warm hues, slight grey-shift in
//                the cool hues, so the family reads as "serious".
//   highlight  — electric highlighter-marker hex. Candy-bright, very
//                light, distinctly highlighter — Stabilo / Mildliner
//                inspired. NOT a desaturated normal. The hue shifts
//                slightly across the pair so the two aesthetics
//                aren't twins.
//   deep       — text-on-color hex (~700-800), AA on both fills.
//
// Order: blues → teals → greens → yellows → warms → reds → pinks →
//        purples → browns → neutrals. 25 swatches give enough variety
//        for 8 team subjects + 8-10 personal subjects + room to grow.
const PALETTE_25 = [
  // Blues
  { id: "navy",      name: "Navy",      normal: "#0E2A6B", highlight: "#5DA9FF", deep: "#06133A" },
  { id: "ocean",     name: "Ocean",     normal: "#1A4ED9", highlight: "#7FB6FF", deep: "#0C2870" },
  { id: "sky",       name: "Sky",       normal: "#1373C9", highlight: "#74D0FF", deep: "#0B416E" },
  { id: "cyan",      name: "Cyan",      normal: "#0F7E92", highlight: "#7DEAF7", deep: "#06414C" },
  // Teals / mints
  { id: "teal",      name: "Teal",      normal: "#0A7E72", highlight: "#7CECDE", deep: "#053A33" },
  { id: "mint",      name: "Mint",      normal: "#0E9385", highlight: "#A8F7DA", deep: "#054E45" },
  // Greens
  { id: "leaf",      name: "Leaf",      normal: "#188542", highlight: "#9CF488", deep: "#093D1F" },
  { id: "forest",    name: "Forest",    normal: "#1F5B23", highlight: "#A8E89B", deep: "#0D2C0F" },
  { id: "olive",     name: "Olive",     normal: "#5A6B14", highlight: "#E0F095", deep: "#2C340A" },
  // Yellows
  { id: "lemon",     name: "Lemon",     normal: "#B58400", highlight: "#FFF176", deep: "#4E380A" },
  { id: "amber",     name: "Amber",     normal: "#A66A0E", highlight: "#FFD86B", deep: "#502F08" },
  // Warms
  { id: "apricot",   name: "Apricot",   normal: "#C2671E", highlight: "#FFBE76", deep: "#5A2C0A" },
  { id: "orange",    name: "Orange",    normal: "#D04A0E", highlight: "#FFA45D", deep: "#641F05" },
  { id: "coral",     name: "Coral",     normal: "#C7401E", highlight: "#FFA984", deep: "#581A09" },
  // Reds / pinks
  { id: "red",       name: "Red",       normal: "#BA1F1F", highlight: "#FF8A8A", deep: "#5A0808" },
  { id: "rose",      name: "Rose",      normal: "#BA1A41", highlight: "#FF95AB", deep: "#5B0A1E" },
  { id: "blush",     name: "Blush",     normal: "#B22368", highlight: "#FFA1C9", deep: "#560E36" },
  { id: "magenta",   name: "Magenta",   normal: "#9C1377", highlight: "#FF9DDC", deep: "#460835" },
  // Purples
  { id: "plum",      name: "Plum",      normal: "#6E1788", highlight: "#DAA1F2", deep: "#330842" },
  { id: "violet",    name: "Violet",    normal: "#4F1FAA", highlight: "#B496FF", deep: "#220A5C" },
  { id: "lavender",  name: "Lavender",  normal: "#5E2EE0", highlight: "#C7A8FF", deep: "#2A1170" },
  { id: "indigo",    name: "Indigo",    normal: "#2B2D7F", highlight: "#9098FF", deep: "#13144C" },
  // Browns / neutrals
  { id: "brown",     name: "Brown",     normal: "#7C4A1E", highlight: "#E0BD8E", deep: "#3A1F08" },
  { id: "slate",     name: "Slate",     normal: "#3E4A65", highlight: "#A8B2C8", deep: "#1B2233" },
  { id: "charcoal",  name: "Charcoal",  normal: "#1C2535", highlight: "#9CA3B5", deep: "#080D17" },
];

// keep the old name aliased so existing references don't break
const PALETTE_20 = PALETTE_25;
const PALETTE_BY_ID = Object.fromEntries(PALETTE_25.map(s => [s.id, s]));

// Default subject → swatch assignment. Picks the closest match to the
// existing tokens.css palette so Quiet theme keeps its current look
// when the palette type is "normal".
const DEFAULT_SUBJECT_MAPPING = {
  math:      "ocean",
  reading:   "leaf",
  writing:   "violet",
  grammar:   "teal",
  spelling:  "blush",
  ufli:      "coral",
  explorers: "amber",
  sel:       "slate",
};

// ── React glue ─────────────────────────────────────────────────────
const PaletteContext = React.createContext({ type: "normal", mapping: DEFAULT_SUBJECT_MAPPING });

// Resolve a subject's color tokens given the current palette context.
const useSubjectColor = (subjectId) => {
  const { type, mapping } = React.useContext(PaletteContext);
  const swatchId = mapping[subjectId] || DEFAULT_SUBJECT_MAPPING[subjectId];
  const swatch = PALETTE_BY_ID[swatchId] || PALETTE_BY_ID.ocean;
  if (type === "highlight") {
    return {
      c: swatch.highlight,
      cl: swatch.highlight,
      cd: swatch.deep,
      tile: swatch.highlight,
      deep: swatch.deep,
      bg: `linear-gradient(180deg, ${swatch.highlight} 0%, color-mix(in oklch, ${swatch.highlight} 60%, #fff) 100%)`,
      bgSolid: swatch.highlight,
      stripe: swatch.deep,
      gradient: `linear-gradient(180deg, ${swatch.highlight} 0%, color-mix(in oklch, ${swatch.highlight} 60%, #fff) 100%)`,
    };
  }
  return {
    c: swatch.normal,
    cl: `color-mix(in oklch, ${swatch.normal} 22%, #fff)`,
    cd: swatch.deep,
    tile: `color-mix(in oklch, ${swatch.normal} 35%, #fff)`,
    deep: swatch.deep,
    bg: `linear-gradient(180deg, color-mix(in oklch, ${swatch.normal} 22%, #fff) 0%, color-mix(in oklch, ${swatch.normal} 10%, #fff) 100%)`,
    bgSolid: `color-mix(in oklch, ${swatch.normal} 14%, #fff)`,
    stripe: swatch.normal,
    gradient: `linear-gradient(180deg, color-mix(in oklch, ${swatch.normal} 22%, #fff) 0%, color-mix(in oklch, ${swatch.normal} 10%, #fff) 100%)`,
  };
};

// ── Theme-aware chrome tokens ──────────────────────────────────────
// The Normal palette gives Quiet chrome (white sidebars, ink text).
// The Highlight palette gives a softly-tinted chrome (sidebars in the
// teacher's accent-tinted off-white, accents in the highlight tone) —
// so the menus pick up the palette aesthetic, not just the cards.
//
// `accent` here is the teacher's "header subject" — by default Math,
// configurable in Settings. It seeds the top-bar tint + nav highlight.
const useChromeTokens = (accentSubjectId = "math") => {
  const { type, mapping } = React.useContext(PaletteContext);
  const swatchId = mapping[accentSubjectId] || DEFAULT_SUBJECT_MAPPING[accentSubjectId];
  const swatch = PALETTE_BY_ID[swatchId] || PALETTE_BY_ID.ocean;
  if (type === "highlight") {
    return {
      pageBg:    `color-mix(in oklch, ${swatch.highlight} 18%, #fff)`,
      sidebar:   `color-mix(in oklch, ${swatch.highlight} 28%, #fff)`,
      sidebarFg: swatch.deep,
      topbar:    "#ffffff",
      topbarBd:  `color-mix(in oklch, ${swatch.highlight} 40%, #fff)`,
      accent:    swatch.highlight,
      accentDeep: swatch.deep,
      navActiveBg: swatch.highlight,
      navActiveFg: swatch.deep,
      navHoverBg:  `color-mix(in oklch, ${swatch.highlight} 60%, #fff)`,
      ink: "#0B181E",
      muted: "#5A6680",
    };
  }
  return {
    pageBg: "#F6F7F9",
    sidebar: "#FFFFFF",
    sidebarFg: "#0B181E",
    topbar: "#FFFFFF",
    topbarBd: "#ECEFF4",
    accent: swatch.normal,
    accentDeep: swatch.deep,
    navActiveBg: `color-mix(in oklch, ${swatch.normal} 14%, #fff)`,
    navActiveFg: swatch.deep,
    navHoverBg: "#F2F4F8",
    ink: "#0B181E",
    muted: "#64748B",
  };
};

// Inject CSS variables for the legacy `.cp-subj.math { --c: var(--math) }`
// classes so Quiet theme also follows the chosen palette type.
const PaletteCssBridge = () => {
  const { type, mapping } = React.useContext(PaletteContext);
  const css = React.useMemo(() => {
    return SUBJECTS.map(s => {
      const swatchId = mapping[s.id] || DEFAULT_SUBJECT_MAPPING[s.id];
      const swatch = PALETTE_BY_ID[swatchId] || PALETTE_BY_ID.ocean;
      const c  = type === "highlight" ? swatch.highlight : swatch.normal;
      const cl = type === "highlight"
        ? swatch.highlight
        : `color-mix(in oklch, ${swatch.normal} 22%, #fff)`;
      const cd = swatch.deep;
      return `.cp-subj.${s.id} { --c: ${c}; --cl: ${cl}; --cd: ${cd}; }`;
    }).join("\n");
  }, [type, JSON.stringify(mapping)]);
  return <style>{css}</style>;
};

const PaletteProvider = ({ type = "normal", mapping = DEFAULT_SUBJECT_MAPPING, children }) => (
  <PaletteContext.Provider value={{ type, mapping }}>
    <PaletteCssBridge />
    {children}
  </PaletteContext.Provider>
);

Object.assign(window, {
  PALETTE_25, PALETTE_20, PALETTE_BY_ID, DEFAULT_SUBJECT_MAPPING,
  PaletteContext, PaletteProvider, PaletteCssBridge,
  useSubjectColor, useChromeTokens,
});
