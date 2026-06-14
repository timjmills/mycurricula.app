// Mock fixture: real CCSS standards for Grade 5.
// Ported from the design handoff project/data.jsx (STANDARDS).

import type { StandardsMap } from "../types";

export const STANDARDS: StandardsMap = {
  "5.NF.B.3": "Interpret a fraction as division of the numerator by the denominator (a/b = a ÷ b).", // prettier-ignore
  "5.NF.B.4": "Apply and extend previous understandings of multiplication to multiply a fraction by a fraction.", // prettier-ignore
  "5.NF.A.1": "Add and subtract fractions with unlike denominators.",
  "5.NF.A.2": "Solve word problems involving addition and subtraction of fractions.", // prettier-ignore
  "5.NBT.B.5": "Fluently multiply multi-digit whole numbers using the standard algorithm.", // prettier-ignore
  "RL.5.3": "Compare and contrast two or more characters, settings, or events in a story.", // prettier-ignore
  "RL.5.6": "Describe how a narrator's or speaker's point of view influences events.", // prettier-ignore
  "RL.5.2": "Determine a theme of a story from details in the text.",
  "W.5.3": "Write narratives to develop real or imagined experiences using effective technique.", // prettier-ignore
  "W.5.3.B": "Use narrative techniques, such as dialogue, description, and pacing.", // prettier-ignore
  "L.5.1.C": "Use verb tense to convey various times, sequences, states, and conditions.", // prettier-ignore
  "L.5.1.D": "Recognize and correct inappropriate shifts in verb tense.",
  "L.5.2.E": "Spell grade-appropriate words correctly, consulting references as needed.", // prettier-ignore
  "RF.5.3": "Know and apply grade-level phonics and word analysis skills.",
  "RF.5.4": "Read with sufficient accuracy and fluency to support comprehension.", // prettier-ignore
};

/** Look up a standard description; returns the code itself if unknown. */
export function describeStandard(code: string): string {
  return STANDARDS[code] ?? code;
}

/**
 * Compact dotted code for display in a StandardPill.
 *
 * Stored codes are already short (e.g. "5.NBT.A.1"), so this is a no-op for
 * today's data. It is future-proofing: if a fully-qualified framework code
 * ever arrives (e.g. "CCSS.MATH.CONTENT.5.NBT.A.1" or
 * "CCSS.ELA-LITERACY.RL.5.3"), strip the leading framework/subject/CONTENT
 * prefix so the pill stays compact. Returns the code unchanged when no prefix
 * matches.
 */
export function formatStandardCode(code: string): string {
  const stripped = code.replace(/^CCSS\.[A-Z-]+\.(?:CONTENT\.)?/i, "").trim();
  return stripped || code;
}
