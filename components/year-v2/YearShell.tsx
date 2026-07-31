"use client";

// YearShell — the /year frame router (Wave 6).
//
// /year branches on useTheme().frame in this thin shell (mirroring the
// WeeklyShell.renderGridPanel frame seam, but at the whole-view level):
//
//   • glass → <YearA/>          — subject lanes under a month scale.
//   • paper → <TimelineYear/>   — the merged drill view (subjects sidebar,
//                                 standards coverage, year filters, the
//                                 unit→week→lesson drill + YearLessonPane).
//   • color → <YearC/>          — the subject "constellation" of unit progress
//                                 discs (ported from the legacy
//                                 YearConstellation, upgraded so a node opens
//                                 the unit workspace instead of drilling).
//
// The glass + color frames share ONE data derivation — the per-subject unit
// lanes, computed here once from the live planner store — so they can never
// quote a teacher three different completion figures. TimelineYear derives its
// own equivalent and owns its drill + selection state, so it takes no props.
//
// ── DATA-STATE HONESTY (the thing this shell owns for EVERY frame) ──────────
// Nothing under /year used to consult `usePlannerDataState`. The Supabase
// hydrate leaves a legitimately empty document in flight for 11–16s and a
// failed hydrate leaves one permanently, and every lane rendered off it: YearA
// painted a confident "0% complete" (YearA.tsx :172) beside "No units planned
// yet." (:177-181), and TimelineYear painted a complete, blank timeline. That
// is worse than the false-empties fixed elsewhere this session — it is a wrong
// NUMBER rather than an absent list, and a teacher has no way to tell it from
// a year they have not seeded.
//
// The guard sits HERE, above the frame branch, rather than in each view: one
// call covers YearA, YearC, the preview views AND TimelineYear without
// touching TimelineYear, which is frozen for the rollback path. Same shape
// /weekly already uses (WeeklyShell.tsx :1291-1304) — pending and error both
// delegate to <PlannerEmpty>, which owns the skeleton and the "couldn't load"
// copy; a SETTLED store falls through to the frame, which keeps its own
// genuinely-empty copy.
//
// NOT COVERED, deliberately and worth deciding on: app/(planner)/year/page.tsx
// renders <TimelineYear> directly when NEXT_PUBLIC_V2 is OFF, bypassing this
// shell entirely, so the ROLLBACK build still paints a blank timeline over an
// unhydrated store. Closing that means wrapping the flag-off branch in a small
// client guard — which changes the render tree of the path whose entire value
// is being byte-for-byte the Year that is live on prod. That trade is a call
// for whoever owns the rollback contract, not a detail to slip in here.
//
// ── PREVIEW ROUTING (?preview=…) — non-destructive, paper only ──────────────
// The 7.21 handoff supersedes the 7.2 one this shell was built against:
// `source-home/app.jsx:522` maps `ViewSet = { A: ViewsA, B: ViewsC, C: ViewsC }`
// with the note at :519-521 that "Bright (B) adopts the subject-led views …
// Pastel (C) reskins the same views". So under the LATEST handoff the paper
// Year is the subject-led constellation — which is exactly what <YearC/>
// already is — not a frame-specific design of its own.
//
// That is a live product question, not a settled one: on Year, paper is
// currently the RICHEST frame, so adopting the handoff literally would REMOVE
// capability (the subjects sidebar, the standards-coverage loop, the year
// filters, the drill). The user asked to compare the candidates against real
// data before choosing, so this reads a URL parameter and changes NOTHING
// else — no saved preference, no `teacher_preferences` write, no redeploy.
// Drop the parameter and paper is exactly as it was.
//
//   /year                        → paper renders TimelineYear (today's Year)
//   /year?preview=subject-led    → paper renders <YearC/>  (the 7.21 target)
//   /year?preview=frame-b        → paper renders <YearB/>  (the 7.2 Frame-B
//                                  progress list, built before the handoff
//                                  correction; kept so all three candidates
//                                  can be compared side by side)
//
// Paper only, deliberately: 7.21 leaves glass on ViewsA, and the colour frame
// already IS the subject-led view, so forcing the parameter on those would
// misrepresent the mapping being evaluated.
//
// B5.3 — NO MODAL HOST HERE. This shell used to own the open-unit state and
// mount its own <UnitExplorer> for the glass + color frames, which meant the
// paper frame (early-returning above the mount) had no path to the workspace at
// all, and any OTHER surface opening the global host would have put a second
// aria-modal dialog on screen beside this one. Every frame now reaches the ONE
// global opener (components/year-v2/workspace-host, mounted in
// app/(planner)/layout.tsx) — glass from its chips, colour from its discs,
// paper through TimelineYear's own per-unit-card ⤢ button (and, under a
// preview, from that view's own chips/pills). Nothing on /year mounts a
// workspace.
//
// FRAME-SURVIVAL (user-locked decision, 2026-07-24): the open workspace
// SURVIVES an appearance/frame change rather than being dismissed. That is now
// structural rather than something this shell has to arrange — the host lives
// in the planner layout, ABOVE the frame branch, so re-routing glass ⇄ paper ⇄
// color re-renders the view underneath an untouched workspace.
//
// NOT-DEAD-BRANCH NOTE (this corrects an earlier claim in this header that the
// branch was unreachable dead logic — it is only unreachable FLAG-ON):
// TimelineYear keeps its own `frame === "color"` swap to YearConstellation
// (`showConstellation`, TimelineYear.tsx :696, rendered :898). With
// NEXT_PUBLIC_V2 ON this shell branches the color frame to <YearC/> before
// TimelineYear mounts, so the internal swap never fires. With the flag OFF
// there is no shell at all — app/(planner)/year/page.tsx renders
// <TimelineYear/> directly — and the swap is the live color-frame Year in the
// rollback build. Deleting it would silently gut the rollback path, which is
// the whole point of the flag. It goes when the flag does, not before.
//
// FLAG-OFF REACHABILITY (worth knowing before touching TimelineYear): with the
// flag OFF the paper Year is the ONLY route to the unit workspace anywhere in
// the app. `DailyViewV1` and `WeeklyShellV1` mount no <UnitChip> and never call
// the opener, so TimelineYear's per-unit-card ⤢ button carries it alone — which
// is why that button's discoverability (`.uws`, TimelineYear.module.css) is
// load-bearing rather than a nicety. It carries paper flag-ON too, so it stays
// load-bearing in both builds.

