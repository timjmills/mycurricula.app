// Mock fixture: Day Shoutbox messages — the team-visible, by-date thread.
//
// The Day Shoutbox (planning doc §5.3, data model §4: Comment with
// `anchor_type = day_shoutbox`) is the team-conversation counterpart to the
// personal Daily Notes banner. It is a FLAT thread (no replies) keyed by a
// week + day index — the team's running chatter for that school day.
//
// These messages are fake but realistic, ported from the design handoff
// shared.jsx (`CP_SAMPLE_SHOUTS`) and extended so a couple of days carry a
// thread. `author` is a Teacher id resolved against TEACHERS at render time
// (matching how DailyNote.author and Todo.assignee already store ids).
//
// Grade-scoping note: the real `day_shoutbox` anchor is a date, which is
// implicitly grade-scoped through the planner. The mock keys on week + day
// so it survives the day selector without assuming a single grade.
//
// The shape lives here (alongside the fixture) rather than in lib/types.ts:
// it is prototype mock data, and the real model is a `Comment` with
// `anchor_type = day_shoutbox` (see planning doc §4). When the backend
// lands this type is superseded by that Comment shape.

/** One post in a day's flat team shoutbox thread. */
export interface ShoutboxMessage {
  id: string;
  /** Week number this message belongs to (e.g. 12). */
  week: number;
  /** Day index, 0 = Sunday … matches Lesson.day / DailyNote.day. */
  day: number;
  /** Teacher id of the author — resolved against TEACHERS at render time. */
  author: string;
  /** Human-readable post time, e.g. "8:14 AM". */
  time: string;
  body: string;
}

export const SHOUTBOX_MESSAGES: readonly ShoutboxMessage[] = [
  // Week 12 · Sunday
  { id: "sb1", week: 12, day: 0, author: "om", time: "7:52 AM", body: "Morning, team — reminder the library is closed Sun–Wed for inventory." }, // prettier-ignore
  { id: "sb2", week: 12, day: 0, author: "sk", time: "8:05 AM", body: "Thanks Omar. I'll move my reading groups to the back corner this week." }, // prettier-ignore
  // Week 12 · Monday
  { id: "sb3", week: 12, day: 1, author: "om", time: "8:14 AM", body: "Fire drill at 9:45 sharp today — please end whatever you're in 2 min early." }, // prettier-ignore
  { id: "sb4", week: 12, day: 1, author: "sk", time: "8:31 AM", body: "Anyone seen the laminator key? Last had it Friday afternoon." }, // prettier-ignore
  { id: "sb5", week: 12, day: 1, author: "ma", time: "9:02 AM", body: "Tariq came in upset — heads-up if he's in your group later." }, // prettier-ignore
  { id: "sb6", week: 12, day: 1, author: "lh", time: "9:18 AM", body: "Found the key — it's back on the hook in the workroom." }, // prettier-ignore
  // Week 12 · Tuesday
  { id: "sb7", week: 12, day: 2, author: "sk", time: "7:48 AM", body: "Picture day is rescheduled to next Tuesday — no special clothes needed today." }, // prettier-ignore
  { id: "sb8", week: 12, day: 2, author: "jd", time: "8:22 AM", body: "I'll cover the 12:30 supervision slot while Lena's at her appointment." }, // prettier-ignore
  // Week 12 · Wednesday
  { id: "sb9", week: 12, day: 3, author: "om", time: "8:09 AM", body: "Fraction strips are running low — Maya, can you grab a fresh set from storage?" }, // prettier-ignore
  // Week 12 · Thursday — quiet day, no messages yet.
] as const;

/**
 * Shoutbox messages for one week + day, oldest-first (chat order).
 * Returns a fresh array so callers can render it without mutating the
 * fixture.
 */
export function shoutboxForDay(week: number, day: number): ShoutboxMessage[] {
  return SHOUTBOX_MESSAGES.filter((m) => m.week === week && m.day === day);
}
