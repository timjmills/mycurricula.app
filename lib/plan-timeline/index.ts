// plan-timeline — pure helpers behind the Plan tab's timeline landing.
//
// No React, no store, no DOM. Everything the canvas draws (axis columns, month
// bands, unit band geometry + stacking, lesson dot state + fork tier) is
// computed here so it can be unit-tested without a browser.

export type {
  DotState,
  ForkTier,
  SpanSource,
  TimelineBand,
  TimelineDay,
  TimelineDot,
  TimelineLane,
  TimelineMonthBand,
} from "./types";

export {
  buildTimelineAxis,
  isoOfDay,
  monthBands,
  slotOf,
  todayLineSlot,
  weekSlotRange,
} from "./axis";

export { packLevels, unitSpan, unitWeekRange } from "./bands";
export type { UnitSpan, WeekRange } from "./bands";

export {
  DOT_STATE_LABEL,
  FORK_TIER_LABEL,
  dotStateFor,
  forkTierFor,
  isCatchUpHandled,
  isPastLesson,
  isThin,
  planningGapCount,
  stackBySlot,
} from "./dots";
export type { NowRef } from "./dots";

export { buildTimelineLanes } from "./lanes";
export type { BuildLanesInput } from "./lanes";
