"use client";

// util.ts — thin re-export shim. The shared non-component canvas helpers were
// lifted to components/planner-v2 in Wave 5; this shim preserves the day-v2
// import path (`./util`) for DayFocus and for the three legacy Day frames.
//
// `STATUS_WORD` is consumed only by DayB's rail ("8:10 · Planned"). It is still
// forwarded because the user asked on 2026-08-01 to KEEP all three legacy
// frames until they decide what to merge or delete — see DayViewV2's
// `?dayview=` note. Drop it in the same change that deletes DayB, not before.
//
// NON-COMPONENTS ONLY here (components re-export from ./atoms) — keeps this a
// clean Fast-Refresh boundary, mirroring the planner-v2 atoms/util split.
//
// It is no longer ONLY a shim: the focus-card content derivations below live
// here because they are day-v2's own, pure, and shared by the shipping focus
// card (DayFocus) and the retained legacy frames (DayC's hero, DayB's meta
// row). Being pure is what lets tests/day-card-content.test.ts pin them
// directly as well as through the rendered card.

import { stripHtml } from "@/lib/html-text";
import type { LessonSectionContent } from "@/lib/lesson-flow";

export {
  useNowMin,
  STATUS_WORD,
  fromInteractive,
} from "@/components/planner-v2";

// ── The focus card's lesson flow ────────────────────────────────────────────
// The card used to paint a module-level `FLOW_STEPS = ["Warm-up",
// "Mini-lesson", "Guided practice", "Exit ticket"]` on EVERY lesson. That array
// is the 7.21 mockup's placeholder (source-home/views-c.jsx:44) — the mockup's
// fixture data carries no sections, so its author had nothing else to draw. The
// running app does: a lesson's phases are store-owned
// (`usePlanner().getSections(id)`), already hydrated for every lesson with no
// extra round trip, and they are what the teacher sees in Plan and in Teach.
//
// The four placeholder names are not even the app's default flow. The default
// template is `gradual-release` (lib/lesson-templates.ts:532) — "Focus Lesson —
// I Do · 10 min" … "Debrief · 5 min" — so the card contradicted the lesson plan
// for a DEFAULT lesson, before considering the other 14 templates a teacher can
// pick. There is deliberately NO fallback to the old array when a lesson has no
// sections: a strip of plausible chips that describes nothing is the defect,
// not the empty state.

/** One phase of a lesson, reduced to what the focus card paints. */
export interface FlowStep {
  /** React key — the section's own id. */
  key: string;
  /** 1-based position in the lesson's flow (the numbered disc). */
  n: number;
  /** The section's heading as plain text. Falls back to "Phase N" — a
   *  positional fact, not an invented pedagogical name — when the teacher has
   *  left the heading blank. */
  label: string;
  /** Planned phase length. Null → the chip shows no time at all (the handoff's
   *  optional-minutes rule: never a dangling "· "). Non-finite and
   *  non-positive values are treated as absent. */
  minutes: number | null;
  /** The section's body as plain text, collapsed — the chip's hover/`title`
   *  detail. Empty string when the phase has no written content, in which case
   *  the chip carries no title rather than an empty one. */
  detail: string;
}

/** Collapse runs of whitespace so a rich-text body reads as one `title` line. */
function oneLine(html: string): string {
  return stripHtml(html).replace(/\s+/g, " ").trim();
}

/**
 * The lesson's REAL flow, in order, ready to paint. `sections` comes straight
 * from `usePlanner().getSections(lessonId)`; an empty array means the lesson
 * genuinely has no phases and the caller must render an empty state.
 */
export function lessonFlowSteps(
  sections: readonly LessonSectionContent[],
): FlowStep[] {
  return sections.map((section, i) => {
    const heading = oneLine(section.heading);
    const minutes = section.minutes;
    return {
      key: section.id,
      n: i + 1,
      label: heading || `Phase ${i + 1}`,
      minutes:
        typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
          ? minutes
          : null,
      detail: oneLine(section.body),
    };
  });
}

// ── The focus card's standards ──────────────────────────────────────────────
// The card rendered `lesson.standards[0] ?? "—"`. A lesson tagged with four
// standards showed one and silently dropped three, and the card gave no sign
// there were more — the teacher reading it had no way to know it was a summary.

/** How many standard chips the card paints before collapsing the rest. */
export const STANDARD_CHIP_LIMIT = 3;

/** The standards split into what is painted and what is folded into the
 *  overflow chip. `hidden` is empty whenever everything fits. */
export interface StandardChipSplit {
  shown: string[];
  hidden: string[];
}

/**
 * Split a lesson's standard codes for the footer. Duplicates are dropped
 * (order preserved) so a repeated code cannot consume a slot twice.
 *
 * One-past-the-limit is shown rather than collapsed: a "+1" chip is wider than
 * the code it hides and tells the teacher less.
 */
export function splitStandardChips(
  codes: readonly string[],
  limit: number = STANDARD_CHIP_LIMIT,
): StandardChipSplit {
  const unique: string[] = [];
  for (const code of codes) {
    const trimmed = code.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  if (unique.length <= limit + 1) return { shown: unique, hidden: [] };
  return { shown: unique.slice(0, limit), hidden: unique.slice(limit) };
}
