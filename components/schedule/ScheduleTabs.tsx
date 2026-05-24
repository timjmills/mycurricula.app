"use client";

// ScheduleTabs.tsx — Bell Schedule | Daily Schedule | Events three-way tab.
//
// A thin wrapper around the canonical ToggleGroup primitive — using the
// existing toggle keeps the keyboard story (Arrow keys + Enter), focus ring,
// and visual treatment consistent with every other segmented control in the
// app (Personal/Master, Grid/List, etc.). When the planned ToggleGroup
// redesign lands, this surface updates for free.
//
// The "tab" framing is product copy only — semantically these are radio
// options (one is active at a time, switching changes what content is
// rendered below). role="radiogroup" + role="radio" matches that.

import type { ReactNode } from "react";
import { ToggleGroup, type ToggleOption } from "@/components/ui";

export type ScheduleTab = "bell" | "daily" | "events";

const TAB_OPTIONS: ReadonlyArray<ToggleOption<ScheduleTab>> = [
  { value: "bell", label: "Bell Schedule" },
  { value: "daily", label: "Daily Schedule" },
  { value: "events", label: "Events" },
];

export interface ScheduleTabsProps {
  value: ScheduleTab;
  onChange: (next: ScheduleTab) => void;
  className?: string;
}

export function ScheduleTabs({
  value,
  onChange,
  className,
}: ScheduleTabsProps): ReactNode {
  return (
    <ToggleGroup<ScheduleTab>
      options={[...TAB_OPTIONS]}
      value={value}
      onChange={onChange}
      ariaLabel="Schedule tab"
      variant="subtle"
      size="sm"
      className={className}
    />
  );
}
