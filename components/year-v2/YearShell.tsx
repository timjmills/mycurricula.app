"use client";

// YearShell — the /year frame router (Wave 6).
//
// /year branches on useTheme().frame in this thin shell (mirroring the
// WeeklyShell.renderGridPanel frame seam, but at the whole-view level):
//
//   • glass → <YearA/>          — NEW: subject lanes under a month scale.
//   • paper → <TimelineYear/>   — EXISTING, untouched: the merged drill view
//                                 (sidebar, lesson pane, standards coverage,
//                                 ?subject= drill deep link).
//   • color → <YearC/>          — NEW: the subject "constellation" of unit
//                                 progress discs (ported from the legacy
//                                 YearConstellation, upgraded so a node opens
//                                 the Unit Explorer modal instead of drilling).
//
// The glass + color frames share ONE data derivation (the per-subject unit
// lanes, computed here once from the live planner store) and ONE modal host:
// clicking a unit chip / disc opens <UnitExplorer> over the view. Paper's
// <TimelineYear> manages its own drill + selection state, so it takes no props.
//
// DEAD-BRANCH NOTE (for the lead): TimelineYear still contains its own
// `frame === "color"` swap to YearConstellation (TimelineYear.tsx ~:618 /
// :820). With YearShell branching the color frame to <YearC/> here,
// TimelineYear only ever renders on the PAPER path, so that internal color
// swap is now unreachable dead logic. It is intentionally NOT edited (not this
// builder's file) — flagged for a follow-up cleanup.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { TimelineYear } from "@/components/year";
import { unitLessons, unitProgress } from "@/lib/year-v2-data";
import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";
import { YearA } from "./YearA";
import { YearC } from "./YearC";
import { UnitExplorer } from "./UnitExplorer";
import { useTheme } from "@/lib/theme";

// ── Shared lane shapes (consumed by YearA + YearC) ──────────────────────────

/** One unit node in a subject lane. Progress is REAL taught/total from the
 *  store (done lessons / all lessons of that subject+unit). */
export interface YearUnitNode {
  /** Lesson.unit id — the value handed to <UnitExplorer unit=…>. */
  id: string;
  /** Short label ("Unit N · " lead-in stripped). */
  label: string;
  /** Full unit name for the hover tooltip. */
  fullName: string;
  /** Lessons in this unit with status "done" (archived excluded). */
  done: number;
  /** All lessons in this unit. 0 ⇒ the unit renders as unstarted. */
  total: number;
}

/** One subject lane — a subject and its ordered units. */
export interface YearSubjectLane {
  subject: Subject;
  /** True when the subject has any catalog units (distinguishes "none
   *  planned" from an empty derivation). */
  hadUnits: boolean;
  units: YearUnitNode[];
  /** Subject-level % complete — lesson-weighted across the lane's units. */
  pct: number;
}

// ── Derivation (mirrors TimelineYear.buildSubjectGroups) ────────────────────

/** Parse a unit.weeks label like "Wk 11–16" / "Wk 12" into its start week. */
function unitStartWeek(unit: Unit): number {
  const nums = unit.weeks.match(/\d+/g);
  if (!nums || nums.length === 0) return Number.MAX_SAFE_INTEGER;
  return Number(nums[0]);
}

/** Strip the "Unit N · " lead-in so a chip shows just the unit title. */
function stripUnitPrefix(name: string): string {
  const idx = name.indexOf("·");
  return idx === -1 ? name.trim() : name.slice(idx + 1).trim();
}

/**
 * Build the per-subject lanes from the live catalog + lessons. Same subject
 * source/order the mounted TimelineYear uses (usePlanner().subjects, and every
 * catalog unit for the subject — a zero-lesson unit still renders as
 * unstarted), ordered by each unit's first taught week (fallback: the unit's
 * declared span). Archived lessons are excluded everywhere, matching the
 * timeline.
 */
