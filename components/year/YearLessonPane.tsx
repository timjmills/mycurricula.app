"use client";

// YearLessonPane — the merged, read-only lesson detail pane for the Yearly view.
//
// It keeps the Curriculum view's tabbed `.rpanel` look (header, pill badges,
// Overview / Standards / Resources / Assess / Progress tabs) and fills the tab
// bodies with the FULL content the global slide-out shows (objective, preview,
// directions, notes, resources with type icons, standards with descriptions,
// status, unit progress). It is deliberately READ-ONLY: all editing happens in
// the Daily view, reachable via the "Open in Daily" button.
//
// Selection is owned by the parent (TimelineYear); this pane never touches the
// global selectedLessonId, so the shell slide-out never double-mounts on /year.
// Arrow-key ← / → step through the `siblings` (the focused week's lessons) so a
// teacher can flip between the days of a week without leaving the pane.
//
// Subject color comes from the ambient `.cp-subj <cls>` cascade set on the root
// (--c bright / --cl tint / --cd deep). Tokens only — no hex.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lesson, LessonStatus, Subject } from "@/lib/types";
import { WEEK_DAYS } from "@/lib/mock";
import { usePlanner } from "@/lib/planner-store";
import { useLabels, pluralize } from "@/lib/labels";
import { InstanceRenameLabel } from "@/components/rename";
import { Button, StandardPill } from "@/components/ui";
import { ResourceTypeIcon } from "./resource-icons";
import styles from "./year-lesson-pane.module.css";

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  "Overview",
  "Standards",
  "Resources",
  "Assessments",
  "Progress",
] as const;
type Tab = (typeof TABS)[number];

type AsmtStatus = "done" | "due" | "up";

// ── Inline icons (currentColor, 24×24) ───────────────────────────────────────

