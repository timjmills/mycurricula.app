"use client";

// UnitExplorer.tsx — the Year drill-down modal's UNIT mode (v2 "The Year").
//
// Opened from a unit chip / node on the YearA / YearC frames. A centered,
// frosted dialog scoped to ONE unit, showing five tabs — Overview · Lessons ·
// Standards · Resources · Notes — each bound to REAL store data only
// (usePlanner catalog + lib/year-unit-aggregate + lib/unit-notes). The 7.2.26
// bundle's Explorer fabricates pace / projected-finish / vs-last-year /
// assessment stats; NONE of that is built here (locked scope) — no dead
// placeholders.
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
import type { SubjectId } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { unitResources, unitStandards } from "@/lib/year-unit-aggregate";
import {
  subjectUnitGroups,
  unitProgressByKey,
  type SubjectUnitGroup,
} from "@/lib/unit-workspace-derive";
import { useWorkspacePresentation } from "@/lib/workspace-prefs";
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

/** The five tabs — locked scope (no Assessments / Refine / Insights until B2/B3;
 *  no dead tabs). B1.5 relabels the first "Unit Plan"; the key stays `overview`
 *  (the body switch + tab CSS key off it — a label-only change keeps the churn
 *  minimal). */
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
      closeOnScrimClick={!(workspaceEnabled && presentation === "full")}
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
      onClose={onClose}
      body={
        <>
          {tab === "overview" && (
            <OverviewTab
              lessons={lessons}
              progress={progress}
              pct={pct}
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
