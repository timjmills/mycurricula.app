"use client";

// ChatModule.tsx — the Chat module adapter for the Teach panel.
//
// Thin reuse wrapper around the Daily view's per-day team chat —
// components/daily/Shoutbox ("Today's Shoutbox"). Per the Wave-1 reuse map
// (docs/teach-view-plan.md), Chat surfaces existing Daily data and gets no new
// table; we just mount the existing panel inside a Teach tab.
//
// Shoutbox is scoped by `week` + `day` (it shows that day's thread), so unlike
// Resources this module reads the planner's view state directly via
// `useAppState()` — the same source the Daily view uses to seed Shoutbox
// (DailyView passes `week` + `selectedDay`). The registry render context only
// carries the lesson, not week/day, so reading app-state here is the right
// seam: the chat follows whatever day the teacher is on.
//
// The rail-only props (dragHandleProps / collapsed / onToggleCollapsed) stay
// unwired — collapse/resize is the Teach panel's job (panels-ui half), so
// inside a tab the Shoutbox is always fully expanded.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { Shoutbox } from "@/components/daily";

export function ChatModule(): ReactNode {
  const { week, selectedDay } = useAppState();
  return <Shoutbox week={week} day={selectedDay} />;
}
