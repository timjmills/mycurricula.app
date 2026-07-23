// lib/standards/items.ts — taggable standard ITEMS bundled with the app.
//
// The catalog (frameworks-catalog.json) describes 174 frameworks; this file
// carries the actual item sets the picker can tag TODAY, in the same spirit
// as lib/mock fixtures: real codes, sample-depth coverage (the beta grade's
// band), never a hard-coded grade assumption — every item carries its own
// `grades` so other grades slot in by adding data, not code.
//
// Bundled sets (per the 2026-06 build request): CCSS ELA + Math content
// standards (the codes the mock lessons already use), the 8 CCSS Standards
// for Mathematical Practice, NGSS Grade-5 performance expectations (+ the
// 3–5 engineering band), and the IB Approaches to Learning categories.
//
// LICENSING (from docs/research-k12-standards-frameworks-2026-06-12.md):
//   • CCSS — public licence, purpose-scoped, verbatim © notice required
//     (rendered in the picker's framework footnote).
//   • NGSS — free use with attribution (© Achieve/NGSS Lead States).
//     PE texts verified verbatim against nextgenscience.org (2026-06-12).
//   • IB ATL — IB content requires a written IBO licence for app use, so we
//     ship CATEGORY-LEVEL reference only: category/cluster NAMES (facts) with
//     our own neutral one-line descriptions — never IB descriptor text.
//     Full ATL descriptors must arrive via an IBO licence or a school-
//     uploaded framework (provenance = school_uploaded).

import { STANDARDS } from "@/lib/mock/standards";

/** Subject-coverage slugs used by the standards catalog (broader than the
 *  app's eight subjects — a framework can cover domains the app doesn't
 *  teach). Matches the `subject_scope` vocabulary in
 *  frameworks-catalog.json and the seed generator
 *  (scripts/gen-standards-catalog-sql.mjs). Formerly exported by
 *  lib/standards/catalog.ts — the client-side catalog query layer removed
 *  with its only consumer, the superseded StandardsPicker. */
export type CatalogSubjectSlug =
  | "ela"
  | "math"
  | "science"
  | "social_studies"
  | "arts"
  | "pe_health"
  | "languages"
  | "computing"
  | "religious_values"
  | "sel"
  | "vocational"
  | "cross_curricular"
  | "all_subjects";

/** One taggable standard item. `code` is the value stored in
 *  `lesson.standards` (and later the `standards.code` DB column). */
export interface StandardItem {
  code: string;
  description: string;
  /** Grade tags ("K", "1"–"12"). Empty = grade-independent (practices,
   *  ATL categories). */
  grades: readonly string[];
  /** Catalog subject slugs. Empty = applies across subjects. */
  subjects: readonly CatalogSubjectSlug[];
}

/** Convenience: look up a description across every bundled set. */
function described(code: string, fallback: string): string {
  return STANDARDS[code] ?? fallback;
}

// ── CCSS ELA/Literacy (Grade-5 sample set — codes the mock lessons use) ────

const CCSS_ELA_CODES = [
  "RL.5.2",
  "RL.5.3",
  "RL.5.6",
  "RF.5.3",
  "RF.5.4",
  "W.5.3",
  "W.5.3.B",
  "L.5.1.C",
  "L.5.1.D",
  "L.5.2.E",
] as const;

const CCSS_ELA: StandardItem[] = CCSS_ELA_CODES.map((code) => ({
  code,
  description: described(code, code),
  grades: ["5"],
  subjects: ["ela"],
}));

// ── CCSS Math content (Grade-5 sample set) ─────────────────────────────────

const CCSS_MATH_CODES = [
  "5.NBT.B.5",
  "5.NF.A.1",
  "5.NF.A.2",
  "5.NF.B.3",
  "5.NF.B.4",
] as const;

const CCSS_MATH: StandardItem[] = CCSS_MATH_CODES.map((code) => ({
  code,
  description: described(code, code),
  grades: ["5"],
  subjects: ["math"],
}));

// ── CCSS Standards for Mathematical Practice (grade-independent) ───────────

const CCSS_SMP: StandardItem[] = [
  ["MP1", "Make sense of problems and persevere in solving them."],
  ["MP2", "Reason abstractly and quantitatively."],
  ["MP3", "Construct viable arguments and critique the reasoning of others."],
  ["MP4", "Model with mathematics."],
  ["MP5", "Use appropriate tools strategically."],
  ["MP6", "Attend to precision."],
  ["MP7", "Look for and make use of structure."],
  ["MP8", "Look for and express regularity in repeated reasoning."],
].map(([code, description]) => ({
  code,
  description,
  grades: [],
  subjects: ["math"],
}));

// ── NGSS Grade-5 performance expectations (+ 3–5 engineering band) ─────────

