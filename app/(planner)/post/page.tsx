// The Resource Wall route (v2, Wave 9a) — the NET-NEW "/post" surface.
//
// A thin server page: it reads the focus anchors off the URL and hands them to
// the client wrapper, which owns the store wiring. Deep-link shapes:
//   /post                          → "Today's Lessons (Mixed)" (no focus)
//   /post?lesson=<id>              → "Current Lesson" anchored to that lesson
//   /post?subject=<id>             → subject-scoped presets have an anchor
//   /post?subject=<id>&unit=<id>   → "Unit View" (unit ids are unique only
//                                    WITHIN a subject, so unit requires subject)
// Anchor VALIDITY is resolved client-side against the live stores; a bad id
// resolves to an empty wall rather than a crash or a wrong-plan fallback.
import { PostClient } from "./PostClient";

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
    />
  );
}
