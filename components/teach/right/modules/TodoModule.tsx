"use client";

// TodoModule.tsx — the Teach right panel's To-do module (plan §3.1, §6.3).
//
// Reuses the Daily `<TodayTodos>` verbatim — the same today-scoped slice of
// to-dos with completion checkboxes + quick-add. No logic is forked; this thin
// wrapper exists only so the Teach right panel mounts the to-do list by the
// canonical module name and keeps the prop seam (for future day-scoping) in one
// place.
//
// As with ChatModule, the collapse + drag chrome lives on the Teach panel/rail,
// not inside the module body, so we omit `collapsed`/`onToggleCollapsed`/
// `dragHandleProps` and the panel renders fully expanded.

import type { ReactNode } from "react";
import { TodayTodos } from "@/components/daily/TodayTodos";

export type TodoModuleProps = Record<string, never>;

export function TodoModule(): ReactNode {
  return <TodayTodos />;
}