const NGSS_G5: StandardItem[] = [
  [
    "5-PS1-1",
    "Develop a model to describe that matter is made of particles too small to be seen.",
  ],
  [
    "5-PS1-2",
    "Measure and graph quantities to provide evidence that regardless of the type of change that occurs when heating, cooling, or mixing substances, the total weight of matter is conserved.",
  ],
  [
    "5-PS1-3",
    "Make observations and measurements to identify materials based on their properties.",
  ],
  [
    "5-PS1-4",
    "Conduct an investigation to determine whether the mixing of two or more substances results in new substances.",
  ],
  [
    "5-PS2-1",
    "Support an argument that the gravitational force exerted by Earth on objects is directed down.",
  ],
  [
    "5-PS3-1",
    "Use models to describe that energy in animals' food (used for body repair, growth, motion, and to maintain body warmth) was once energy from the sun.",
  ],
  [
    "5-LS1-1",
    "Support an argument that plants get the materials they need for growth chiefly from air and water.",
  ],
  [
    "5-LS2-1",
    "Develop a model to describe the movement of matter among plants, animals, decomposers, and the environment.",
  ],
  [
    "5-ESS1-1",
    "Support an argument that differences in the apparent brightness of the sun compared to other stars is due to their relative distances from Earth.",
  ],
  [
    "5-ESS1-2",
    "Represent data in graphical displays to reveal patterns of daily changes in length and direction of shadows, day and night, and the seasonal appearance of some stars in the night sky.",
  ],
  [
    "5-ESS2-1",
    "Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact.",
  ],
  [
    "5-ESS2-2",
    "Describe and graph the amounts of salt water and fresh water in various reservoirs to provide evidence about the distribution of water on Earth.",
  ],
  [
    "5-ESS3-1",
    "Obtain and combine information about ways individual communities use science ideas to protect the Earth's resources and environment.",
  ],
].map(([code, description]) => ({
  code,
  description,
  grades: ["5"],
  subjects: ["science"],
}));

const NGSS_ETS_3_5: StandardItem[] = [
  [
    "3-5-ETS1-1",
    "Define a simple design problem reflecting a need or a want that includes specified criteria for success and constraints on materials, time, or cost.",
  ],
  [
    "3-5-ETS1-2",
    "Generate and compare multiple possible solutions to a problem based on how well each is likely to meet the criteria and constraints of the problem.",
  ],
  [
    "3-5-ETS1-3",
    "Plan and carry out fair tests in which variables are controlled and failure points are considered to identify aspects of a model or prototype that can be improved.",
  ],
].map(([code, description]) => ({
  code,
  description,
  grades: ["3", "4", "5"],
  subjects: ["science"],
}));

// ── IB Approaches to Learning — category level only (licence-gated) ────────
// Category and cluster NAMES are factual; the one-liners below are our own
// neutral phrasing, deliberately NOT the IB's descriptor text (see header).

const IB_ATL: StandardItem[] = [
  [
    "ATL.Thinking",
    "Thinking skills — critical thinking, creative thinking, transfer (IB ATL category).",
  ],
  [
    "ATL.Communication",
    "Communication skills — exchanging thoughts and information through interaction and language (IB ATL category).",
  ],
  [
    "ATL.Social",
    "Social skills — collaboration and working effectively with others (IB ATL category).",
  ],
  [
    "ATL.Self-management",
    "Self-management skills — organization, affective skills, reflection (IB ATL category).",
  ],
  [
    "ATL.Research",
    "Research skills — information literacy and media literacy (IB ATL category).",
  ],
].map(([code, description]) => ({
  code,
  description,
  grades: [],
  subjects: ["cross_curricular"],
}));

// ── The bundled item sets, keyed by catalog short_code ─────────────────────

export const STANDARD_ITEMS: Readonly<Record<string, readonly StandardItem[]>> =
  {
    "CCSS-ELA": CCSS_ELA,
    "CCSS-MATH": CCSS_MATH,
    "CCSS-SMP": CCSS_SMP,
    NGSS: [...NGSS_G5, ...NGSS_ETS_3_5],
    "IB-ATL": IB_ATL,
  };

/** Grade options present across the bundled sets (picker filter). Kept
 *  data-derived so new grades appear when item sets grow — never hard-coded
 *  to the beta grade. */
export function availableGrades(): string[] {
  const grades = new Set<string>();
  for (const items of Object.values(STANDARD_ITEMS)) {
    for (const it of items) for (const g of it.grades) grades.add(g);
  }
  const order = ["K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  return order.filter((g) => grades.has(g));
}

/** code → description across every bundled set (extends the CCSS map the
 *  planner catalog already serves via describeStandard). */
export function bundledDescriptions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const items of Object.values(STANDARD_ITEMS)) {
    for (const it of items) out[it.code] = it.description;
  }
  return out;
}
