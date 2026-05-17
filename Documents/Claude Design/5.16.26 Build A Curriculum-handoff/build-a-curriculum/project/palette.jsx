// palette.jsx — The 20-color paired palette.
//
// Architecture per latest decision:
//   • Core Curriculum has ONE subject → color mapping, set by the team
//     lead in Core Settings. All teachers see the same hue for the same
//     subject.
//   • Each color is defined as a PAIR: a Normal (saturated, ~500 weight)
//     and a Pastel (~100–200 weight) variant of the same hue.
//   • Each teacher individually picks Normal OR Pastel as a viewing
//     preference (in their own Appearance settings).
//   • Personal subjects: the teacher picks their own swatch from the
//     same 20-color pool; the Normal/Pastel split still applies.
//   • Modified lessons: stripe stays in the subject's color, just
//     switches to a DASHED pattern (alternating colored segments).
//
// This file owns:
//   • PALETTE_20      — the 20 paired swatches
//   • DEFAULT_MAPPING — the default subject → swatch assignment
//   • <PaletteProvider> + useSubjectColor() — runtime context + hook
//   • Injection of CSS variables so existing `.cp-subj.math` classes
//     transparently follow the chosen palette type (Quiet theme keeps
//     working without changes).

// ── The 20 paired swatches ─────────────────────────────────────────
// Each swatch carries:
//   normal      — saturated, DARKER hex. The "regular" school-palette
//                 color. Confident, readable, slightly serious.
//   highlight   — highlighter-marker hex. Bright, electric, candy-soft.
//                 A distinctly different aesthetic from `normal`, not
//                 just a desaturated version of it. Think actual
//                 highlighter pens (Stabilo, Mildliner) not muted
//                 watercolor pastels.
//   deep        — text-on-color hex (~700-800). AA on either fill.
//
// User naming: this used to be "Normal vs Pastel". Renamed to
// "Normal vs Highlight" because the second palette now reads as
// highlighter colors, not flat pastels.
const PALETTE_20 = [
  // Blues
  { id: "ocean",     name: "Ocean",     normal: "#1A4ED9", highlight: "#7FB6FF", deep: "#0C2870" },
  { id: "sky",       name: "Sky",       normal: "#1373C9", highlight: "#74D0FF", deep: "#0B416E" },
  { id: "indigo",    name: "Indigo",    normal: "#3D2DBF", highlight: "#A095FF", deep: "#1A1170" },
  // Greens / Teals
  { id: "teal",      name: "Teal",      normal: "#0A7E72", highlight: "#7CECDE", deep: "#053A33" },
  { id: "mint",      name: "Mint",      normal: "#0E9385", highlight: "#7DF0DC", deep: "#054E45" },
  { id: "leaf",      name: "Leaf",      normal: "#188542", highlight: "#9CF488", deep: "#093D1F" },
  { id: "forest",    name: "Forest",    normal: "#1F5B23", highlight: "#A8E89B", deep: "#0D2C0F" },
  // Yellows / Warms
  { id: "lemon",     name: "Lemon",     normal: "#B58400", highlight: "#FFF176", deep: "#4E380A" },
  { id: "amber",     name: "Amber",     normal: "#A66A0E", highlight: "#FFD86B", deep: "#502F08" },
  { id: "apricot",   name: "Apricot",   normal: "#C2671E", highlight: "#FFBE76", deep: "#5A2C0A" },
  // Reds / Pinks
  { id: "coral",     name: "Coral",     normal: "#C7401E", highlight: "#FFA984", deep: "#581A09" },
  { id: "rose",      name: "Rose",      normal: "#BA1A41", highlight: "#FF95AB", deep: "#5B0A1E" },
  { id: "blush",     name: "Blush",     normal: "#B22368", highlight: "#FFA1C9", deep: "#560E36" },
  { id: "magenta",   name: "Magenta",   normal: "#9C1377", highlight: "#FF9DDC", deep: "#460835" },
  // Purples
  { id: "lavender",  name: "Lavender",  normal: "#5E2EE0", highlight: "#C7A8FF", deep: "#2A1170" },
  { id: "violet",    name: "Violet",    normal: "#4F1FAA", highlight: "#B496FF", deep: "#220A5C" },
  { id: "plum",      name: "Plum",      normal: "#6E1788", highlight: "#DAA1F2", deep: "#330842" },
  // Neutrals
  { id: "slate",     name: "Slate",     normal: "#3E4A65", highlight: "#A8B2C8", deep: "#1B2233" },
  { id: "stone",     name: "Stone",     normal: "#6D5947", highlight: "#D6BC9A", deep: "#352819" },
  { id: "charcoal",  name: "Charcoal",  normal: "#1C2535", highlight: "#9CA3B5", deep: "#080D17" },
];

