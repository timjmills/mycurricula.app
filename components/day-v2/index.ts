// Public surface of the v2 Day VIEW canvas. Consumers (DailyView / Builder B)
// import the canvas + its props type from the folder, never a deep file.
//
// DayFocus, DayA, DayB and DayC are deliberately NOT exported: which of them
// renders is DayViewV2's decision (see its `?dayview=` note), and a second
// import path would be a second place for that decision to live.
export { DayViewV2 } from "./DayViewV2";
export type { DayViewV2Props } from "./DayViewV2";
