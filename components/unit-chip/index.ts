// components/unit-chip — the lesson → unit workspace pop-in affordance (B5.4 /
// B5.5). Consumers import from the folder (`@/components/unit-chip`), never a
// deep file.
//
// It lives in its own family rather than beside the other shared v2 planner
// atoms (components/planner-v2) on purpose: it imports the workspace host, whose
// <UnitExplorer> reaches back into planner-v2 for SubjGlyph / StatusDot /
// ForkCues. Putting it in that barrel would close an import cycle
// (planner-v2 → year-v2 → planner-v2) of exactly the kind that produced the
// /teach TDZ crash. From here the graph stays acyclic:
// day-v2 / week-v2 / weekly → unit-chip → year-v2 → planner-v2 → ui.

export { UnitChip } from "./UnitChip";
export type { UnitChipProps } from "./UnitChip";
