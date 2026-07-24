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
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Strip a "Unit N · " / "List N · " lead-in so the header can bold the prefix
 *  and lighten the remainder (mirrors TimelineYear/UnitDrawer's splitUnitName). */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

/** The five tabs — and B3 deliberately kept them at five. Assessments and
 *  Insights did NOT graduate into this strip; they went to the right-hand
 *  context drawer instead, because the strip lists the unit's PARTS (its plan,
 *  its lessons, its standards, its resources, its notes) while the drawer holds
 *  commentary ABOUT the unit. Let commentary in and the strip becomes a junk
 *  drawer that buries the parts a teacher opened the unit to reach. Refine is
 *  out of B3 scope entirely — not built, and no dead tab stands in for it.
 *  B1.5 relabels the first "Unit Plan"; the key stays `overview` (the body
 *  switch + tab CSS key off it — a label-only change keeps the churn minimal). */
type TabKey = "overview" | "lessons" | "standards" | "resources" | "notes";
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Unit Plan" },
  { key: "lessons", label: "Lessons" },
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
  const [mode, setMode] = useState<ExplorerMode>("unit");
  const [planLessonId, setPlanLessonId] = useState<string | null>(null);

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

  // ── Subject-vanished-while-open guard ───────────────────────────────────
  // If the catalog / active notebook swaps and this subject disappears, every
  // subject-derived surface below (the `cp-subj` cascade, the gradient header,
  // the glyph) would throw on a missing record and take the whole Year view
  // down. Close instead of painting a subject-less husk — LessonModal's
  // deleted-while-open contract. The unmount cleanup restores the invoker's
  // focus, so this is a real close, not a silent unmount.
  useEffect(() => {
    if (header === null) onClose();
  }, [header, onClose]);

  if (header === null) return null;

  // ── Lesson mode — the Lesson Planner over the same shell ─────────────────
  const planLesson = planLessonId ?? fallbackLessonId;
  if (mode === "lesson" && planLesson !== null) {
    return (
      <PlanPage
        lessonId={planLesson}
        onClose={onClose}
        onModeChange={onModeChange}
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
          {tab === "standards" && <StandardsTab standards={standards} />}
          {tab === "resources" && <ResourcesTab resources={resources} />}
          {tab === "notes" && <NotesTab subjectId={subjectId} unitId={unit} />}
        </>
      }
    />
  );
}
