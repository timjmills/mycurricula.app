// The Daily view — two-pane lesson list and detail panel (planning_document
// §5.3). Left pane: day's lessons. Right pane: lesson detail or dashboard.
//
// W1-V5: when /daily is reached via a Subject→Daily jump link (e.g.
// `/daily?lesson=<id>` from SubjectView's row click), the lesson id is
// resolved here on the server and passed down so DailyView can seed its
// initial `selectedId` to the intended lesson instead of "first not-done".
//
// Deep links (UX roadmap item 07): the same server-side read now also
// covers `/daily?date=YYYY-MM-DD&lesson=…&grade=…` via lib/deep-links'
// parseDailyParams. A valid `date` seeds the day pane's date through
// DailyView's `initialDate` prop; `grade` is parsed (and so survives the
// strict-but-forgiving validation) but has no single-grade consumer yet —
// the beta is one grade, and links never assume that (CLAUDE.md §1).
// `lesson` is still read INDEPENDENTLY of parseDailyParams because the
// existing Subject→Daily jump links carry a lesson with NO date, and
// parseDailyParams nulls the whole link when its required `date` is absent.
import { DailyView } from "@/components/daily";
import { parseDailyParams } from "@/lib/deep-links";

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Next hands repeated params as string[]; the deep-link scheme is
  // single-valued, so take the FIRST occurrence of each key.
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") sp.set(key, first);
  }
  const link = parseDailyParams(sp);
  const initialLessonId = sp.get("lesson") ?? undefined;
  return (
    <DailyView initialLessonId={initialLessonId} initialDate={link?.date} />
  );
}
