"use client";

// ResourcesModule.tsx — the Resources module adapter for the Teach panel.
//
// Thin reuse wrapper: the Teach view's Resources tab is the SAME panel the
// Daily view's right rail renders — components/daily/ResourcesPanel. Mounting
// it here (rather than rebuilding) keeps the resource vocabulary one family
// across surfaces, per the Wave-1 reuse map (docs/teach-view-plan.md §"Reuse
// map").
//
// The module receives the active lesson from the registry's render context.
// ResourcesPanel already handles a null lesson with its own empty state
// ("Select a lesson to see resources."), so we pass it straight through and
// let it own the empty case. We do NOT wire the rail-only props
// (dragHandleProps / collapsed / onToggleCollapsed) — the Teach panel chrome
// (tabs, collapse, resize) lives in TeachPanel, owned by the panels-ui half;
// inside a Teach tab the Resources panel is always its fully-expanded self.

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { ResourcesPanel } from "@/components/daily";

interface ResourcesModuleProps {
  /** The lesson whose resources to show, or null when none is selected. */
  lesson: Lesson | null;
}

export function ResourcesModule({ lesson }: ResourcesModuleProps): ReactNode {
  // Day-mode (the default) aggregates the single lesson's lesson-level +
  // section resources — exactly what the Teach view wants for the lesson the
  // teacher is delivering.
  return <ResourcesPanel lesson={lesson} />;
}
