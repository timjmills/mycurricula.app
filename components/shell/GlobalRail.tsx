"use client";

// GlobalRail.tsx — the slim vertical icon nav strip mounted by the
// planner shell (app/(planner)/layout.tsx) on every planner route.
//
// ── Why it lives here (not under components/daily) ───────────────────────
// The user wants the left rail to be the SITE-WIDE chrome — surfaces that
// belong to "the app" rather than a single view. The right rail is reserved
// for context-specific affordances (Resources, To-dos, Shoutbox, etc.) and
// stays owned by the view. Promoting this rail from Daily/Weekly into the
// shell layer means it appears on Weekly, Daily, Year, Catch-up, Subject,
// and Schedule without each view having to mount its own copy.
//
// ── Wave 1.5 Lane FA — drag-arrangeable icons ────────────────────────────
// Each icon button can now be dragged between the LEFT rail (this file) and
// the RIGHT rail (RightIconRail.tsx). Arrangement persists per-teacher to
// localStorage via `useRailLayout` (lib/use-rail-layout.ts). The actual
// drag wiring (DndContext + onDragEnd) lives in the planner shell layout
// so a single DndContext spans both rails — that's the only way dnd-kit
// can coordinate cross-rail drops.
//
// This file's job is narrower than before:
//   1. Read `layout.left` from useRailLayout.
//   2. Register a `SortableContext` for that list.
//   3. Render one <RailIcon> per id; the settings icon (when present on
//      the left rail) gets a bottom-pinned chrome treatment.
//
// The icon definitions, the onClick wiring, and the sortable-wrapper logic
// all live in components/shell/rail-icons.tsx so RightIconRail can re-use
// them without duplication.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────
//   • Tailwind = layout only. All color / type / spacing via tokens.css.
//   • The rail is subject-neutral (ink tokens only).
//   • Every interactive button is a ≥44px tap target (WCAG AA).
//   • Icons follow the Lucide-style inline-SVG idiom.
//   • Onboarding tooltips on every button (CLAUDE.md §4) — including the
//     new "Drag to move to the other rail" hint added in rail-icons.tsx.
//   • Reduced motion respected by dnd-kit's sortable transition (it returns
//     null transition under prefers-reduced-motion so transforms snap).

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRailLayout } from "@/lib/use-rail-layout";
// SchedulePanel — the right-side drawer that exposes today's timetable.
// Lane DD mounts it once at the rail level so it's reachable from every
// planner route. The rail is itself mounted by the planner shell layout,
// so the panel ships everywhere the rail ships (audit F#8). State comes
// from useAppState so the trigger here and the panel share one toggle.
import { SchedulePanel } from "@/components/schedule";
import { RailIcon } from "./rail-icons";
import styles from "./GlobalRail.module.css";

// ── GlobalRail ───────────────────────────────────────────────────────────

export function GlobalRail(): ReactNode {
  const { scheduleOpen, closeSchedulePanel } = useAppState();
  const { layout } = useRailLayout();
  const pathname = usePathname();

  const isOnDaily = pathname?.startsWith("/daily") ?? false;
  const railAriaLabel = isOnDaily
    ? "Daily view navigation"
    : "Planner navigation";

  // Settings gets the bottom-pinned slot when it lives on this rail. The
  // SortableContext.items array still includes it (so dnd-kit registers it),
  // but its DOM position is the bottom <ul>, not the main list.
  const leftIds = layout.left;
  const hasSettingsOnLeft = leftIds.includes("settings");
  const mainIds = hasSettingsOnLeft
    ? leftIds.filter((id) => id !== "settings")
    : leftIds;

  return (
    <nav className={styles.rail} aria-label={railAriaLabel}>
      {/* SortableContext wraps the icon list so dnd-kit knows the order of
          ids on this rail. The cross-rail DndContext lives in the planner
          layout so a single sensor session can move ids from left → right
          (and vice versa). */}
      <SortableContext items={leftIds} strategy={verticalListSortingStrategy}>
        <ul className={styles.list} role="list" data-rail-side="left">
          {mainIds.map((id, idx) => (
            <RailIcon
              key={id}
              id={id}
              side="left"
              pathname={pathname ?? null}
              /* W3-C7: only the FIRST icon on the left rail gets the
                 first-session pulse — singular per the audit spec. The
                 right rail starts empty so it never carries the intro. */
              isFirstOnRail={idx === 0}
            />
          ))}
        </ul>

        {/* ── Schedule side-panel — global mount (Lane DD) ─────────────
              One mount, here at the rail level. The trigger button is
              <RailIcon id="schedule" /> above; both share the
              `scheduleOpen` flag from useAppState so the icon and the
              drawer never desync. */}
        <SchedulePanel open={scheduleOpen} onClose={closeSchedulePanel} />

        {/* ── Bottom-pinned settings gear ─────────────────────────────
              Only renders when the settings id lives on the LEFT rail
              (its default). When a teacher drags it to the right rail
              the regular RailIcon path renders it inside the right-rail
              list. */}
        {hasSettingsOnLeft && (
          <div className={styles.bottom} data-context="global">
            <ul className={styles.list} role="list" data-rail-pinned="true">
              <RailIcon id="settings" side="left" pathname={pathname ?? null} />
            </ul>
          </div>
        )}
      </SortableContext>
    </nav>
  );
}
