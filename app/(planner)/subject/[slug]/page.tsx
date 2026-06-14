// Legacy dynamic Subject route — /subject/[slug] → /year?subject=<slug>.
//
// The Curriculum view was merged into the Yearly view (/year). A valid subject
// slug forwards to the Yearly view focused on that subject (TimelineYear reads
// the ?subject= param on mount and drills the scope to it); an unknown slug
// forwards to the all-subjects Yearly view. Kept as a thin redirect shim so old
// bookmarks, shared links, and the browser history all resolve.
//
// SUBJECT-DEEPLINK-001 / MED-4 — superseded by the Curriculum↔Yearly merge.

import { redirect } from "next/navigation";

/** The ordered set of valid SubjectId values — kept in sync with lib/types.ts. */
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

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SubjectSlugPage({ params }: Props) {
  const { slug } = await params;
  redirect(
    VALID_SUBJECT_IDS.has(slug)
      ? `/year?subject=${encodeURIComponent(slug)}`
      : "/year",
  );
}

// Pre-render one redirect page per subject so direct hits on a stale
// /subject/<id> bookmark resolve from static output. Must match
// VALID_SUBJECT_IDS above.
export function generateStaticParams() {
  return [...VALID_SUBJECT_IDS].map((slug) => ({ slug }));
}
