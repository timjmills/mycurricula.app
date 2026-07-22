// Public surface of the v2 Lesson Planner (Wave 7). Consumers import from the
// folder (`@/components/lesson-plan-v2`), never a deep file.
//
// PlanPage is the Explorer's "Lesson Planner" mode (Builder A); the six tab
// bodies live in ./tabs (Builder B) and are reached through PlanPage, not this
// barrel — a tab is never mounted on its own.
//
// NOTE: PlanPage deep-imports `@/components/year-v2/ExplorerShell` rather than
// the `@/components/year-v2` barrel. That barrel re-exports UnitExplorer, which
// imports THIS barrel — going through it would close an import cycle. The shell
// is a leaf module, so the deep import is the acyclic path.

export { PlanPage } from "./PlanPage";
export type { PlanPageProps, PlanTabKey } from "./PlanPage";
// Status wording is shared with ./tabs, which must import the LEAF
// (`../lesson-status`) rather than this barrel — see the cycle note above.
export {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_SHORT,
  isTaught,
} from "./lesson-status";