function Svg({ children, sw = 2 }: { children: ReactNode; sw?: number }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IcChevL = () => <Svg><path d="m15 6-6 6 6 6" /></Svg>;
const IcChevR = () => <Svg><path d="m9 6 6 6-6 6" /></Svg>;
const IcX = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
const IcCheck = () => <Svg sw={3}><path d="m5 13 4 4 10-11" /></Svg>;
const IcClock = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Svg>;
const IcEdit = () => <Svg><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4 1 1-4z" /></Svg>;
const IcBook = () => <Svg><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></Svg>;
const IcTarget = () => <Svg><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" /></Svg>;
const IcStandards = () => <Svg><path d="M4 19.5V6a2 2 0 0 1 2-2h12v15" /><path d="M6 17h12v3H6a2 2 0 0 1 0-3z" /></Svg>;
const IcFolder = () => <Svg><path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></Svg>;
const IcClipboard = () => <Svg><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></Svg>;
const IcChart = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 14v3M12 10v7M16 7v10" /></Svg>;
const IcAssess = () => <Svg><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Svg>;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map a lesson status onto the three-state vocabulary for the badge. */
function statusBucket(status: LessonStatus): "done" | "cur" | "todo" {
  if (status === "done") return "done";
  if (status === "partial" || status === "carried") return "cur";
  return "todo";
}

/** Strip a leading "Unit N · " / "List N · " prefix from a unit name. */
function unitTopic(name: string): string {
  return name.replace(/^Unit\s+\d+\s*·\s*/i, "").replace(/^List\s+\d+\s*·\s*/i, "");
}

/** Derived unit assessments — mocked, keyed to the real unit name (parity with
 *  the Curriculum view's Assess tab). */
function unitAssessments(
  unitName: string,
): { t: string; m: string; st: AsmtStatus; ic: ReactNode }[] {
  return [
    { t: `${unitName} — Diagnostic`, m: "Pre-assessment · 10 items", st: "done", ic: <IcClipboard /> },
    { t: `${unitName} — Mid-Unit Quiz`, m: "Formative", st: "due", ic: <IcAssess /> },
    { t: `${unitName} — Performance Task`, m: "Summative · end of unit", st: "up", ic: <IcTarget /> },
    { t: `${unitName} — Exit Tickets`, m: "Daily checks · ongoing", st: "up", ic: <IcEdit /> },
  ];
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface YearLessonPaneProps {
  lesson: Lesson;
  subject: Subject;
  /** "Week N" label for the back affordance (omitted above week scope). */
  weekLabel?: string;
  /** The focused week's lessons — the prev/next pool for arrow-key stepping. */
  siblings: Lesson[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onOpenInDaily: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function YearLessonPane({
  lesson,
  subject,
  weekLabel,
  siblings,
  onSelect,
  onClose,
  onOpenInDaily,
}: YearLessonPaneProps): ReactNode {
  const { describeStandard, unitById } = usePlanner();
  const labels = useLabels();
  const [tab, setTab] = useState<Tab>("Overview");

  // Reset to Overview whenever the selected lesson changes — a fresh lesson
  // should open on its summary, not whatever tab the last one left open.
  useEffect(() => {
    setTab("Overview");
  }, [lesson.id]);

  // Position within the sibling pool drives prev/next (disabled at the ends).
  const index = siblings.findIndex((l) => l.id === lesson.id);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < siblings.length - 1;

  const step = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = siblings[index + delta];
      if (next) onSelect(next.id);
    },
    [index, siblings, onSelect],
  );

  // Arrow-key prev/next + Escape to close. Ignored while typing in a field so
  // the pane never hijacks keyboard input from a future inline editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        step(1);
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, step, onClose]);

  // Unit context for the Assess + Progress tabs.
  const unit = unitById[lesson.unit];
  const unitName = unit ? unitTopic(unit.name) : labels.unit;
  const asmt = useMemo(() => unitAssessments(unitName), [unitName]);

  // Week progress — across the focused week's lessons (the `siblings` pool the
  // caller passes). The Progress tab is titled "{week} progress" to match. The
  // dashboard (YearStatCards) carries the authoritative scope-wide numbers; this
  // pane reports the week it lives in. Falls back to just this lesson if the
  // sibling pool is somehow empty.
  const weekProgress = useMemo(() => {
    const pool = siblings.length > 0 ? siblings : [lesson];
    const total = pool.length;
    const done = pool.filter((l) => l.status === "done").length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [siblings, lesson]);

  const bucket = statusBucket(lesson.status);
  const dayName = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day + 1}`;

  return (
    <aside
      className={`cp-subj ${subject.cls} ${styles.pane}`}
      aria-label={`Lesson detail: ${lesson.title}`}
      title="The selected lesson — overview, standards, resources, and progress. Editing happens in the Daily view."
    >
      {/* Header: back/close + prev/next nav */}
      <div className={styles.back}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <IcChevL />
          {weekLabel ?? "Close"}
        </button>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => step(-1)}
            disabled={!hasPrev}
            aria-label="Previous lesson"
          >
            <IcChevL />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => step(1)}
            disabled={!hasNext}
            aria-label="Next lesson"
          >
            <IcChevR />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={onClose}
            aria-label="Close lesson detail"
          >
            <IcX />
          </button>
        </div>
      </div>

      <div className={styles.date}>
        {dayName} · {labels.week} {lesson.week}
      </div>
      <div className={styles.title}>
        <InstanceRenameLabel
          level="lesson"
          entityKey={lesson.id}
          defaultName={lesson.title}
          term={labels.lesson}
        />
      </div>

      {/* Pill badges: subject · time · status · personal */}
      <div className={styles.badges}>
        <span className={`${styles.b} ${styles.bSubj}`}>
          <span className={styles.bDot} aria-hidden="true" />
          {subject.name}
        </span>
        <span className={`${styles.b} ${styles.bNeutral}`}>
          <IcClock />
          {lesson.time ?? "45 min"}
        </span>
        {lesson.status === "done" ? (
          <span className={`${styles.b} ${styles.bDone}`}>
            <IcCheck />
            Completed
          </span>
        ) : (
          <span className={`${styles.b} ${styles.bNeutral}`}>
            <IcClock />
            {bucket === "cur" ? "In progress" : "Upcoming"}
          </span>
        )}
        {lesson.isPersonal ? (
          <span className={`${styles.b} ${styles.bSubj}`}>
            <IcEdit />
            Personal
          </span>
        ) : null}
      </div>

      {/* Open in Daily — the editing handoff (this pane is read-only). */}
      <Button
        variant="secondary"
        size="sm"
        className={styles.openBtn}
        onClick={onOpenInDaily}
        tooltip="Open this lesson in the Daily view, where you can edit every part of it — directions, resources, notes, and status"
      >
        Open in Daily
      </Button>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Lesson detail sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            className={`${styles.tab} ${t === tab ? styles.tabOn : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "Assessments" ? "Assess" : t}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "Overview" && (
        <>
          {lesson.objective ? (
            <p className={styles.objLead}>{lesson.objective}</p>
          ) : null}
          <section className={styles.sec}>
            <h4>
              <IcBook />
              {labels.lesson} overview
            </h4>
            <p>{lesson.preview || "No preview written for this lesson yet."}</p>
          </section>
          {lesson.directions ? (
            <section className={styles.sec}>
              <h4>
                <IcTarget />
                Directions
              </h4>
              <p>{lesson.directions}</p>
            </section>
          ) : null}
          {lesson.notes ? (
            <section className={styles.sec}>
              <h4>
                <IcEdit />
                Teacher notes
              </h4>
              <p>{lesson.notes}</p>
            </section>
          ) : null}
        </>
      )}

      {/* ── Standards ── */}
      {tab === "Standards" && (
        <section className={styles.sec}>
          <h4>
            <IcStandards />
            Standards
          </h4>
          {lesson.standards.length === 0 ? (
            <p className={styles.empty}>No standards tagged on this lesson yet.</p>
          ) : (
            lesson.standards.map((code) => (
              <div className={styles.std} key={code}>
                <StandardPill code={code} />
                <div className={styles.stdTxt}>{describeStandard(code)}</div>
              </div>
            ))
          )}
        </section>
      )}

      {/* ── Resources ── */}
      {tab === "Resources" && (
        <section className={styles.sec}>
          <h4>
            <IcFolder />
            Resources
          </h4>
          {lesson.resources.length === 0 ? (
            <p className={styles.empty}>
              No resources attached to this lesson yet.
            </p>
          ) : (
            lesson.resources.map((r, i) => {
              const inner = (
                <>
                  <span className={styles.resIcon}>
                    <ResourceTypeIcon resource={r} />
                  </span>
                  <div className={styles.resMeta}>
                    <div className={styles.resTitle}>{r.label}</div>
                    <div className={styles.resKind}>{r.type}</div>
                  </div>
                </>
              );
              return r.url ? (
                <a
                  key={`${r.label}-${i}`}
                  className={styles.res}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {inner}
                </a>
              ) : (
                <div className={styles.res} key={`${r.label}-${i}`}>
                  {inner}
                </div>
              );
            })
          )}
        </section>
      )}

      {/* ── Assessments (derived/mock — parity with Curriculum) ── */}
      {tab === "Assessments" && (
        <section className={styles.sec}>
          <h4>
            <IcClipboard />
            {labels.unit} assessments
          </h4>
          {asmt.map((a) => (
            <div className={styles.asmt} key={a.t}>
              <span className={styles.asmtIcon}>{a.ic}</span>
              <div className={styles.asmtMeta}>
                <div className={styles.asmtTitle}>{a.t}</div>
                <div className={styles.asmtSub}>{a.m}</div>
              </div>
              <span className={`${styles.asmtBadge} ${styles[a.st]}`}>
                {a.st === "done" ? "Done" : a.st === "due" ? "Due soon" : "Upcoming"}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ── Progress ── */}
      {tab === "Progress" && (
        <section className={`${styles.sec} ${styles.prog}`}>
          <h4>
            <IcChart />
            {labels.week} progress
          </h4>
          <div className={styles.bar}>
            <i style={{ width: `${weekProgress.pct}%` }} />
          </div>
          <div className={styles.pm}>
            <span>
              <b>{weekProgress.pct}%</b> complete
            </span>
            <span>
              {weekProgress.done} of {weekProgress.total}{" "}
              {pluralize(labels.lesson).toLowerCase()}
            </span>
          </div>
        </section>
      )}
    </aside>
  );
}
