// Mock fixture: the active unit per subject.
// Ported from the design handoff project/data.jsx (UNITS).

import type { SubjectId, Unit } from "../types";

export const UNITS: Record<SubjectId, Unit> = {
  math: { id: "u-m3", subject: "math", name: "Unit 3 · Fractions on a Number Line", weeks: "Wk 9–14", shade: 2 }, // prettier-ignore
  reading: { id: "u-r2", subject: "reading", name: "Unit 2 · Realistic Fiction", weeks: "Wk 7–12", shade: 2 }, // prettier-ignore
  writing: { id: "u-w3", subject: "writing", name: "Unit 3 · Personal Narrative", weeks: "Wk 10–15", shade: 2 }, // prettier-ignore
  grammar: { id: "u-g2", subject: "grammar", name: "Unit 2 · Verb Tense & Agreement", weeks: "Wk 8–13", shade: 2 }, // prettier-ignore
  spelling: { id: "u-s4", subject: "spelling", name: "List 12 · Greek Roots", weeks: "Wk 12", shade: 3 }, // prettier-ignore
  ufli: { id: "u-uf", subject: "ufli", name: "Lessons 84–92 · Multisyllabic Words", weeks: "Wk 9–14", shade: 2 }, // prettier-ignore
  explorers: { id: "u-e2", subject: "explorers", name: "Unit 2 · Ancient Egypt", weeks: "Wk 8–14", shade: 2 }, // prettier-ignore
  sel: { id: "u-se2", subject: "sel", name: "Unit 2 · Conflict & Resolution", weeks: "Wk 9–12", shade: 2 }, // prettier-ignore
};

