// Public surface of the v2 Year frames (Wave 6). Consumers import from the
// folder (`@/components/year-v2`), never a deep file.
//
// YearShell is the /year frame router (glass → YearA · paper → the legacy
// TimelineYear · color → YearC), and hosts the shared Unit Explorer modal for
// the glass + color frames. UnitExplorer + its data helpers are built by
// Builder A (UnitExplorer.tsx / lib/year-v2-data.ts).

export { YearShell } from "./YearShell";
export type { YearSubjectLane, YearUnitNode } from "./YearShell";
export { YearA } from "./YearA";
export { YearC } from "./YearC";
export { UnitExplorer } from "./UnitExplorer";
export type { UnitExplorerProps } from "./UnitExplorer";
