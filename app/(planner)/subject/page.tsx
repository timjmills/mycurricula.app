// /subject — redirect to the default subject slug.
//
// The canonical URL for the Subject view is now /subject/[slug]. A bare
// /subject visit (e.g. from a side-nav link that hasn't been updated yet, or
// a user's bookmark) is silently forwarded to the default subject so no one
// lands on a dead page.  MED-4 / SUBJECT-DEEPLINK-001.
import { redirect } from "next/navigation";

export default function SubjectPage() {
  redirect("/subject/math");
}
