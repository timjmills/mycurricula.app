// Dynamic Subject route — /subject/[slug]
//
// The slug is a SubjectId (math | reading | writing | grammar | spelling |
// ufli | explorers | sel). This page passes the validated slug to
// SubjectView as `initialSubject` so:
//   1. Refreshing on /subject/reading stays on Reading.
//   2. Sharing or bookmarking /subject/math opens Math directly.
//   3. The browser's Back/Forward history follows subject switches.
//
// An unknown slug redirects to the default subject (/subject/math) rather
// than showing a 404, because a typo in a bookmarked URL is recoverable.
// Grade-scoping is not affected — SubjectView already reads lessons from
// the planner store which is grade-aware.
//
// SUBJECT-DEEPLINK-001 / MED-4 / POLISH-009 / PERSIST-001

import { redirect } from "next/navigation";
import type { SubjectId } from "@/lib/types";
import { SubjectView } from "@/components/subject";

/** The ordered set of valid SubjectId values — kept in sync with lib/types.ts.
 *  Using a plain Set for O(1) lookup at request time. */
const VALID_SUBJECT_IDS = new Set<string>([
  "math",
  "reading",
  "writing",
  "grammar",
  "spelling",
  "ufli",
  "explorers",
  "sel",
]);

/** The default subject when none is specified or slug is unrecognised. */
const DEFAULT_SUBJECT: SubjectId = "math";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SubjectSlugPage({ params }: Props) {
  const { slug } = await params;

  // Guard against unknown slugs — redirect to default rather than 404 so
  // stale bookmarks land somewhere sensible. Swap to `import { notFound }
  // from "next/navigation"` if the product direction ever changes to strict
  // URL validation.
  if (!VALID_SUBJECT_IDS.has(slug)) {
    redirect(`/subject/${DEFAULT_SUBJECT}`);
  }

  return <SubjectView initialSubject={slug as SubjectId} />;
}

// generateStaticParams lets the build pre-render each subject page so the
// first paint on a direct URL is served from static HTML. The list must
// match VALID_SUBJECT_IDS above.
export function generateStaticParams() {
  return [...VALID_SUBJECT_IDS].map((slug) => ({ slug }));
}
