import { describe, it, expect } from "vitest";

import SubjectSlugPage, {
  generateStaticParams,
} from "@/app/(planner)/subject/[slug]/page";

// The legacy /subject/[slug] route is a redirect shim: a valid subject slug
// forwards to /year?subject=<slug>, an unknown slug forwards to the
// all-subjects /year. There was no test asserting that mapping — this exercises
// the REAL page component (no seam extraction, no server) by catching the
// `redirect()` throw and reading its NEXT_REDIRECT digest.
//
// Next's redirect() throws an Error whose `digest` is
// `NEXT_REDIRECT;<kind>;<url>;<status>;` — the destination is the 3rd segment.
// (Verified against the installed Next: kind="replace", status=307.)

/** The eight valid subject ids, matching VALID_SUBJECT_IDS in the page. If the
 *  locked subject set ever changes, this list — and the page — must move
 *  together; the generateStaticParams assertion below guards that coupling. */
const VALID_SUBJECTS = [
  "math",
  "reading",
  "writing",
  "grammar",
  "spelling",
  "ufli",
  "explorers",
  "sel",
] as const;

/** Drive the page for one slug and return the redirect destination it throws. */
async function destinationFor(slug: string): Promise<string> {
  try {
    await SubjectSlugPage({ params: Promise.resolve({ slug }) });
  } catch (err) {
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      // NEXT_REDIRECT;<kind>;<url>;<status>;
      return digest.split(";")[2] ?? "";
    }
    throw err;
  }
  throw new Error(`Expected a redirect for slug "${slug}", but none was thrown`);
}

describe("/subject/[slug] redirect mapping", () => {
  it("forwards every valid subject slug to /year?subject=<slug>", async () => {
    for (const slug of VALID_SUBJECTS) {
      expect(await destinationFor(slug)).toBe(`/year?subject=${slug}`);
    }
  });

  it("forwards an unknown slug to the all-subjects /year", async () => {
    for (const slug of ["not-a-subject", "MATH", "reading ", "u-m3", ""]) {
      expect(await destinationFor(slug)).toBe("/year");
    }
  });

  it("is case-sensitive — 'Math' is not the subject 'math'", async () => {
    expect(await destinationFor("Math")).toBe("/year");
    expect(await destinationFor("math")).toBe("/year?subject=math");
  });
});

describe("/subject/[slug] generateStaticParams", () => {
  it("pre-renders exactly the eight valid subject slugs", () => {
    const params = generateStaticParams();
    expect(params.map((p) => p.slug).sort()).toEqual(
      [...VALID_SUBJECTS].sort(),
    );
  });
});
