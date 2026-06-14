// /subject — legacy route.
//
// The Curriculum view was merged into the Yearly view (/year), which is now a
// progressive drill: all subjects → a subject → a unit → a week → a lesson.
// A bare /subject visit (old bookmark, stale link) forwards to the all-subjects
// Yearly view. The dynamic /subject/[slug] forwards to /year?subject=<slug>.
import { redirect } from "next/navigation";

export default function SubjectPage() {
  redirect("/year");
}
