// Mock fixture: daily notes (week 12).
// Ported from the design handoff project/data.jsx (DAILY_NOTES).
// day 0 = Sunday — the school week starts Sunday.

import type { DailyNote } from "../types";

export const DAILY_NOTES: readonly DailyNote[] = [
  { day: 0, scope: "shared", priority: "important", author: "om", body: "PD this Thursday — early dismissal at 1:30." }, // prettier-ignore
  { day: 1, scope: "shared", priority: "fyi", author: "om", body: "Library closed Mon–Wed for inventory." }, // prettier-ignore
  { day: 2, scope: "personal", priority: "urgent", author: "lh", body: "Sub for Lena 12:30–1:30 — leave printed bell ringer." }, // prettier-ignore
  { day: 2, scope: "shared", priority: "important", author: "sk", body: "Picture day rescheduled to next Tuesday." }, // prettier-ignore
  { day: 3, scope: "personal", priority: "fyi", author: "lh", body: "Aya's mum bringing samosas at lunch." }, // prettier-ignore
  { day: 3, scope: "shared", priority: "urgent", author: "om", body: "Fire drill — 9:45 sharp. No make-up if missed." }, // prettier-ignore
  { day: 4, scope: "shared", priority: "fyi", author: "om", body: "Friday assembly cancelled." }, // prettier-ignore
] as const;

/** Notes for a given day index. */
export function notesForDay(day: number): DailyNote[] {
  return DAILY_NOTES.filter((n) => n.day === day);
}
