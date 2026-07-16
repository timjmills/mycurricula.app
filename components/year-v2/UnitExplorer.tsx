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
// DATA IDENTITY: `unit` is the unit-id SLUG as it sits on `Lesson.unit`
// (e.g. "u-m3"). The display name / week span / "Unit n of N" resolve from the
// catalog (usePlanner().unitById + .units) via lib/year-v2-data helpers.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Lesson, SubjectId } from "@/lib/types";
import type { DayStatus } from "@/lib/day-status";
import { usePlanner } from "@/lib/planner-store";
import { unitResources, unitStandards } from "@/lib/year-unit-aggregate";
import { useUnitNote, useSetUnitNote } from "@/lib/unit-notes";
import { StatusDot, ForkCues, FinishPill } from "@/components/planner-v2";
import { StandardPill, Tooltip } from "@/components/ui";
import { PlanPage } from "@/components/lesson-plan-v2";
import {
  unitLessons,
  unitProgress,
  resolveUnitHeader,
} from "@/lib/year-v2-data";
import { ExplorerShell, type ExplorerMode } from "./ExplorerShell";
import styles from "./UnitExplorer.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export interface UnitExplorerProps {
  subjectId: SubjectId;
  /** The unit identifier as it appears on `Lesson.unit` (a slug, e.g. "u-m3"). */
  unit: string;
  onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Weekday short labels keyed by `Lesson.day` (0 = Sunday); out-of-range → "Day N".
 *  Self-contained (mirrors UnitDrawer) so the modal needs no week-config import. */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function dayShort(day: number): string {
  return DAY_SHORT[day] ?? `Day ${day + 1}`;
}

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

/** Safe href guard — a resource URL can come from free text / imported rows, so
 *  an unsafe scheme (javascript:, data:, …) yields plain text, not a live link.
 *  Allows http(s)/blob: and same-origin root-relative paths; rejects
 *  protocol-relative and backslash tricks. (Copied from UnitDrawer.safeHref,
 *  which mirrors the canonical isSafeUrl.) */
function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?|blob):/i.test(url)) return url;
  return /^\/(?![/\\])/.test(url) ? url : undefined;
}

/** The Explorer's completion status for a lesson. The modal is NOT the live
 *  day, so the wall clock must never paint a false "now"/"upcoming" on a unit
 *  lesson that happens to bracket the current time (the day-status isToday
 *  gate): a lesson reads "done" from store truth, else "idle" ("Planned"). */
function explorerStatus(lesson: Lesson): DayStatus {
  return lesson.status === "done" ? "done" : "idle";
}

/** The five tabs — locked scope (no Catch-Up / Pacing / Assessment / Stats). */
type TabKey = "overview" | "lessons" | "standards" | "resources" | "notes";
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "lessons", label: "Lessons" },
  { key: "standards", label: "Standards" },
  { key: "resources", label: "Resources" },
  { key: "notes", label: "Notes" },
];

// ── Progress ring ─────────────────────────────────────────────────────────

/** Small SVG progress ring. `pct` is 0–1. The track + value both use
 *  currentColor-adjacent tokens so the ring re-tints per host (white on the
 *  gradient header, subject color in the Overview body). */
