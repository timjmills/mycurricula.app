// The Weekly view — the app's primary planning surface (planning_document
// §3.1). Renders inside a 3-panel shell that mirrors the Daily view:
//
//   body row → [icon rail] [weekly grid] [splitter] [right rail]
//
// The icon rail is the Daily-view IconRail; the global filter pane is
// suppressed on `/weekly*` (see components/shell/left-filter-panel.tsx)
// so this rail replaces it. The right rail is the Daily-view RightRail
// in WEEK mode — Resources aggregates across every lesson in the week,
// To-dos and Shoutbox stay day-scoped. The center is the existing
// WeeklyGrid unchanged.
//
// The WeeklyBoard day-column variant remains in components/weekly but is
// not active; WeeklyGrid is the canonical view.
//
// Deep links (UX roadmap item 07): `/weekly?week=14&subject=math&lesson=…
// &grade=…` is parsed HERE on the server via lib/deep-links and handed to
// WeeklyShell as `initialLink`, so a shared URL restores week + subject
// filter + open lesson detail on first paint. A missing/invalid `week`
// nulls the whole link (parseWeeklyParams) and the shell opens normally.
import { WeeklyShell } from "@/components/weekly";
import { parseWeeklyParams } from "@/lib/deep-links";

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Next hands repeated params as string[]; the deep-link scheme is
  // single-valued, so take the FIRST occurrence of each key (same
  // convention as /daily's lesson param).
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") sp.set(key, first);
  }
  const initialLink = parseWeeklyParams(sp);
  return <WeeklyShell initialLink={initialLink ?? undefined} />;
}
