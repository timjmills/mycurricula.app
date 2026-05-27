"use client";

// RightIconRail.tsx — the right-side mirror of GlobalRail. Wave 1.5 Lane FA
// introduced teacher-arrangeable icon rails: every button on the left rail
// can be dragged across to this rail and stays there until moved back. The
// rail is mounted by the planner shell on every planner route so the
// arrangement applies consistently across /weekly, /daily, /year,
// /catch-up, /subject, /schedule.
//
// ── Empty-state guarantee ────────────────────────────────────────────────
// The right rail starts EMPTY by default. To keep dnd-kit's collision
// detection working (and to surface the "you can move icons here" affordance
// to first-time teachers), the rail still mounts in the DOM when empty —
// we just render a quiet vertical hint instead of a button list. The first
// drop fills it; subsequent drops can re-order within.
//
// ── No bottom-pinned slot ───────────────────────────────────────────────
// Unlike GlobalRail, the right rail does not special-case the settings
// gear. If a teacher drags `settings` over, it sits in the main list at
// whichever index it landed on. The settings affordance still works
// (clicking it navigates) — only its visual position changes.
//
// ── DndContext ownership ─────────────────────────────────────────────────
// This component does NOT create its own DndContext. The planner shell
// layout wraps BOTH rails in one shared DndContext so dnd-kit can move
// ids across the rail boundary. This file only registers a SortableContext
// for the right-rail items.

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRailLayout } from "@/lib/use-rail-layout";
import { RailIcon } from "./rail-icons";
import styles from "./RightIconRail.module.css";

export function RightIconRail(): ReactNode {
  const { layout } = useRailLayout();
  const pathname = usePathname();
  const rightIds = layout.right;

  const railAriaLabel = "Planner navigation (right rail)";

  return (
    <nav
      className={styles.rail}
      aria-label={railAriaLabel}
      data-rail-side="right"
    >
      <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
        <ul
          className={styles.list}
          role="list"
          data-rail-side="right"
          aria-label="Right rail icons"
        >
          {rightIds.map((id) => (
            <RailIcon
              key={id}
              id={id}
              side="right"
              pathname={pathname ?? null}
            />
          ))}
          {/* Empty-state hint. The list is still focusable / drop-able so
              dnd-kit can land an icon here even though no buttons render. */}
          {rightIds.length === 0 && (
            <li className={styles.emptyHint} aria-hidden="true">
              Drag icons here
            </li>
          )}
        </ul>
      </SortableContext>
    </nav>
  );
}
