"use client";

// UnitExplorer.tsx — the Year drill-down modal's UNIT mode (v2 "The Year").
//
// Opened from a unit chip / node on the YearA / YearC frames. A centered,
// frosted dialog scoped to ONE unit, showing five tabs — Unit Plan · Lessons ·
// Standards · Resources · Notes — each bound to REAL store data only
// (usePlanner catalog + lib/year-unit-aggregate + lib/unit-notes). Assessment
// and planning stats DO exist now, but they live in the B3 drawer's Insights
// pane, where lib/unit-insights returns every figure as either a value backed by
// a real lesson field or an explicit "unavailable, and here is why". What the
// 7.2.26 bundle's Explorer invents and this surface still refuses to render is
// pace / projected-finish / vs-last-year: they need a configurable school-week
// calendar we don't have, so a number there would be a guess wearing a
// denominator. Nothing anywhere in this modal is a dead placeholder.
//
// WAVE 7: the modal chrome (scrim, portal, gradient header, tablist, focus
// trap, Escape/scrim close) moved to <ExplorerShell>, which this file now
// consumes. UnitExplorer additionally owns the bundle's two-mode switch: the
// Unit Planner (this file) and the Lesson Planner
// (components/lesson-plan-v2/PlanPage), which render the SAME shell. Opening a
// lesson's plan is an IN-MODAL mode switch, not the old cross-route bounce to
// `/daily?lesson=…` (that deep link still works from everywhere else).
//
// B5.7: that Lesson mode is now also an ENTRY point, not just a switch — a
// `focusLessonId` mounts this component straight into it. It is what /weekly's
// "Open in editor" opens, replacing the retired centered lesson-editor popup,
// so it has to hold for lessons the unit roll-up cannot describe (see the prop).
//
// B1.0: the five tab bodies + the ProgressRing moved to ./unit-tabs (a pure
// move — byte-identical render) so the B1 workspace can reuse them. Their shared
// CSS still lives in UnitExplorer.module.css; the tab files import it from the
// parent folder, so the hashed class names — and the render — are unchanged.
//
// B3: a right-hand CONTEXT DRAWER (./drawer) rides beside the tab bodies —
// Assessments · Insights · Prep. Those three are commentary ABOUT the unit, not
// parts OF it, which is why they are drawer panes and not a sixth/seventh/eighth
// tab (see TABS below).
//
// DATA IDENTITY: `unit` is the unit-id SLUG as it sits on `Lesson.unit`
// (e.g. "u-m3"). The display name / week span / "Unit n of N" resolve from the
// catalog (usePlanner().unitById + .units) via lib/year-v2-data helpers.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Lesson, SubjectId } from "@/lib/types";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { unitDisplayName } from "@/lib/unit-name";
import { unitResources, unitStandards } from "@/lib/year-unit-aggregate";
import {
  subjectUnitGroups,
  unitProgressByKey,
  type SubjectUnitGroup,
} from "@/lib/unit-workspace-derive";
import {
  useWorkspacePresentation,
  useWorkspaceDrawer,
  type WorkspaceDrawerPane,
} from "@/lib/workspace-prefs";
import type { UnitProgress } from "@/lib/year-v2-data";
import { PlanPage } from "@/components/lesson-plan-v2";
import { Tooltip } from "@/components/ui";
import {
  unitLessons,
  unitProgress,
  resolveUnitHeader,
} from "@/lib/year-v2-data";
import { ExplorerShell, type ExplorerMode } from "./ExplorerShell";
import { UnitWorkspaceRail } from "./UnitWorkspaceRail";
import {
  UnitContextDrawer,
  AssessmentsPanel,
  InsightsPanel,
  PrepPanel,
  type UnitContextDrawerPane,
} from "./drawer";
import {
  ProgressRing,
  OverviewTab,
  LessonsTab,
  RefineTab,
  StandardsTab,
  ResourcesTab,
  NotesTab,
} from "./unit-tabs";
import styles from "./UnitExplorer.module.css";

// Stable empty singletons for the non-workspace path (the Planner Hub) so the
// rail-only derivations never allocate — and never re-run downstream memos.
const EMPTY_GROUPS: SubjectUnitGroup[] = [];
const EMPTY_PROGRESS: ReadonlyMap<string, UnitProgress> = new Map();

// ── Props ─────────────────────────────────────────────────────────────────

