"use client";

// TodoModule.tsx — the To-do module adapter for the Teach panel.
//
// Thin reuse wrapper around the Daily view's right-rail to-do panel —
// components/daily/TodayTodos. Per the Wave-1 reuse map
// (docs/teach-view-plan.md), the To-do module surfaces existing Daily data and
// gets no new table; we just mount the existing panel inside a Teach tab.
//
// TodayTodos takes no required context — it reads the "today" bucket from the
// TODOS mock internally and manages its own local working copy — so this
// adapter is the thinnest of the three. The rail-only props (dragHandleProps /
// collapsed / onToggleCollapsed) stay unwired; the Teach panel owns collapse
// and resize (panels-ui half), so inside a tab the to-do list is always its
// fully-expanded self.

import type { ReactNode } from "react";
import { TodayTodos } from "@/components/daily";

export function TodoModule(): ReactNode {
  return <TodayTodos />;
}