function buildLanes(
  subjects: Subject[],
  lessons: Lesson[],
  allUnits: Unit[],
): YearSubjectLane[] {
  return subjects.map((subject) => {
    const units = allUnits.filter((u) => u.subject === subject.id);
    const nodes = units
      .map((unit) => {
        // Match on subject AND unit, never unit alone: unit slugs are only
        // unique WITHIN a subject, so a collision across subjects would inflate
        // the other subject's counts and reorder its lanes (Codex W6 R2). This
        // is the same filter the Explorer uses — share the tested helper rather
        // than re-implementing it (it also drops archived).
        const inUnit = unitLessons(lessons, subject.id, unit.id);
        const { total, taught } = unitProgress(inUnit);
        const start =
          inUnit.length > 0
            ? Math.min(...inUnit.map((l) => l.week))
            : unitStartWeek(unit);
        return {
          id: unit.id,
          label: stripUnitPrefix(unit.name) || unit.name,
          fullName: unit.name,
          done: taught,
          total,
          start,
        };
      })
      .sort((a, b) => a.start - b.start)
      // Drop the sort-only `start` field from the public node shape.
      .map(
        (n): YearUnitNode => ({
          id: n.id,
          label: n.label,
          fullName: n.fullName,
          done: n.done,
          total: n.total,
        }),
      );

    const total = nodes.reduce((acc, u) => acc + u.total, 0);
    const done = nodes.reduce((acc, u) => acc + u.done, 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { subject, hadUnits: units.length > 0, units: nodes, pct };
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export function YearShell(): ReactNode {
  const { frame } = useTheme();
  const { lessons, subjects, units: allUnits } = usePlanner();

  // The open Unit Explorer target (glass + color frames only; paper's
  // TimelineYear manages its own drill). `{ subjectId, unit }` mirrors the
  // pinned <UnitExplorer> interface.
  const [openUnit, setOpenUnit] = useState<{
    subjectId: SubjectId;
    unit: string;
  } | null>(null);

  const openUnitExplorer = useCallback(
    (subjectId: SubjectId, unit: string) => setOpenUnit({ subjectId, unit }),
    [],
  );
  const closeUnitExplorer = useCallback(() => setOpenUnit(null), []);

  // FRAME-SURVIVAL (user-locked decision, 2026-07-24): the open workspace
  // SURVIVES an appearance/frame change instead of being dismissed. An earlier
  // effect here cleared `openUnit` on every `frame` change — that is gone.
  //
  // Why it's safe now: the glass + color frames BOTH mount this host, so a
  // glass⇄color flip just re-renders the open workspace, which re-skins through
  // the shared token cascade (no remount, no data loss). A flip to `paper` takes
  // the early-return below and unmounts the host, but `openUnit` is preserved,
  // so flipping back to glass/color re-opens the same unit — the workspace is
  // read-only until B1.7, so there is nothing to lose by keeping it open, and
  // "survive the frame change" is the intended behavior. Cross-device theme-sync
  // flipping the frame no longer yanks a teacher's open unit out from under them.

  // Lanes are only consumed by YearA/YearC; deriving them on the paper path is
  // harmless (memoized, cheap) and keeps the branch below simple.
  const lanes = useMemo(
    () => buildLanes(subjects, lessons, allUnits),
    [subjects, lessons, allUnits],
  );

  // Paper keeps the existing merged drill view entirely (own state + deep link).
  if (frame === "paper") {
    return <TimelineYear />;
  }

  // Glass + color: the new frames + the shared Unit Explorer modal host.
  return (
    <>
      {frame === "color" ? (
        <YearC lanes={lanes} onOpenUnit={openUnitExplorer} />
      ) : (
        <YearA lanes={lanes} onOpenUnit={openUnitExplorer} />
      )}
      {openUnit ? (
        <UnitExplorer
          subjectId={openUnit.subjectId}
          unit={openUnit.unit}
          onClose={closeUnitExplorer}
          onUnitChange={openUnitExplorer}
        />
      ) : null}
    </>
  );
}
