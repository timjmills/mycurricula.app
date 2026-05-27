// The Daily view — two-pane lesson list and detail panel (planning_document
// §5.3). Left pane: day's lessons. Right pane: lesson detail or dashboard.
//
// W1-V5: when /daily is reached via a Subject→Daily jump link (e.g.
// `/daily?lesson=<id>` from SubjectView's row click), the lesson id is
// resolved here on the server and passed down so DailyView can seed its
// initial `selectedId` to the intended lesson instead of "first not-done".
import { DailyView } from "@/components/daily";

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialLessonId =
    typeof params.lesson === "string" ? params.lesson : undefined;
  return <DailyView initialLessonId={initialLessonId} />;
}
