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

/** Unit lookup by unit id. */
export const UNIT_BY_ID: Record<string, Unit> = Object.fromEntries(
  Object.values(UNITS).map((u) => [u.id, u]),
);
