// Mock fixture: a typical day's time blocks (Lena, Monday).
// Ported from the design handoff project/data.jsx (SCHEDULE).

import type { ScheduleBlock } from "../types";

export const SCHEDULE: readonly ScheduleBlock[] = [
  { start: "07:50", end: "08:10", type: "non_academic", label: "Morning meeting" }, // prettier-ignore
  { start: "08:10", end: "09:10", type: "academic", subject: "math", lesson: "m-12-1" }, // prettier-ignore
  { start: "09:10", end: "09:40", type: "academic", subject: "ufli", lesson: "uf-12-1" }, // prettier-ignore
  { start: "09:40", end: "10:00", type: "non_academic", label: "Snack & recess" }, // prettier-ignore
  { start: "10:00", end: "11:00", type: "academic", subject: "reading", lesson: "r-12-1" }, // prettier-ignore
  { start: "11:00", end: "11:40", type: "non_academic", label: "Arabic (specialist)" }, // prettier-ignore
  { start: "11:40", end: "12:20", type: "non_academic", label: "Lunch" },
  { start: "12:20", end: "13:10", type: "academic", subject: "writing", lesson: null }, // prettier-ignore
  { start: "13:10", end: "13:40", type: "academic", subject: "grammar", lesson: null }, // prettier-ignore
  { start: "13:40", end: "14:10", type: "non_academic", label: "PE (specialist)" }, // prettier-ignore
  { start: "14:10", end: "14:50", type: "academic", subject: "explorers", lesson: "e-12-0" }, // prettier-ignore
  { start: "14:50", end: "15:10", type: "non_academic", label: "Pack-up & dismissal" }, // prettier-ignore
] as const;