import { useMemo, type ReactNode } from "react";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { PlannerEmpty } from "@/components/ui";
import { TimelineYear } from "@/components/year";
import { unitLessons, unitProgress } from "@/lib/year-v2-data";
import type { Lesson, Subject, Unit } from "@/lib/types";
import { YearA } from "./YearA";
import { YearB } from "./YearB";
import { YearC } from "./YearC";
import { useUnitWorkspace } from "./workspace-host";
import { useTheme } from "@/lib/theme";
// The parser lives in a NON-client module because the route calls it on the
// server; see that file's header for the 500 this arrangement prevents.
import type { YearPreview } from "./year-preview";

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
export function buildLanes(
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

// ── Preview routing (?preview=…) ────────────────────────────────────────────

// ── Component ───────────────────────────────────────────────────────────────

export interface YearShellProps {
  /**
   * Which paper-Year candidate to show, parsed from `?preview=` by the ROUTE
   * (app/(planner)/year/page.tsx), not read from `window` here.
   *
   * That split is this codebase's documented way to read a search param — a
   * server component parses `searchParams` and hands the result down, which is
   * how /weekly and /weekly/print do it, and it deliberately avoids
   * `useSearchParams` and the Suspense boundary it drags in (the reasoning is
   * recorded at components/daily/LessonDetail.tsx :282-284).
   *
   * Reading the URL here instead — in an effect — was the first attempt, and it
   * is wrong twice: the server would render today's Year and swap after mount
   * (a visible flash), and an effect with an empty dependency array resolves
   * ONCE, so navigating between `/year` and `/year?preview=…` without a full
   * reload would leave the previous candidate on screen while the URL claimed
   * otherwise. As a prop it is correct on the server, correct on the first
   * paint, and re-derived on every navigation.
   */
  preview?: YearPreview;
}

export function YearShell({ preview = null }: YearShellProps): ReactNode {
  const { frame } = useTheme();
  const { lessons, subjects, units: allUnits } = usePlanner();
  // Read UNCONDITIONALLY, above every return: a hook called inside a branch
  // desyncs the moment the branch flips as the store settles.
  const dataState = usePlannerDataState();

  // The ONE opener. Referentially stable (a module constant on the workspace
  // singleton), so handing it straight to YearA/YearC as `onOpenUnit` costs
  // those trees nothing — no useCallback, no re-render on open/close.
  const { openUnitWorkspace } = useUnitWorkspace();

  // Lanes feed the lane-based frames — one derivation, one set of numbers.
  const lanes = useMemo(
    () => buildLanes(subjects, lessons, allUnits),
    [subjects, lessons, allUnits],
  );

  // Hydrate in flight, or a hydrate that threw. Either way the document is
  // empty and NOTHING true can be said about the year yet, so no frame renders
  // — the alternative is the confident "0% complete" this guard exists to kill.
  // <PlannerEmpty> owns both branches (skeleton / "Couldn't load your plan");
  // `heading` is the settled fallback only and is unreachable from here.
  if (dataState !== "settled") {
    return (
      <div data-year-state={dataState}>
        <PlannerEmpty
          heading="No units planned yet."
          body="Add units to your curriculum and the year fills in here."
          skeletonLines={5}
        />
      </div>
    );
  }

  // One expression, the three frames — deliberately NOT an early return for
  // paper. The early return is what stranded the paper frame in the first
  // place: it sat above the shell's own workspace mount, so paper had no route
  // to the unit workspace at all. Paper keeps the merged drill view entirely
  // and is NOT a subset of the other two, so it reaches the workspace through
  // TimelineYear's own per-unit-card opener.
  //
  // The preview parameter substitutes a CANDIDATE paper Year and touches
  // nothing else — see the header. It is scoped to paper on purpose.
  if (frame === "paper") {
    if (preview === "subject-led")
      return <YearC lanes={lanes} onOpenUnit={openUnitWorkspace} />;
    if (preview === "frame-b")
      return <YearB lanes={lanes} onOpenUnit={openUnitWorkspace} />;
    return <TimelineYear />;
  }
  return frame === "color" ? (
    <YearC lanes={lanes} onOpenUnit={openUnitWorkspace} />
  ) : (
    <YearA lanes={lanes} onOpenUnit={openUnitWorkspace} />
  );
}
