// year-preview.ts — the `?preview=` contract for /year.
//
// NO "use client" HERE, and that is the entire point of the file rather than
// keeping this beside the shell. `app/(planner)/year/page.tsx` is a server
// component and CALLS the parser; a function exported from a "use client"
// module is a client reference, so calling it on the server throws
// "Attempted to call parseYearPreview() from the server but parseYearPreview is
// on the client" and the route 500s. It did — the unit tests all passed, because
// vitest imports every module plainly and has no server/client boundary; only
// the live probe caught it. Anything the route needs to CALL lives here.
//
// Same split /weekly uses: the route parses its search params (via
// lib/deep-links) and hands the result to the client shell as a prop.

/** The paper-Year candidates a teacher can put on screen with a URL parameter.
 *  `null` = no preview, i.e. today's Year. */
export type YearPreview = "subject-led" | "frame-b" | null;

/**
 * Parse the `?preview=` value.
 *
 * Takes the raw param as Next hands it over — Next gives repeated params as
 * `string[]`, and this scheme is single-valued, so the FIRST occurrence wins
 * (the same convention /weekly and /daily use).
 *
 * Anything unrecognised — a typo, an empty value, a stray `preview=` meant for
 * something else — falls back to `null`. A bad parameter must land a teacher on
 * the working Year, never on a blank screen.
 */
export function parseYearPreview(
  raw: string | string[] | undefined,
): YearPreview {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "subject-led" || value === "frame-b" ? value : null;
}