// ── Full-year unit catalog ──────────────────────────────────────────────────
//
// ALL_UNITS is the superset of every unit that appears on a lesson in
// lib/mock/lessons.ts (the hand-authored weeks-11–13 rows + the full-year
// coverage generator). The left Filters rail's UNIT list is derived from live
// `lesson.unit` ids and labels each via UNIT_BY_ID[id]?.name — so every id a
// lesson carries needs an entry here, otherwise the filter shows the raw id.
//
// IMPORTANT: the id + week span of each entry MUST match the corresponding
// YEAR_PLANS row in lessons.ts exactly. The unit ids that overlap weeks 11–13
// reuse the subject's default UNITS id (u-m3, u-r2, …) because lessons.ts
// merges the hand-authored rows onto that band; their `weeks` label here is the
// merged band's true span (e.g. u-m3 = "Wk 11–16"), which may differ from the
// label in the UNITS map above (kept verbatim for its own consumers).
//
// `shade` cycles 0→1→2→3→… across each subject's units so adjacent bands
// alternate visually, matching the roadmap's tone cycling.
export const ALL_UNITS: Unit[] = [
  // math
  { id: "m-u1", subject: "math", name: "Place Value & Decimals", weeks: "Wk 1–6", shade: 0 }, // prettier-ignore
  { id: "m-u2", subject: "math", name: "Multiplication & Division", weeks: "Wk 7–10", shade: 1 }, // prettier-ignore
  { id: "u-m3", subject: "math", name: "Fractions", weeks: "Wk 11–16", shade: 2 }, // prettier-ignore
  { id: "m-u4", subject: "math", name: "Decimal Operations", weeks: "Wk 17–22", shade: 3 }, // prettier-ignore
  { id: "m-u5", subject: "math", name: "Geometry & Measurement", weeks: "Wk 23–28", shade: 0 }, // prettier-ignore
  { id: "m-u6", subject: "math", name: "Data, Graphs & the Coordinate Plane", weeks: "Wk 29–32", shade: 1 }, // prettier-ignore
  { id: "m-u7", subject: "math", name: "Volume & Year-End Application", weeks: "Wk 33–36", shade: 2 }, // prettier-ignore

  // reading
  { id: "r-u1", subject: "reading", name: "Launching Readers' Workshop", weeks: "Wk 1–6", shade: 0 }, // prettier-ignore
  { id: "u-r2", subject: "reading", name: "Realistic Fiction", weeks: "Wk 7–14", shade: 1 }, // prettier-ignore
  { id: "r-u3", subject: "reading", name: "Nonfiction & Research", weeks: "Wk 15–20", shade: 2 }, // prettier-ignore
  { id: "r-u4", subject: "reading", name: "Poetry & Figurative Language", weeks: "Wk 21–25", shade: 3 }, // prettier-ignore
  { id: "r-u5", subject: "reading", name: "Book Clubs & Comparative Themes", weeks: "Wk 26–31", shade: 0 }, // prettier-ignore
  { id: "r-u6", subject: "reading", name: "Drama, Performance & Reading Capstone", weeks: "Wk 32–36", shade: 1 }, // prettier-ignore

  // writing
  { id: "w-u1", subject: "writing", name: "Launching Writers' Workshop", weeks: "Wk 1–5", shade: 0 }, // prettier-ignore
  { id: "w-u2", subject: "writing", name: "Informational Writing", weeks: "Wk 6–9", shade: 1 }, // prettier-ignore
  { id: "u-w3", subject: "writing", name: "Personal Narrative", weeks: "Wk 10–15", shade: 2 }, // prettier-ignore
  { id: "w-u4", subject: "writing", name: "Opinion & Argument", weeks: "Wk 16–21", shade: 3 }, // prettier-ignore
  { id: "w-u5", subject: "writing", name: "Research Report", weeks: "Wk 22–27", shade: 0 }, // prettier-ignore
  { id: "w-u6", subject: "writing", name: "Literary Essay", weeks: "Wk 28–32", shade: 1 }, // prettier-ignore
  { id: "w-u7", subject: "writing", name: "Poetry & Multi-Genre Capstone", weeks: "Wk 33–36", shade: 2 }, // prettier-ignore

  // grammar
  { id: "g-u1", subject: "grammar", name: "Parts of Speech", weeks: "Wk 1–7", shade: 0 }, // prettier-ignore
  { id: "u-g2", subject: "grammar", name: "Verb Tense & Agreement", weeks: "Wk 8–14", shade: 1 }, // prettier-ignore
  { id: "g-u3", subject: "grammar", name: "Punctuation & Conventions", weeks: "Wk 15–20", shade: 2 }, // prettier-ignore
  { id: "g-u4", subject: "grammar", name: "Clauses & Complex Sentences", weeks: "Wk 21–26", shade: 3 }, // prettier-ignore
  { id: "g-u5", subject: "grammar", name: "Sentence Structure & Combining", weeks: "Wk 27–31", shade: 0 }, // prettier-ignore
  { id: "g-u6", subject: "grammar", name: "Editing & Revision Mastery", weeks: "Wk 32–36", shade: 1 }, // prettier-ignore

  // spelling
  { id: "sp-u1", subject: "spelling", name: "Short & Long Vowel Patterns", weeks: "Wk 1–5", shade: 0 }, // prettier-ignore
  { id: "sp-u2", subject: "spelling", name: "Consonant Blends & Digraphs", weeks: "Wk 6–10", shade: 1 }, // prettier-ignore
  { id: "u-s4", subject: "spelling", name: "Greek & Latin Roots", weeks: "Wk 11–16", shade: 2 }, // prettier-ignore
  { id: "sp-u4", subject: "spelling", name: "Prefixes & Suffixes", weeks: "Wk 17–22", shade: 3 }, // prettier-ignore
  { id: "sp-u5", subject: "spelling", name: "Homophones & Tricky Patterns", weeks: "Wk 23–28", shade: 0 }, // prettier-ignore
  { id: "sp-u6", subject: "spelling", name: "Morphology & Word Study", weeks: "Wk 29–32", shade: 1 }, // prettier-ignore
  { id: "sp-u7", subject: "spelling", name: "Year-End Spelling Review", weeks: "Wk 33–36", shade: 2 }, // prettier-ignore

  // ufli
  { id: "u-u1", subject: "ufli", name: "Closed Syllables & Blends", weeks: "Wk 1–5", shade: 0 }, // prettier-ignore
  { id: "u-u2", subject: "ufli", name: "Silent-e & Vowel-Consonant-e", weeks: "Wk 6–8", shade: 1 }, // prettier-ignore
  { id: "u-uf", subject: "ufli", name: "Multisyllabic Words", weeks: "Wk 9–14", shade: 2 }, // prettier-ignore
  { id: "u-u4", subject: "ufli", name: "Open Syllables & Vowel Teams", weeks: "Wk 15–20", shade: 3 }, // prettier-ignore
  { id: "u-u5", subject: "ufli", name: "R-Controlled Vowels", weeks: "Wk 21–26", shade: 0 }, // prettier-ignore
  { id: "u-u6", subject: "ufli", name: "Multisyllabic Decoding", weeks: "Wk 27–31", shade: 1 }, // prettier-ignore
  { id: "u-u7", subject: "ufli", name: "Morphology & Fluency", weeks: "Wk 32–36", shade: 2 }, // prettier-ignore

  // explorers
  { id: "e-u1", subject: "explorers", name: "Map Skills & Early Humans", weeks: "Wk 1–6", shade: 0 }, // prettier-ignore
  { id: "u-e2", subject: "explorers", name: "Ancient Civilizations", weeks: "Wk 7–14", shade: 1 }, // prettier-ignore
  { id: "e-u3", subject: "explorers", name: "Exploration & Migration", weeks: "Wk 15–20", shade: 2 }, // prettier-ignore
  { id: "e-u4", subject: "explorers", name: "Geography & Cultures", weeks: "Wk 21–26", shade: 3 }, // prettier-ignore
  { id: "e-u5", subject: "explorers", name: "Economics & Community", weeks: "Wk 27–31", shade: 0 }, // prettier-ignore
  { id: "e-u6", subject: "explorers", name: "Capstone Inquiry Project", weeks: "Wk 32–36", shade: 1 }, // prettier-ignore

  // sel
  { id: "s-u1", subject: "sel", name: "Self-Awareness & Routines", weeks: "Wk 1–5", shade: 0 }, // prettier-ignore
  { id: "u-se2", subject: "sel", name: "Community & Belonging", weeks: "Wk 6–13", shade: 1 }, // prettier-ignore
  { id: "s-u3", subject: "sel", name: "Emotional Regulation", weeks: "Wk 14–19", shade: 2 }, // prettier-ignore
  { id: "s-u4", subject: "sel", name: "Empathy & Relationships", weeks: "Wk 20–25", shade: 3 }, // prettier-ignore
  { id: "s-u5", subject: "sel", name: "Growth Mindset & Goal-Setting", weeks: "Wk 26–31", shade: 0 }, // prettier-ignore
  { id: "s-u6", subject: "sel", name: "Reflection & Transition", weeks: "Wk 32–36", shade: 1 }, // prettier-ignore
];

/** Unit lookup by unit id. Built from ALL_UNITS so every unit that appears on
 *  a lesson (existing + full-year coverage) resolves to a friendly name —
 *  the left Filters rail relies on this to label its UNIT list. */
export const UNIT_BY_ID: Record<string, Unit> = Object.fromEntries(
  ALL_UNITS.map((u) => [u.id, u]),
);
