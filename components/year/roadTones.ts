// roadTones.ts — the highlighter-marker palette used across the Year view.
//
// These are bright marker-pen tones that map to the 8 subjects, cycling
// through the 6 available tones for subjects beyond 6.
//
// Design rule: colors come from tokens where possible. The exact hex values
// here mirror the handoff's ROAD_TONES; they should be added to tokens.css
// as --yt-* variables so they're theme-able in later phases.

import type { SubjectId } from "@/lib/types";

/** A single highlighter tone entry. */
export interface RoadTone {
  id: string;
  /** Bright highlighter fill for unit bars. */
  stroke: string;
  /** Darker shade used for text and done-dot fill. */
  deep: string;
  /** Very soft tint for lane-card backgrounds. */
  lane: string;
  /** Foreground text color on the stroke fill. */
  text: string;
  /** Green-ish completion dot color. */
  check: string;
}

/** The 6 available highlighter tones. */
export const ROAD_TONES: readonly RoadTone[] = [
  {
    id: "yellow",
    stroke: "#FFE56B",
    deep: "#7A4F08",
    lane: "#FEF6D8",
    text: "#3A2A05",
    check: "#D9A41A",
  },
  {
    id: "green",
    stroke: "#A0F0B8",
    deep: "#107D3A",
    lane: "#E5F8EB",
    text: "#0B4A23",
    check: "#10A050",
  },
  {
    id: "cyan",
    stroke: "#9CECE2",
    deep: "#0F7D70",
    lane: "#E7F7F4",
    text: "#08443C",
    check: "#10A290",
  },
  {
    id: "purple",
    stroke: "#CBB3F7",
    deep: "#5328AD",
    lane: "#EFE8FB",
    text: "#2C1467",
    check: "#6E40D2",
  },
  {
    id: "pink",
    stroke: "#FBB9D5",
    deep: "#9D2D5E",
    lane: "#FCE5ED",
    text: "#5A1535",
    check: "#D63D80",
  },
  {
    id: "orange",
    stroke: "#FFC392",
    deep: "#A4480A",
    lane: "#FCE6D2",
    text: "#4F2104",
    check: "#D86B16",
  },
] as const;

/** Map each subject to a tone, cycling through the 6 available tones. */
const SUBJECT_TONE_MAP: Record<SubjectId, RoadTone> = {
  math: ROAD_TONES[0], // yellow
  reading: ROAD_TONES[1], // green
  writing: ROAD_TONES[3], // purple
  grammar: ROAD_TONES[2], // cyan
  spelling: ROAD_TONES[4], // pink
  ufli: ROAD_TONES[5], // orange
  explorers: ROAD_TONES[1], // green (reuse)
  sel: ROAD_TONES[2], // cyan (reuse)
};

/** Get the highlighter tone for a given subject. */
export function toneForSubject(subject: SubjectId): RoadTone {
  return SUBJECT_TONE_MAP[subject] ?? ROAD_TONES[0];
}

/** Look up a tone by its string id ("yellow", "green", etc.). */
export function toneById(id: string): RoadTone {
  return ROAD_TONES.find((t) => t.id === id) ?? ROAD_TONES[0];
}