const PALETTE_BY_ID = Object.fromEntries(PALETTE_20.map(s => [s.id, s]));

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
// `value = { type: "normal" | "pastel", mapping: { math: "ocean", … } }`
const PaletteContext = React.createContext({ type: "normal", mapping: DEFAULT_SUBJECT_MAPPING });

// Resolve a subject's color tokens given the current palette context.
// Returns:
//   c   — the stripe / accent color (saturated for normal, deeper-mid for pastel)
//   cl  — the light fill color (pastel for pastel theme, light-tint for normal)
//   cd  — the deep text color (same deep regardless of palette type, for AA)
//   tile, deep, bg — convenience aliases used by Mid-Calm/Mid-Vivid
const useSubjectColor = (subjectId) => {
  const { type, mapping } = React.useContext(PaletteContext);
  const swatchId = mapping[subjectId] || DEFAULT_SUBJECT_MAPPING[subjectId];
  const swatch = PALETTE_BY_ID[swatchId] || PALETTE_BY_ID.ocean;
  if (type === "highlight") {
    // HIGHLIGHT mode — highlighter-marker aesthetic. Card fills use a
    // subtle vertical gradient from the highlight hue at the top to a
    // softer mix at the bottom (the gradient the user asked us to bring
    // back from the original Vivid cards).
    return {
      c: swatch.highlight,
      cl: swatch.highlight,
      cd: swatch.deep,
      tile: swatch.highlight,
      deep: swatch.deep,
      // bg uses a gradient: stronger highlight at the top, softer at
      // the bottom. Falls back gracefully when assigned to CSS bg.
      bg: `linear-gradient(180deg, ${swatch.highlight} 0%, color-mix(in oklch, ${swatch.highlight} 65%, #fff) 100%)`,
      bgSolid: swatch.highlight,
      stripe: swatch.deep, // stripe in deep tone reads against highlight
      gradient: `linear-gradient(180deg, ${swatch.highlight} 0%, color-mix(in oklch, ${swatch.highlight} 65%, #fff) 100%)`,
    };
  }
  // NORMAL mode — darker, more confident school palette. Card fills
  // get a soft vertical gradient too so cards never feel flat.
  return {
    c: swatch.normal,
    cl: `color-mix(in oklch, ${swatch.normal} 22%, #fff)`,
    cd: swatch.deep,
    tile: `color-mix(in oklch, ${swatch.normal} 35%, #fff)`,
    deep: swatch.deep,
    bg: `linear-gradient(180deg, color-mix(in oklch, ${swatch.normal} 18%, #fff) 0%, color-mix(in oklch, ${swatch.normal} 8%, #fff) 100%)`,
    bgSolid: `color-mix(in oklch, ${swatch.normal} 14%, #fff)`,
    stripe: swatch.normal,
    gradient: `linear-gradient(180deg, color-mix(in oklch, ${swatch.normal} 18%, #fff) 0%, color-mix(in oklch, ${swatch.normal} 8%, #fff) 100%)`,
  };
};

// Inject CSS variables so existing `.cp-subj.math { --c: var(--math) }`
// classes flow through the chosen palette type. Mount this near the
// root of any artboard that needs palette-aware Quiet styling.
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

// Convenience wrapper — drops both context + style bridge in one.
const PaletteProvider = ({ type = "normal", mapping = DEFAULT_SUBJECT_MAPPING, children }) => (
  <PaletteContext.Provider value={{ type, mapping }}>
    <PaletteCssBridge />
    {children}
  </PaletteContext.Provider>
);

Object.assign(window, {
  PALETTE_20, PALETTE_BY_ID, DEFAULT_SUBJECT_MAPPING,
  PaletteContext, PaletteProvider, PaletteCssBridge, useSubjectColor,
});