function ProgressRing({
  pct,
  size = 44,
  stroke = 5,
  className,
  trackClass,
  valueClass,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  trackClass: string;
  valueClass: string;
  label: string;
}): ReactNode {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        className={trackClass}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={valueClass}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function UnitExplorer({
  subjectId,
  unit,
  onClose,
}: UnitExplorerProps): ReactNode {
  const {
    lessons: allLessons,
    subjectById,
    units,
    setLessonStatus,
  } = usePlanner();
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("overview");
  const [mode, setMode] = useState<ExplorerMode>("unit");
  const [planLessonId, setPlanLessonId] = useState<string | null>(null);

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
        <ProgressRing
          pct={pct}
          trackClass={styles.ringTrackOnHead}
          valueClass={styles.ringValueOnHead}
          label={`${progress.taught} of ${progress.total} lessons taught`}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      tablistLabel="Unit details"
      mode={fallbackLessonId ? "unit" : undefined}
      onModeChange={fallbackLessonId ? onModeChange : undefined}
      onClose={onClose}
      body={
        <>
          {tab === "overview" && (
            <OverviewTab
              lessons={lessons}
              progress={progress}
              pct={pct}
              subjectName={subject.name}
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

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({
  lessons,
  progress,
  pct,
  subjectName,
}: {
  lessons: Lesson[];
  progress: { total: number; taught: number };
  pct: number;
  subjectName: string;
}): ReactNode {
  return (
    <div className={styles.overview}>
      <div className={styles.ovHead}>
        <ProgressRing
          pct={pct}
          size={64}
          stroke={7}
          trackClass={styles.ringTrack}
          valueClass={styles.ringValue}
          label={`${progress.taught} of ${progress.total} lessons taught`}
        />
        <div className={styles.ovStat}>
          <div className={styles.ovBig}>
            {progress.taught}
            <span className={styles.ovSlash}>/{progress.total}</span>
          </div>
          <div className={styles.ovLabel}>
            {subjectName} lessons taught
            {progress.total > 0 ? (
              <> · {Math.round(pct * 100)}% complete</>
            ) : null}
          </div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className={styles.empty}>
          No lessons planned for this unit yet.
        </div>
      ) : (
        <>
          <div className={styles.progressBar} aria-hidden="true">
            <span
              className={styles.progressFill}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
          {/* Horizontal lesson-node timeline — done nodes fill with the subject
              color + ✓; the rest read as hollow track dots. */}
          <div
            className={styles.timeline}
            role="list"
            aria-label="Unit lesson timeline"
          >
            {lessons.map((l) => {
              const done = l.status === "done";
              return (
                <Tooltip
                  key={l.id}
                  content={`Wk ${l.week} · ${dayShort(l.day)} — ${l.title}${
                    done ? " (taught)" : ""
                  }`}
                  side="top"
                >
                  <span
                    role="listitem"
                    className={`${styles.node} ${done ? styles.nodeDone : ""}`}
                    aria-label={`Week ${l.week} ${dayShort(l.day)}: ${l.title}${
                      done ? ", taught" : ""
                    }`}
                    tabIndex={0}
                  >
                    {done ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    ) : null}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Lessons tab ─────────────────────────────────────────────────────────────

function LessonsTab({
  lessons,
  setLessonStatus,
  onPlan,
  onTeach,
}: {
  lessons: Lesson[];
  setLessonStatus: (id: string, status: Lesson["status"]) => void;
  onPlan: (id: string) => void;
  onTeach: (id: string) => void;
}): ReactNode {
  if (lessons.length === 0) {
    return (
      <div className={styles.empty}>No lessons planned for this unit yet.</div>
    );
  }
  return (
    <ul className={styles.lessonList}>
      {lessons.map((l) => {
        const status = explorerStatus(l);
        const isDone = l.status === "done";
        return (
          <li key={l.id} className={styles.lessonRow}>
            <StatusDot status={status} />
            <div className={styles.lessonMain}>
              <div className={styles.lessonTitleRow}>
                {/* Title styled like SelectTitle but non-interactive — the
                    modal has no lesson-selection concept; the row's actions
                    (Plan / Teach / Finish) carry every affordance. */}
                <span className={styles.lessonTitle}>{l.title}</span>
                <ForkCues lesson={l} />
              </div>
              <div className={styles.lessonMeta}>
                Wk {l.week} · {dayShort(l.day)}
              </div>
            </div>
            <div className={styles.lessonActions}>
              <FinishPill
                status={status}
                isDone={isDone}
                onToggle={() =>
                  setLessonStatus(l.id, isDone ? "not_done" : "done")
                }
              />
              <Tooltip
                content="Open this lesson in the Lesson Planner to build it out."
                tooltipId="ue-lesson-plan"
                side="top"
              >
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => onPlan(l.id)}
                >
                  Plan
                </button>
              </Tooltip>
              <Tooltip
                content="Open this lesson on the teaching board for live class use."
                tooltipId="ue-lesson-teach"
                side="top"
              >
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => onTeach(l.id)}
                >
                  Teach
                </button>
              </Tooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Standards tab ────────────────────────────────────────────────────────────

function StandardsTab({
  standards,
}: {
  standards: ReturnType<typeof unitStandards>;
}): ReactNode {
  if (standards.length === 0) {
    return (
      <div className={styles.empty}>
        No standards tagged on this unit&apos;s lessons yet.
      </div>
    );
  }
  // The aggregate does NOT distinguish covered vs gap, so this is a plain list
  // — no invented coverage. StandardPill surfaces each code's full description
  // on hover / long-press (the canonical standards presentation; descriptions
  // are never printed inline per the StandardPill contract).
  return (
    <ul className={styles.aggList}>
      {standards.map((ref) => (
        <li key={ref.code} className={styles.aggRow}>
          <StandardPill code={ref.code} />
          <span className={styles.aggMeta}>
            in {ref.lessonCount} {ref.lessonCount === 1 ? "lesson" : "lessons"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Resources tab ─────────────────────────────────────────────────────────────

function ResourcesTab({
  resources,
}: {
  resources: ReturnType<typeof unitResources>;
}): ReactNode {
  if (resources.length === 0) {
    return (
      <div className={styles.empty}>
        No resources attached to this unit&apos;s lessons yet.
      </div>
    );
  }
  return (
    <ul className={styles.aggList}>
      {resources.map((ref, i) => {
        const isNote = ref.resource.type === "notecard";
        const href = isNote ? undefined : safeHref(ref.resource.url);
        // Resources are NOT de-duplicated across lessons (a recurring anchor
        // chart legitimately repeats), so a composite key keeps each row stable.
        return (
          <li key={`${ref.lessonId}-${i}`} className={styles.aggRow}>
            <span className={styles.aggGlyph} aria-hidden="true">
              {isNote ? "✎" : "🔗"}
            </span>
            <span className={styles.aggBody}>
              <span className={styles.aggLabel}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.aggLink}
                  >
                    {ref.resource.label}
                  </a>
                ) : (
                  ref.resource.label
                )}
              </span>
              <span className={styles.aggMeta}>
                Wk {ref.week} · {dayShort(ref.day)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({
  subjectId,
  unitId,
}: {
  subjectId: SubjectId;
  unitId: string;
}): ReactNode {
  // Notes key on subject + unit — unit slugs are unique only within a
  // subject, so a bare-slug key would share one note across two subjects'
  // same-named units (see lib/unit-notes.tsx "Keying").
  const note = useUnitNote(subjectId, unitId);
  const setNote = useSetUnitNote();
  const fieldId = useId();
  return (
    <div className={styles.notes}>
      <label htmlFor={fieldId} className={styles.notesLabel}>
        Unit note — a shared reminder for the team
      </label>
      <textarea
        id={fieldId}
        className={styles.notesArea}
        value={note}
        placeholder="The one move not to forget in this unit…"
        onChange={(e) => setNote(subjectId, unitId, e.target.value)}
        rows={5}
      />
    </div>
  );
}
