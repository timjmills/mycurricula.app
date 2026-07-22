"use client";

// WeekLayoutToggle.tsx — W3.8c: the Week EDIT board's Aligned/Stacked layout
// toggle, mounted in the ViewTitle appearance popover (the W3.5 per-view extras
// seam). Writes the `cc_pblayout` axis through usePbLayout() (lib/pblayout-
// state.ts); the board (components/weekly/WeekEditBoard) reads the same axis via
// the `cc-pblayout` event bus.
//
// SCOPE: renders ONLY on /weekly — the axis is meaningless on Day/Year, and the
// popover appears on those views too. The component self-gates on the route so
// ViewTitle can mount it unconditionally at the seam.
//
// The segmented control is the canonical <ToggleGroup> primitive (the app's one
// segmented-toggle surface) — NOT bespoke `.pb-seg` CSS. This module only adds
// the labeled-section chrome ("Board layout" eyebrow + hint) around it.
//
// The two options are a PERSONAL preference (how one teacher's board lays out),
// so their onboarding tooltips are dismissible (`tooltipId`, not required:true)
// — contrast the always-on Personal/Team + destructive-action tooltips.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ToggleGroup } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import { usePbLayout, type PbLayout } from "@/lib/pblayout-state";
import styles from "./WeekLayoutToggle.module.css";

// Option copy — labels stay short so the pill fits the ≤332px popover; the
// onboarding tooltip carries the full first-time-teacher explanation (CLAUDE.md
// §4 voice: what the choice ACCOMPLISHES for this teacher's board).
const OPTIONS: ReadonlyArray<ToggleOption<PbLayout>> = [
  {
    value: "aligned",
    label: "Aligned by time",
    title:
      "Line each day's lessons up in shared period rows by their start times, so the same period reads straight across all days.",
    tooltipId: "week-layout-aligned",
  },
  {
    value: "stacked",
    label: "Stacked",
    title:
      "Stack each day's lessons in the order they happen, without lining periods up across days.",
    tooltipId: "week-layout-stacked",
  },
];

export function WeekLayoutToggle(): ReactNode {
  const pathname = usePathname();
  const { layout, setLayout } = usePbLayout();

  // Weekly-only. Prefix match keeps it mounted on any nested /weekly route.
  const onWeekly = pathname === "/weekly" || pathname.startsWith("/weekly/");
  if (!onWeekly) return null;

  return (
    <div className={styles.section}>
      <span className={styles.eyebrow}>Board layout</span>
      <p className={styles.hint}>
        Only affects the Week edit board — how its lessons lay out.
      </p>
      <div className={styles.control}>
        <ToggleGroup<PbLayout>
          options={[...OPTIONS]}
          value={layout}
          onChange={setLayout}
          size="sm"
          ariaLabel="Week board layout"
        />
      </div>
    </div>
  );
}
