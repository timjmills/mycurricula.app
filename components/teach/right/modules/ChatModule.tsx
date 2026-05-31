"use client";

// ChatModule.tsx — the Teach right panel's Chat module (plan §3.1, §6.2).
//
// The Teach Chat module IS the Daily "Today's Shoutbox" — the same team-visible,
// by-date thread (planning doc §4 `anchor_type = day_shoutbox`). Rather than
// fork its logic we REUSE the Daily `<Shoutbox>` verbatim and feed it the active
// week/day from `useAppState()`. The Shoutbox owns its own seeding, composer,
// and unread badge; this wrapper only resolves the day scope so the Teach
// surface and the Daily view show the identical thread.
//
// We deliberately do NOT pass `collapsed`/`onToggleCollapsed`/`dragHandleProps`
// here — in the Teach layout the collapse + reorder live on the panel/rail
// chrome (TeachRightPanel + TeachRightRail), not inside the module body. The
// Shoutbox renders fully expanded with no chevron when those props are omitted.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { Shoutbox } from "@/components/daily/Shoutbox";

export interface ChatModuleProps {
  /**
   * Optional explicit week/day override. When omitted the module reads the
   * active week + focused day from `useAppState()` so it tracks whatever day
   * the teacher is teaching. Integration may pass these once the Teach surface
   * carries its own day cursor.
   */
  week?: number;
  day?: number;
}

export function ChatModule({ week, day }: ChatModuleProps = {}): ReactNode {
  const { week: stateWeek, selectedDay } = useAppState();
  return <Shoutbox week={week ?? stateWeek} day={day ?? selectedDay} />;
}
