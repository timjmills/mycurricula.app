"use client";

// IconRail.tsx — back-compat shim (Lane CC + Lane DD).
//
// ── What this file used to be ─────────────────────────────────────────────
// The slim vertical icon strip on the far-left of the Daily view. It
// hosted Today / Schedule / To-dos / Year-soon / Voice-soon buttons plus a
// bottom-pinned Settings gear, AND owned the local Schedule-drawer toggle
// + the SchedulePanel mount.
//
// ── What this file is now ────────────────────────────────────────────────
// A no-op. The rail has been promoted to `components/shell/GlobalRail.tsx`
// and is mounted by the planner shell layout (app/(planner)/layout.tsx)
// so it appears on every planner route — Weekly, Daily, Year, Catch-up,
// Subject, Schedule. Lane DD additionally un-context-gated the Schedule
// trigger and moved the SchedulePanel mount to GlobalRail with state on
// `useAppState` (lib/app-state.tsx), so the drawer is reachable from
// every route (audit F#8).
//
// This shim stays alive ONLY because DailyView.tsx and WeeklyShell.tsx
// still render `<IconRail />` inside their body grids — see the call
// sites at `components/daily/DailyView.tsx:~1837` and
// `components/weekly/WeeklyShell.tsx:~946`. Returning `null` here means
// those mounts produce nothing: the GlobalRail at the layout level is
// the one and only rail you see. A later wave (Lane CD / clean-up) can
// remove the IconRail call sites and delete this file entirely.
//
// We keep IconRail.module.css untouched so existing :global selectors
// or any code referencing those class names doesn't break.

import { type ReactNode } from "react";

/**
 * Back-compat shim — renders nothing. The real rail lives at
 * `components/shell/GlobalRail.tsx` and is mounted globally by the
 * planner shell. See the file header above.
 */
export function IconRail(): ReactNode {
  return null;
}
