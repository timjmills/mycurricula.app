// year-scope.ts — the drill-down scope for the merged Yearly view.
//
// The Yearly view is a progressive drill: ALL subjects (the timeline) → focus
// one SUBJECT → a UNIT → a WEEK. The dashboard, breadcrumb, and standards
// coverage all re-scope to wherever you are. A selected lesson is orthogonal
// (it opens the right-hand pane at any scope ≥ week), so it is tracked
// separately, not as a scope level.

import type { SubjectId } from "@/lib/types";

export type YearScope =
  | { level: "all" }
  | { level: "subject"; subjectId: SubjectId }
  | { level: "unit"; subjectId: SubjectId; unitId: string }
  | { level: "week"; subjectId: SubjectId; unitId: string; week: number };

/** The subjectId of the current scope, or null at the all-subjects level. */
export function scopeSubjectId(scope: YearScope): SubjectId | null {
  return scope.level === "all" ? null : scope.subjectId;
}
