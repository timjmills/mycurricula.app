// The Resource Wall route (v2, Wave 9a) — the NET-NEW "/post" surface.
//
// A thin server page: it reads the focus anchors off the URL and hands them to
// the client wrapper, which owns the store wiring. Deep-link shapes:
//   /post                          → "Today's Lessons (Mixed)" (no focus)
//   /post?lesson=<id>              → "Current Lesson" anchored to that lesson
//   /post?subject=<id>             → subject-scoped presets have an anchor
//   /post?subject=<id>&unit=<id>   → "Unit View" (unit ids are unique only
//                                    WITHIN a subject, so unit requires subject)
//   /post?preset=<WallPreset>      → land on that preset outright
//
// `?preset=` is a SEPARATE axis from the anchors above. The anchors say WHAT
// the teacher arrived from and the landing preset is inferred from them
// (anchoredPreset); this says which wall to open directly, which is the only
// way to reach the two WEEK presets — no anchor combination yields
// "This Week · Mixed" or "This Week · Subject", so before this param they were
// reachable only by clicking through the toolbar. /weekly's Resources button
// is the first caller (lib/wall-link.ts owns the URL).
//
// Strictly additive: an absent, unknown, or repeated value is dropped and the
// route behaves exactly as it did before.
// Anchor VALIDITY is resolved client-side against the live stores; a bad id
// resolves to an empty wall rather than a crash or a wrong-plan fallback.
import { WALL_PRESETS, type WallPreset } from "@/lib/wall-scope";
import { PostClient } from "./PostClient";

/** Narrow an arbitrary query value to the closed preset union. Anything else —
 *  a typo, a stale link, an array from a repeated param — becomes null, which
 *  the client treats as "no preset asked for". Validating here rather than
 *  client-side keeps the union in one place and means a bad link can never
 *  reach the wall as a string it does not understand. */
function parsePreset(value: string | null): WallPreset | null {
  return value !== null && (WALL_PRESETS as readonly string[]).includes(value)
    ? (value as WallPreset)
    : null;
}

export default async function PostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  return (
    <PostClient
      lessonId={first(params.lesson)}
      subjectId={first(params.subject)}
      unitId={first(params.unit)}
      preset={parsePreset(first(params.preset))}
    />
  );
}
