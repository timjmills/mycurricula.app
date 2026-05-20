"use client";

// LeftRail.tsx — DEPRECATED in the 3-column Daily restructure.
//
// Previously this composed <TodayTodos> + <Shoutbox> in a "left rail"
// stacked beneath the lesson list. The 3-column Daily layout (Image 12 /
// task brief) moves both panels into the new <RightRail> on the far right
// of the body, alongside the new <ResourcesPanel>. The lesson list column
// is now solely about the day's lessons + events.
//
// The file is kept as a tiny no-op so any lingering import path doesn't
// break a parallel agent's checkout. It is no longer rendered by
// DailyView, and the barrel (components/daily/index.ts) no longer
// re-exports it. New code should not use this; consume <RightRail>
// instead.

import type { ReactNode } from "react";

interface LeftRailProps {
  /** Active week — kept on the prop shape for backward compatibility. */
  week: number;
  /** Active day index, 0 = Sunday. */
  day: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LeftRail(_props: LeftRailProps): ReactNode {
  // Intentionally renders nothing. See module-header note.
  return null;
}