export interface UnitExplorerProps {
  subjectId: SubjectId;
  /** The unit identifier as it appears on `Lesson.unit` (a slug, e.g. "u-m3"). */
  unit: string;
  onClose: () => void;
  /**
   * When provided, the modal becomes the full Unified Workspace (B1.4): a
   * Units | Lessons left rail plus an ⤢ expand toggle (modal ⇄ full). Because
   * the HOST owns which unit is open, rail navigation reports the new unit here
   * rather than mutating local state — the host re-renders this component with
   * the new `subjectId` / `unit` (no remount; nothing keys on them).
   *
   * Absent — the Planner Hub, which keys its doc tab on the opened unit and
   * would lie if the rail could switch units — renders the classic scrim-only
   * modal: no rail, no expand toggle, byte-identical to before B1.4.
   */
  onUnitChange?: (subjectId: SubjectId, unit: string) => void;
  /**
   * B5.7 — open straight into LESSON mode on this lesson, instead of the unit
   * roll-up. The lesson entry points (/weekly's "Open in editor", and anything
   * that later replaces a lesson popup) pass it; the unit entry points (a unit
   * chip, Year, the Hub) do not.
   *
   * Deliberately independent of `unit`: the Lesson Planner needs only the
   * lesson, so this works for a lesson filed under no unit at all — which every
   * in-app-created lesson is (`lib/planner-store` addLesson: "a fresh lesson
   * starts unfiled"). When the unit does not resolve in the catalog the Unit
   * mode switch is withheld rather than offering a roll-up of nothing; see
   * `unitResolved` below.
   */
  focusLessonId?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Strip a "Unit N · " / "List N · " lead-in so the header can bold the prefix
 *  and lighten the remainder (mirrors TimelineYear's splitUnitName). */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

/** The tab strip. B3 deliberately kept Assessments and Insights OUT of it: they
 *  went to the right-hand context drawer instead, because the strip lists the
 *  unit's PARTS (its plan, its lessons, its standards, its resources, its notes)
 *  while the drawer holds commentary ABOUT the unit. Let commentary in and the
 *  strip becomes a junk drawer that buries the parts a teacher opened the unit
 *  to reach. That ruling stands.
 *
 *  WAVE 5 adds **Refine**, which does NOT reopen it. Refine is not commentary —
 *  it is the unit's lessons themselves, laid out as an editable table so one
 *  planning field can be filled down the whole unit in a single keyboard run.
 *  The drawer REPORTS the gaps; Refine is where they get fixed, and there is no
 *  other surface that does it (the Lessons tab is read-only, and its row actions
 *  all leave). It sits after Lessons because that is the handoff's order
 *  (`ph-workspace.jsx:272`) and because it reads as a deeper pass over the same
 *  thing the tab before it lists.
 *
 *  B1.5 relabels the first "Unit Plan"; the key stays `overview` (the body
 *  switch + tab CSS key off it — a label-only change keeps the churn minimal). */
type TabKey =
  | "overview"
  | "lessons"
  | "refine"
  | "standards"
  | "resources"
  | "notes";
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Unit Plan" },
  { key: "lessons", label: "Lessons" },
  { key: "refine", label: "Refine" },
  { key: "standards", label: "Standards" },
  { key: "resources", label: "Resources" },
  { key: "notes", label: "Notes" },
];

/** ⤢ expand / collapse glyphs for the presentation toggle (maximize-2 /
 *  minimize-2). Drawn white on the gradient header via `.expandBtn`. */
function ExpandGlyph({ full }: { full: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {full ? (
        <>
          <path d="M4 14h6v6M20 10h-6V4" />
          <path d="M14 10l7-7M10 14l-7 7" />
        </>
      ) : (
        <>
          <path d="M15 3h6v6M9 21H3v-6" />
          <path d="M21 3l-7 7M3 21l7-7" />
        </>
      )}
    </svg>
  );
}

/** Panel-right glyph for the context-drawer toggle (B3). The side bar fills
 *  when the drawer is open, so the button reads as a state, not just an action —
 *  it sits beside ⤢, which uses the same convention. */
function DrawerGlyph({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M15 4v16" fill={open ? "currentColor" : "none"} />
      {open ? <rect x="15" y="4" width="6" height="16" rx="2" /> : null}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function UnitExplorer({
  subjectId,
  unit,
  onClose,
  onUnitChange,
  focusLessonId,
}: UnitExplorerProps): ReactNode {
  const {
    lessons: allLessons,
    subjects,
    subjectById,
    units,
    setLessonStatus,
    getSections,
  } = usePlanner();
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("overview");
  // A lesson entry point (B5.7) mounts DIRECTLY in Lesson mode — seeded here
  // rather than in an effect so the first paint is already the Lesson Planner
  // (an effect would flash the unit roll-up, then swap).
  const [mode, setMode] = useState<ExplorerMode>(
    focusLessonId ? "lesson" : "unit",
  );
  const [planLessonId, setPlanLessonId] = useState<string | null>(
    focusLessonId ?? null,
  );

  // Workspace mode (B1.4): a rail + ⤢ expand toggle, enabled only when the host
  // owns unit navigation (`onUnitChange`). The presentation preference is always
  // read (hooks are unconditional); it only drives the UI when workspaceEnabled.
  const workspaceEnabled = onUnitChange !== undefined;
  const { presentation, toggle: togglePresentation } =
    useWorkspacePresentation();

  // Context drawer (B3) — Assessments · Insights · Prep. Available in BOTH
  // presentations (unlike the rail): these panels are the only home for that
  // information, so the compact Planner Hub modal must reach them too.
  const {
    open: drawerOpen,
    pane: drawerPane,
    setPane: setDrawerPane,
    setOpen: setDrawerOpen,
    toggle: toggleDrawer,
  } = useWorkspaceDrawer();
  const dataState = usePlannerDataState();

  // Resource truth for Insights. `Lesson.resources` is only half of it —
  // SECTION resources are the canonical half (lib/resources-dedup.ts), and the
  // composer attaches to a section whenever one is the destination. Sections are
  // not on the Lesson shape, so the pure derivations cannot see them and the
  // "Needs attention" gap counted a lesson whose resources all live on sections
  // as having none, one click from a Resources tab listing them.
  const hasAnyResource = useCallback(
    (l: Lesson): boolean =>
      l.resources.length > 0 ||
      getSections(l.id).some((s) => s.resources.length > 0),
    [getSections],
  );

  // Closing from the drawer's OWN ✕ hides the subtree the ✕ lives in, so focus
  // would fall to <body> — outside the dialog — and the next Tab would start at
  // the top of the document, escaping the modal entirely. Hand focus back to the
  // toggle that opened it. Queried rather than ref'd because the toggle is
  // wrapped by <Tooltip>, and rAF so the class flip has committed first.
  const closeDrawer = useCallback((): void => {
    setDrawerOpen(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-ue-drawer-toggle]")?.focus();
    });
  }, [setDrawerOpen]);

  // Rail data — the grouped unit list + a one-pass taught/total map. Gated on
  // workspaceEnabled so the Planner Hub path never runs the O(lessons) sweep.
  const railGroups = useMemo(
    () => (workspaceEnabled ? subjectUnitGroups(subjects, units) : EMPTY_GROUPS),
    [workspaceEnabled, subjects, units],
  );
  const railProgress = useMemo(
    () => (workspaceEnabled ? unitProgressByKey(allLessons) : EMPTY_PROGRESS),
    [workspaceEnabled, allLessons],
  );

  // A mode switch REMOUNTS the shell (a different component owns it per mode).
  // Once the dialog has been opened, no later mount is a real open, so the
  // entry animation must not replay — see ExplorerShell's `animateIn`.
  const switchedRef = useRef(false);

  // Catalog resolution, guarded: `null` means the SUBJECT vanished from the
  // catalog (notebook / catalog swap while the modal is open). Everything below
  // that touches `header` runs only after the close guard.
  const header = useMemo(
    () => resolveUnitHeader(subjectById, units, subjectId, unit),
    [subjectById, units, subjectId, unit],
  );

  // Does the unit actually exist in the catalog? `resolveUnitHeader` degrades a
  // missing unit to its raw id rather than failing, which is right for a unit
  // that merely left the catalog — but a lesson entry point (B5.7) can open on a
  // lesson with NO unit (`unit === ""`, every freshly-created lesson) or one
  // whose id the Supabase seam could not map back. There is no roll-up to show
  // for those, so the Unit mode switch is withheld: the same guard
  // `components/unit-chip` uses to decide whether a lesson has a unit worth
  // opening, via the same helper, so the two can never disagree.
  const unitResolved = useMemo(
    () => unitDisplayName(units, subjectId, unit) !== null,
    [units, subjectId, unit],
  );

  // The unit's lessons + rollups — pure + memoized (recompute only when the
  // live lesson list changes, e.g. an edit or a mark-taught lands).
  const lessons = useMemo(
    () => unitLessons(allLessons, subjectId, unit),
    [allLessons, subjectId, unit],
  );
  const progress = useMemo(() => unitProgress(lessons), [lessons]);
  const resources = useMemo(() => unitResources(lessons), [lessons]);
  const standards = useMemo(() => unitStandards(lessons), [lessons]);

  // ── Row actions ──────────────────────────────────────────────────────────
  // Plan is an IN-MODAL mode switch to the Lesson Planner for that lesson —
  // no route change, no modal teardown (Wave 7). Teach still leaves for the
  // teaching board, which is a genuinely different surface.
  const openPlan = useCallback((id: string): void => {
    switchedRef.current = true;
    setPlanLessonId(id);
    setMode("lesson");
  }, []);
  const openTeach = useCallback(
    (id: string): void => {
      onClose();
      router.push(`/teach?lesson=${encodeURIComponent(id)}`);
    },
    [onClose, router],
  );

  // The lesson the mode switch lands on when no row was clicked: the first
  // not-yet-taught lesson, else the first. `null` for an empty unit — the mode
  // switch is then withheld rather than rendered as a dead control.
  const fallbackLessonId = useMemo(() => {
    const next = lessons.find((l) => l.status !== "done") ?? lessons[0];
    return next?.id ?? null;
  }, [lessons]);

  const onModeChange = useCallback((next: ExplorerMode): void => {
    switchedRef.current = true;
    setTab("overview");
    setMode(next);
    // Returning to the unit DROPS the pinned lesson. PlanPage bounces back here
    // when its lesson vanishes from the store (archived elsewhere, catalog
    // swap); keeping the dead id pinned would make the Lesson Planner
    // permanently unreachable — every subsequent switch would re-mount on the
    // same missing lesson and bounce straight back. Clearing it lets the next
    // switch land on `fallbackLessonId`, which is always live.
    if (next === "unit") setPlanLessonId(null);
  }, []);

  // ── The open target moved while we stayed mounted ────────────────────────
  // The initial state above covers the ordinary case: an entry point opens the
  // workspace from CLOSED, so this component mounts already on the right thing.
  // This effect covers the other one — the host swapping the target while the
  // workspace stays MOUNTED, which re-renders rather than remounts (the
  // `onUnitChange` contract). No UI reaches it today (the workspace's own scrim
  // covers every opener behind it, and Lesson mode paints no rail); it is here
  // because `openUnitWorkspace` is exported for imperative callers, and BOTH
  // halves below are silent-wrong-state bugs if left out:
  //
  //   • a focus arrives → show that lesson (else the target names a lesson the
  //     workspace ignored);
  //   • a target with NO focus → show the unit, dropping any pinned lesson
  //     (else the header names one thing while the body plans another — §4a
  //     Medium). This is exactly what the in-modal Unit switch does, so both
  //     routes to the unit agree.
  //
  // The second branch fires for a same-unit re-assert too, not only when the
  // unit moves. An earlier revision exempted that case to protect a teacher
  // mid-lesson from the rail, which reports its active unit on every click —
  // but Lesson mode paints NO rail (PlanPage builds its shell without one), so
  // that state cannot arise, and the exemption only made "open this unit"
  // sometimes not open it. If a later wave does give Lesson mode a rail, the
  // rail must carry the focus rather than this effect regaining an exception.
  const lastTargetRef = useRef({ subjectId, unit, focusLessonId });
  useEffect(() => {
    const prev = lastTargetRef.current;
    if (
      prev.subjectId === subjectId &&
      prev.unit === unit &&
      prev.focusLessonId === focusLessonId
    ) {
      return;
    }
    lastTargetRef.current = { subjectId, unit, focusLessonId };
    switchedRef.current = true;

    if (focusLessonId !== undefined) {
      setPlanLessonId(focusLessonId);
      setMode("lesson");
    } else {
      setPlanLessonId(null);
      setTab("overview");
      setMode("unit");
    }
  }, [subjectId, unit, focusLessonId]);

  // ── Subject-vanished-while-open guard ───────────────────────────────────
  // If the catalog / active notebook swaps and this subject disappears, every
  // subject-derived surface below (the `cp-subj` cascade, the gradient header,
  // the glyph) would throw on a missing record and take the whole Year view
  // down. Close instead of painting a subject-less husk — the same
  // deleted-while-open contract PlanPage applies to a vanished lesson. The
  // unmount cleanup restores the invoker's focus, so this is a real close, not
  // a silent unmount.
  useEffect(() => {
    if (header === null) onClose();
  }, [header, onClose]);

  // ── Unit-vanished-while-open guard (§4a MED) ────────────────────────────
  // The subject guard above is not enough. `resolveUnitHeader` DEGRADES a
  // missing unit instead of failing — it falls back to `name: unit`, which under
  // the Supabase source is a raw UUID — so a unit archived from another surface,
  // or lost in a catalog swap, left this modal painting a husk: a UUID for a
  // title, no week span, no ordinal, zero lessons. Worse than ugly, because the
  // B1.7 Unit Plan fields stayed editable and wrote against a unit id that no
  // longer exists.
  //
  // Scoped to what is actually ON SCREEN, not to how the workspace was opened.
  // The Lesson Planner needs only the lesson, so it keeps running whether the
  // teacher arrived by a lesson entry point (B5.7 — legitimately unit-less, and
  // every in-app-created lesson is) or by opening a lesson from the rail, the
  // Lessons tab or a drawer panel. Closing on `focusLessonId === undefined`
  // instead would have yanked the editor out from under that second group
  // mid-edit. The Unit switch is already withheld below, so there is no way
  // back into the husk from there either.
  const showingLesson =
    mode === "lesson" && (planLessonId ?? fallbackLessonId) !== null;
  const unitGone = !unitResolved && !showingLesson;
  useEffect(() => {
    if (unitGone) onClose();
  }, [unitGone, onClose]);

  if (header === null || unitGone) return null;

  // ── Lesson mode — the Lesson Planner over the same shell ─────────────────
  //
  // `onModeChange` is withheld when the unit does not resolve (B5.7), which
  // does two things at once: the Unit | Lesson switch is not painted as a
  // control that would land on an empty roll-up, and PlanPage's
  // deleted-while-open guard falls through to `onClose` instead of bouncing
  // into that same empty unit. Every unit entry point resolves, so this only
  // ever fires for a lesson opened while unfiled.
  const planLesson = planLessonId ?? fallbackLessonId;
  if (mode === "lesson" && planLesson !== null) {
    return (
      <PlanPage
        lessonId={planLesson}
        onClose={onClose}
        onModeChange={unitResolved ? onModeChange : undefined}
        animateIn={!switchedRef.current}
      />
    );
  }

  // Name / span / ordinal already degraded gracefully in resolveUnitHeader:
  // a unit missing from the catalog falls back to its raw slug and drops the
  // span + ordinal labels.
  const { subject, name: rawName, spanLabel, ordinalLabel } = header;
  const { prefix, rest } = splitUnitName(rawName);
  const pct = progress.total > 0 ? progress.taught / progress.total : 0;

  // The drawer's three panes. Built after the early returns above (so NOT a
  // hook — a useMemo here would sit below a conditional return). Cheap: each
  // panel memoizes its own derivations, and only the active pane mounts.
  const drawerPanes: ReadonlyArray<UnitContextDrawerPane<WorkspaceDrawerPane>> =
    [
      {
        key: "assessments",
        label: "Assessments",
        tip: "Every assessment in this unit — the ones the unit owns, and the ones attached to individual lessons.",
        tipId: "b3-pane-assessments",
        content: (
          <AssessmentsPanel
            unitId={unit}
            // The drawer subtree stays mounted while closed (display:none) and
            // "assessments" is the default pane — so the unit-assessment read
            // must wait for a real reveal, not for the mount.
            visible={drawerOpen && drawerPane === "assessments"}
            lessons={lessons}
            onOpenLesson={openPlan}
            dataState={dataState}
          />
        ),
      },
      {
        key: "insights",
        label: "Insights",
        tip: "What this unit’s planning adds up to so far — and, just as plainly, what the app doesn’t know yet.",
        tipId: "b3-pane-insights",
        content: (
          <InsightsPanel
            lessons={lessons}
            dataState={dataState}
            hasResources={hasAnyResource}
          />
        ),
      },
      {
        key: "prep",
        label: "Prep",
        tip: "Materials and prior-learning notes recorded on this unit’s lessons — what to build or gather before teaching.",
        tipId: "b3-pane-prep",
        content: (
          <PrepPanel
            lessons={lessons}
            onOpenLesson={openPlan}
            dataState={dataState}
          />
        ),
      },
    ];

  return (
    <ExplorerShell
      subject={subject}
      animateIn={!switchedRef.current}
      dialogTitle="Unit explorer — everything planned for this unit. Close with the ✕ or Esc."
      closeLabel="Close unit explorer"
      title={
        prefix ? (
          <>
            <b>{prefix}</b>&nbsp;{rest}
          </>
        ) : (
          <b>{rest}</b>
        )
      }
      subtitle={
        <>
          {subject.name}
          {ordinalLabel ? <> · {ordinalLabel}</> : null}
          {spanLabel ? <> · {spanLabel}</> : null}
        </>
      }
      headerRight={
        <div className={styles.headerCluster}>
          {workspaceEnabled ? (
            <Tooltip
              content={
                presentation === "full"
                  ? "Collapse back to the compact dialog."
                  : "Expand to the full workspace — with the unit & lesson rail."
              }
              tooltipId="ue-expand"
              side="bottom"
            >
              <button
                type="button"
                className={styles.expandBtn}
                aria-pressed={presentation === "full"}
                aria-label={
                  presentation === "full"
                    ? "Collapse to a dialog"
                    : "Expand to the full workspace"
                }
                onClick={togglePresentation}
              >
                <ExpandGlyph full={presentation === "full"} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip
            content={
              drawerOpen
                ? "Hide the context panel."
                : "Show assessments, insights and prep for this unit — alongside whatever you're editing."
            }
            tooltipId="ue-drawer"
            side="bottom"
          >
            <button
              type="button"
              data-ue-drawer-toggle
              className={styles.expandBtn}
              aria-pressed={drawerOpen}
              aria-label={
                drawerOpen ? "Hide unit context" : "Show unit context"
              }
              onClick={toggleDrawer}
            >
              <DrawerGlyph open={drawerOpen} />
            </button>
          </Tooltip>
          <ProgressRing
            pct={pct}
            trackClass={styles.ringTrackOnHead}
            valueClass={styles.ringValueOnHead}
            label={`${progress.taught} of ${progress.total} lessons taught`}
          />
        </div>
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      tablistLabel="Unit details"
      mode={fallbackLessonId ? "unit" : undefined}
      onModeChange={fallbackLessonId ? onModeChange : undefined}
      presentation={workspaceEnabled ? presentation : undefined}
      // NEVER close on a background click. The B1 spec is explicit — "outside
      // click must NOT close it" — and this was only honouring it in the
      // full-bleed presentation, so a stray click behind the compact modal
      // dismissed the whole session.
      //
      // That matters more since B1.7 and B3: the workspace now holds editable
      // team unit fields AND unit assessments, both written confirm-only. The
      // debounced text itself survives (UnitPlanFields and the assessments
      // editor each flush on unmount), so this is not silent data loss — but the
      // teacher still loses their open editor, their scroll position, and the
      // unit they were working in, with no undo and no warning. ✕ and Escape
      // both still close, so nothing is trapped.
      closeOnScrimClick={false}
      rail={
        workspaceEnabled && onUnitChange ? (
          <UnitWorkspaceRail
            groups={railGroups}
            progressByKey={railProgress}
            activeSubjectId={subjectId}
            activeUnitId={unit}
            onUnitChange={onUnitChange}
            lessons={lessons}
            onPlanLesson={openPlan}
          />
        ) : undefined
      }
      drawer={
        <UnitContextDrawer
          panes={drawerPanes}
          activePane={drawerPane}
          onPaneChange={setDrawerPane}
          onClose={closeDrawer}
          closeLabel="Hide unit context"
        />
      }
      drawerOpen={drawerOpen}
      drawerLabel="Unit context"
      drawerTitle="Assessments, insights and prep for this unit — read alongside whichever tab you’re working in."
      onClose={onClose}
      body={
        <>
          {tab === "overview" && (
            <OverviewTab
              lessons={lessons}
              progress={progress}
              pct={pct}
              subjectId={subjectId}
              unitId={unit}
              subjectName={subject.name}
              resourceCount={resources.length}
              standardCount={standards.length}
            />
          )}
          {tab === "lessons" && (
            <LessonsTab
              lessons={lessons}
              setLessonStatus={setLessonStatus}
              onPlan={openPlan}
              onTeach={openTeach}
            />
          )}
          {tab === "refine" && (
            <RefineTab
              lessons={lessons}
              // Section-aware, for the same reason the drawer needs it: a lesson
              // whose resources all hang off its sections has an EMPTY
              // `Lesson.resources`, so without this its Refine dot would read
              // "no resources" one tab away from a Resources tab listing them.
              hasResources={hasAnyResource}
              onPlan={openPlan}
            />
          )}
          {tab === "standards" && <StandardsTab standards={standards} />}
          {tab === "resources" && <ResourcesTab resources={resources} />}
          {tab === "notes" && <NotesTab subjectId={subjectId} unitId={unit} />}
        </>
      }
    />
  );
}
