"use client";

// SubjectView.tsx — S1 Subject (Curriculum) view.
//
// REBUILD: Workspace (EduPlan) design, wired to REAL curriculum data.
// A multi-panel workspace:
//   • left  — subjects switcher panel (each subject + its inline unit list,
//             per-subject color cascade)
//   • center — a vertical stack:
//       Year overview (unit bars)
//         → Subject roadmap (unit cards)
//         → Week breakdown (week cards for the active unit)
//         → Daily lessons (day cards for the active week)
//   • right — lesson viewer with tabs (Overview / Standards / Resources /
//             Assessments / Progress) for the selected lesson.
//
// Selection cascade: pick subject → recolors + loads its units; pick unit →
// loads that unit's weeks; pick week → loads that week's days; pick day → opens
// the right viewer on that real Lesson.
//
// The prototype's OUTER chrome (app nav rail `.side`, global `.etop` topbar) is
// intentionally NOT rendered — the app shell owns global nav. Only the
// view-specific panels are kept.
//
// The StatStrip (the one piece kept from the previous Subject view) renders at
// the top, scoped to the active subject's lessons.
//
// Route sync: the dynamic route /subject/[slug] renders <SubjectView
// initialSubject={slug} />. We mirror the slug into app-state's subjectView and,
// on a subject pick, router.push("/subject/<id>") + setSubjectView(id).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useLabels, pluralize } from "@/lib/labels";
import { weekKey } from "@/lib/instance-labels";
import { InstanceRenameLabel } from "@/components/rename";
import { useSubjectColor } from "@/lib/palette";
import { CURRENT_WEEK, WEEK_DAYS } from "@/lib/mock";
import { usePlanner } from "@/lib/planner-store";
import { StatStrip } from "./StatStrip";
import styles from "./SubjectWorkspace.module.css";

// ── Icons ────────────────────────────────────────────────────────────────────
// A small inline icon set (ported from the prototype) so the view is
// self-contained and does not depend on the shell's icon components.

type IconName =
  | "book" | "grid" | "pencil" | "list" | "sparkle" | "flask" | "globe"
  | "heart" | "calendar" | "roadmap" | "chD" | "chL" | "chR" | "x" | "plus"
  | "check" | "clock" | "more" | "chart" | "target" | "clipboard" | "edit"
  | "standards" | "folder" | "assess" | "curriculum"; // prettier-ignore

const ICON_PATHS: Record<IconName, ReactNode> = {
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></>, // prettier-ignore
  grid: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>, // prettier-ignore
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>, // prettier-ignore
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  sparkle: <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />, // prettier-ignore
  flask: <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M7 14h10" />, // prettier-ignore
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>, // prettier-ignore
  heart: <path d="M12 20s-7-4.4-9.2-8.2C1.3 9 2.6 5.5 6 5.5c2 0 3.2 1.3 4 2.4.8-1.1 2-2.4 4-2.4 3.4 0 4.7 3.5 3.2 6.3C19 15.6 12 20 12 20z" />, // prettier-ignore
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>, // prettier-ignore
  roadmap: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H16a2 2 0 0 1 2 2v7M6 8.5V16a2 2 0 0 0 2 2h7.5" /></>, // prettier-ignore
  chD: <path d="m6 9 6 6 6-6" />,
  chL: <path d="m15 6-6 6 6 6" />,
  chR: <path d="m9 6 6 6-6 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 13 4 4 10-11" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>, // prettier-ignore
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>, // prettier-ignore
  chart: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 14v3M12 10v7M16 7v10" /></>, // prettier-ignore
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" /></>, // prettier-ignore
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>, // prettier-ignore
  edit: <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4 1 1-4z" /></>, // prettier-ignore
  standards: <><path d="M4 19.5V6a2 2 0 0 1 2-2h12v15" /><path d="M6 17h12v3H6a2 2 0 0 1 0-3z" /></>, // prettier-ignore
  folder: <path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />, // prettier-ignore
  assess: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>, // prettier-ignore
  curriculum: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>, // prettier-ignore
};

function Icon({ name, sw = 2 }: { name: IconName; sw?: number }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Per-subject glyph for the panel + viewer badge. */
const SUBJECT_ICON: Record<SubjectId, IconName> = {
  math: "grid",
  reading: "book",
  writing: "pencil",
  grammar: "list",
  spelling: "sparkle",
  ufli: "flask",
  explorers: "globe",
  sel: "heart",
};

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Standards", "Resources", "Assessments", "Progress"];
const MONTHS = ["AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN"]; // prettier-ignore

type AsmtStatus = "done" | "due" | "up";

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Parse a unit's "Wk 11–16" / "Wk 12" label into an ordered week-number list.
 *  Falls back to an empty list when the label has no parseable digits. */
function parseWeekSpan(label: string): number[] {
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return [];
  const start = parseInt(nums[0], 10);
  const end = nums.length > 1 ? parseInt(nums[1], 10) : start;
  const out: number[] = [];
  for (let w = start; w <= end; w++) out.push(w);
  return out;
}

/** A unit's display tag, e.g. "Unit 3" — derived from its 1-based index.
 *  `term` is the (possibly renamed) Unit caption from useLabels(). */
function unitTag(index: number, term = "Unit"): string {
  return `${term} ${index + 1}`;
}

/** Strip a leading "Unit N · " prefix from a mock unit name so the roadmap card
 *  shows just the topic (the tag carries the "Unit N"). */
function unitTopic(name: string): string {
  return name.replace(/^Unit\s+\d+\s*·\s*/i, "").replace(/^List\s+\d+\s*·\s*/i, ""); // prettier-ignore
}

/** Approximate month index (0 = Aug) for a week number — 4 weeks ≈ 1 month. */
function weekToMonthIndex(week: number): number {
  return Math.min(MONTHS.length - 1, Math.floor((week - 1) / 4));
}

/** Map a lesson status onto the prototype's three-state vocabulary. */
function statusBucket(status: LessonStatus): "done" | "cur" | "todo" {
  if (status === "done") return "done";
  if (status === "partial" || status === "carried") return "cur";
  return "todo";
}

/** Derived unit assessments — mocked, but keyed to the real unit name. */
function unitAssessments(
  unitName: string,
): { t: string; m: string; st: AsmtStatus; ic: IconName }[] {
  return [
    { t: `${unitName} — Diagnostic`, m: "Pre-assessment · 10 items", st: "done", ic: "clipboard" }, // prettier-ignore
    { t: `${unitName} — Mid-Unit Quiz`, m: "Formative", st: "due", ic: "assess" }, // prettier-ignore
    { t: `${unitName} — Performance Task`, m: "Summative · end of unit", st: "up", ic: "target" }, // prettier-ignore
    { t: `${unitName} — Exit Tickets`, m: "Daily checks · ongoing", st: "up", ic: "edit" }, // prettier-ignore
  ];
}

// ── Subject row (its own component so each can resolve its swatch color) ──────

interface SubjectRowProps {
  subjectId: SubjectId;
  isActive: boolean;
  units: { id: string; name: string; index: number; done: boolean }[];
  activeUnitId: string;
  onPickSubject: () => void;
  onPickUnit: (unitId: string) => void;
}

function SubjectRow({
  subjectId,
  isActive,
  units,
  activeUnitId,
  onPickSubject,
  onPickUnit,
}: SubjectRowProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const { subjectById } = usePlanner();
  const subject = subjectById[subjectId];
  // Renameable Unit caption — so the inline unit list under each subject reads
  // "Module 1" etc. when the team has renamed the level.
  const labels = useLabels();

  // Per-subject swatch vars consumed by the .subj* rules.
  const svars = {
    "--s-c": color.c,
    "--s-d": color.cd,
    "--s-t": color.cl,
    "--s-s": color.stripe,
  } as CSSProperties;

  return (
    <div>
      <button
        className={`${styles.subj} ${isActive ? styles.subjOn : ""}`}
        style={svars}
        onClick={onPickSubject}
        title={`Show ${subject.name} — its units, weeks, and lessons`}
      >
        <span className={styles.si}>
          <Icon name={SUBJECT_ICON[subjectId]} />
        </span>
        <div>
          <div className={styles.sn}>{subject.name}</div>
          <div className={styles.sg}>Grade 5</div>
        </div>
        <span className={styles.sc} />
      </button>
      {isActive && (
        <div className={styles.subwrap}>
          {units.map((ut) => (
            <button
              key={ut.id}
              className={[
                styles.uitem,
                ut.id === activeUnitId ? styles.uitemOn : "",
                ut.done ? styles.uitemDone : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPickUnit(ut.id)}
            >
              <span className={styles.uc}>
                {ut.done && <Icon name="check" sw={3} />}
              </span>
              <div>
                <span className={styles.un}>
                  {unitTag(ut.index, labels.unit)}
                </span>{" "}
                · <span className={styles.ut}>{unitTopic(ut.name)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main pane (one active subject) ───────────────────────────────────────────

interface SubjectPaneProps {
  subjectId: SubjectId;
  onPickSubject: (id: SubjectId) => void;
}

function SubjectPane({
  subjectId,
  onPickSubject,
}: SubjectPaneProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const {
    lessons,
    units: allUnits,
    subjects,
    subjectById,
    describeStandard,
  } = usePlanner();
  const subject = subjectById[subjectId];
  const { setSelectedLessonId } = useAppState();
  // Renameable hierarchy captions (Subject / Unit / Week / Lesson). Picking a
  // term in Settings → Appearance retitles every heading below site-wide.
  const labels = useLabels();

  // Active-subject accent cascade — set on the root so the whole subtree
  // inherits the colors via var() references in the CSS module.
  const accent = {
    "--ac": color.c,
    "--ac-d": color.cd,
    "--ac-t": color.cl,
    "--ac-s": color.stripe,
  } as CSSProperties;

  // All lessons for this subject (the StatStrip + every panel derive from this).
  const subjectLessons = useMemo(
    () => lessons.filter((l) => l.subject === subjectId && !l.archived),
    [lessons, subjectId],
  );

  // Units for this subject, in catalog order, with per-unit progress.
  const units = useMemo(() => {
    const subjUnits = allUnits.filter((u) => u.subject === subjectId);
    return subjUnits.map((u, index) => {
      const unitLessons = subjectLessons.filter((l) => l.unit === u.id);
      const total = unitLessons.length;
      const done = unitLessons.filter((l) => l.status === "done").length;
      const weeks = parseWeekSpan(u.weeks);
      const isCurrent =
        weeks.length > 0 &&
        CURRENT_WEEK >= weeks[0] &&
        CURRENT_WEEK <= weeks[weeks.length - 1];
      return {
        id: u.id,
        name: u.name,
        index,
        weeks: u.weeks,
        weekNums: weeks,
        total,
        done,
        // A unit reads "done" only when it has lessons AND all are done.
        allDone: total > 0 && done === total,
        isCurrent,
      };
    });
  }, [subjectId, subjectLessons, allUnits]);

  // ── Selection state: unit → week → day(lesson). Reset on subject change via
  //    the key on <SubjectPane> in the root. Initial unit = the current one,
  //    else the first. Initial week = current week if in span, else first.
  const initialUnitId = useMemo(() => {
    const cur = units.find((u) => u.isCurrent);
    return cur?.id ?? units[0]?.id ?? "";
  }, [units]);

  const [activeUnitId, setActiveUnitId] = useState<string>(initialUnitId);
  const activeUnit = units.find((u) => u.id === activeUnitId) ?? units[0];

  // Weeks of the active unit that actually carry lessons, in order.
  const weeks = useMemo(() => {
    if (!activeUnit) return [];
    const byWeek = new Map<number, Lesson[]>();
    for (const l of subjectLessons) {
      if (l.unit !== activeUnit.id) continue;
      const arr = byWeek.get(l.week) ?? [];
      arr.push(l);
      byWeek.set(l.week, arr);
    }
    return [...byWeek.keys()]
      .sort((a, b) => a - b)
      .map((w) => {
        const wl = byWeek.get(w)!.sort((a, b) => a.day - b.day);
        const done = wl.filter((l) => l.status === "done").length;
        return {
          week: w,
          lessons: wl,
          allDone: wl.length > 0 && done === wl.length,
          isCurrent: w === CURRENT_WEEK,
        };
      });
  }, [activeUnit, subjectLessons]);

  const initialWeek = useMemo(() => {
    const cur = weeks.find((w) => w.isCurrent);
    return cur?.week ?? weeks[0]?.week ?? null;
  }, [weeks]);

  const [activeWeek, setActiveWeek] = useState<number | null>(initialWeek);

  // Keep selection valid when the active unit's week set changes.
  useEffect(() => {
    if (activeWeek == null || !weeks.some((w) => w.week === activeWeek)) {
      setActiveWeek(initialWeek);
    }
  }, [weeks, activeWeek, initialWeek]);

  const activeWeekEntry = weeks.find((w) => w.week === activeWeek) ?? weeks[0];
  const days = activeWeekEntry?.lessons ?? [];

  // Selected lesson (right viewer). Default to the first day of the week.
  const [selectedId, setSelectedId] = useState<string | null>(
    days[0]?.id ?? null,
  );
  const [tab, setTab] = useState("Overview");
  const [rpanelOpen, setRpanelOpen] = useState(false);
  // Subjects-panel slide-over open state (narrow viewports).
  const [snavOpen, setSnavOpen] = useState(false);

  // The Week-breakdown card — picking a unit scrolls it into view so the
  // newly-opened weeks are visible (matters when picking from the Year
  // overview, which sits above the week list).
  const weekCardRef = useRef<HTMLDivElement>(null);

  // Keep the selection valid when the day set changes (unit/week switch).
  useEffect(() => {
    if (!selectedId || !days.some((l) => l.id === selectedId)) {
      setSelectedId(days[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnitId, activeWeek]);

  const selectedLesson =
    days.find((l) => l.id === selectedId) ?? days[0] ?? null;
  const selectedIndex = selectedLesson
    ? days.findIndex((l) => l.id === selectedLesson.id)
    : -1;

  // ── Selection handlers ───────────────────────────────────────────────────
  function pickUnit(unitId: string): void {
    setActiveUnitId(unitId);
    // week/day reset via the validity effects above. Bring the Week-breakdown
    // card into view so the unit's weeks are visibly "opened".
    weekCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); // prettier-ignore
    // On narrow viewports the Subjects panel is a slide-over — close it after a
    // unit pick so the freshly-opened weeks aren't hidden behind it.
    if (typeof window !== "undefined" && window.innerWidth <= 1000) {
      setSnavOpen(false);
    }
  }
  function pickWeek(week: number): void {
    setActiveWeek(week);
  }
  function pickDay(lesson: Lesson): void {
    setSelectedId(lesson.id);
    setTab("Overview");
    // Mirror to app-state so other shell surfaces can react if they want; the
    // Workspace's own right viewer remains the primary detail surface here.
    setSelectedLessonId(lesson.id);
    if (typeof window !== "undefined" && window.innerWidth <= 1240) {
      setRpanelOpen(true);
    }
  }
  function stepDay(delta: number): void {
    if (selectedIndex < 0) return;
    const next = days[selectedIndex + delta];
    if (next) {
      setSelectedId(next.id);
      setSelectedLessonId(next.id);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setSnavOpen(false);
        setRpanelOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const asmt = activeUnit ? unitAssessments(unitTopic(activeUnit.name)) : [];
  const currentMonth = activeUnit?.weekNums.length
    ? weekToMonthIndex(activeUnit.weekNums[0])
    : -1;

  // Right-viewer progress (derived from the active unit's completion).
  const unitDone = activeUnit?.done ?? 0;
  const unitTotal = activeUnit?.total ?? 0;
  const unitPct = unitTotal > 0 ? Math.round((unitDone / unitTotal) * 100) : 0;

  return (
    <div className={styles.app} style={accent}>
      {/* In-view bar — subject name + the subjects-panel toggle for narrow
          viewports (replaces the prototype's global topbar). */}
      <div className={`${styles.viewbar} cp-subj ${subjectId}`}>
        <button
          className={`${styles.topbtn} ${styles.topbtnSubjects}`}
          onClick={() => setSnavOpen(true)}
          aria-label={`Show ${pluralize(labels.subject).toLowerCase()}`}
          title={`Show the ${pluralize(labels.subject).toLowerCase()} panel`}
        >
          <Icon name="curriculum" />
        </button>
        <h2>
          <InstanceRenameLabel
            level="subject"
            entityKey={subjectId}
            defaultName={subject.name}
            term={labels.subject}
          />
        </h2>
        <span className={styles.grade}>Grade 5</span>
        <span className={styles.grow} />
      </div>

      {/* Stat strip — scoped to the active subject's lessons. KEPT from the
          previous Subject view. */}
      <div className={`${styles.statWrap} cp-subj ${subjectId}`}>
        <StatStrip lessons={subjectLessons} />
      </div>

      <div className={styles.bodyrow}>
        {/* ── Subjects panel — the left switcher: every subject, with the
            active subject's units inlined beneath it. Picking a subject
            recolors + reloads; picking a unit opens its weeks. */}
        <aside
          className={`${styles.snav} ${snavOpen ? styles.snavOpen : ""}`}
          title={`Switch ${pluralize(labels.subject).toLowerCase()} and drill into a ${labels.unit.toLowerCase()}`}
        >
          <div className={styles.snhead}>
            {pluralize(labels.subject)}{" "}
            <span className={styles.n}>{subjects.length}</span>
            <button
              className={styles.pclose}
              style={{ marginLeft: 10 }}
              onClick={() => setSnavOpen(false)}
              aria-label={`Close ${pluralize(labels.subject).toLowerCase()} panel`}
            >
              <Icon name="x" />
            </button>
          </div>
          {subjects.map((sj) => {
            const isActive = sj.id === subjectId;
            const rowUnits = isActive
              ? units.map((u) => ({
                  id: u.id,
                  name: u.name,
                  index: u.index,
                  done: u.allDone,
                }))
              : [];
            return (
              <SubjectRow
                key={sj.id}
                subjectId={sj.id}
                isActive={isActive}
                units={rowUnits}
                activeUnitId={activeUnitId}
                onPickSubject={() => onPickSubject(sj.id)}
                onPickUnit={pickUnit}
              />
            );
          })}
        </aside>

        {/* ── Center stack ── */}
        <main className={styles.center}>
          {/* Year overview */}
          <div className={styles.ecard}>
            <div className={styles.ech}>
              <span className={styles.ci}>
                <Icon name="calendar" />
              </span>
              <h3>Year overview — {subject.name}</h3>
            </div>
            <div className={styles.months2}>
              {MONTHS.map((m, i) => (
                <span key={m} className={i === currentMonth ? styles.on : ""}>
                  {m}
                </span>
              ))}
            </div>
            <div className={styles.ybars}>
              {units.map((u) => {
                const isPastOrCurrent =
                  activeUnit != null && u.index <= activeUnit.index;
                const on = u.id === activeUnitId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`${styles.ybar} ${on ? styles.ybarOn : ""}`}
                    style={{
                      background: isPastOrCurrent ? color.c : color.stripe,
                      opacity: isPastOrCurrent ? 1 : 0.45,
                    }}
                    onClick={() => pickUnit(u.id)}
                    aria-label={`Open ${unitTag(u.index, labels.unit)} ${unitTopic(u.name)}`}
                    title={`Open ${unitTag(u.index, labels.unit)}: ${unitTopic(u.name)} — its ${pluralize(labels.week).toLowerCase()} and ${pluralize(labels.lesson).toLowerCase()}`}
                  >
                    {u.allDone && (
                      <span className={styles.mk} style={{ color: color.c }}>
                        <Icon name="check" sw={2.6} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className={styles.ulegend}>
              {units.map((u) => (
                <button
                  type="button"
                  className={`${styles.uleg} ${u.id === activeUnitId ? styles.ulegOn : ""}`}
                  key={u.id}
                  onClick={() => pickUnit(u.id)}
                  title={`Open ${unitTag(u.index, labels.unit)}: ${unitTopic(u.name)} — its ${pluralize(labels.week).toLowerCase()} and ${pluralize(labels.lesson).toLowerCase()}`}
                >
                  <div className={styles.ud}>
                    <span
                      className={styles.d}
                      style={{ background: color.c }}
                    />
                    {unitTag(u.index, labels.unit)}
                  </div>
                  <div className={styles.un}>{unitTopic(u.name)}</div>
                  <div className={styles.udt}>{u.weeks}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Week breakdown — weeks of the active unit */}
          <div className={styles.ecard} ref={weekCardRef}>
            <div className={styles.ech}>
              <span className={styles.ci}>
                <Icon name="grid" />
              </span>
              <h3>
                {labels.week} breakdown —{" "}
                {activeUnit ? (
                  <>
                    {unitTag(activeUnit.index, labels.unit)}:{" "}
                    <InstanceRenameLabel
                      level="unit"
                      entityKey={activeUnit.id}
                      defaultName={unitTopic(activeUnit.name)}
                      term={labels.unit}
                    />
                  </>
                ) : (
                  labels.unit
                )}
              </h3>
            </div>
            {weeks.length === 0 ? (
              <div className={styles.empty}>
                No planned {pluralize(labels.lesson).toLowerCase()} for this{" "}
                {labels.unit.toLowerCase()} yet.
              </div>
            ) : (
              <div className={styles.hscroll}>
                {weeks.map((wk) => (
                  <button
                    key={wk.week}
                    className={`${styles.wkcard} ${wk.week === activeWeek ? styles.wkcardOn : ""}`}
                    onClick={() => pickWeek(wk.week)}
                    title={`Show ${labels.week} ${wk.week} ${pluralize(labels.lesson).toLowerCase()}`}
                  >
                    <div className={styles.wn}>
                      {labels.week} {wk.week}
                    </div>
                    <div className={styles.wt}>
                      {wk.lessons.length}{" "}
                      {wk.lessons.length === 1
                        ? labels.lesson.toLowerCase()
                        : pluralize(labels.lesson).toLowerCase()}
                    </div>
                    <div className={styles.wd}>
                      <span className={styles.wdt}>Wk {wk.week}</span>
                      {wk.allDone && (
                        <span style={{ color: "var(--done)" }}>
                          <Icon name="check" sw={3} />
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Daily lessons — days of the active week */}
          <div className={styles.ecard}>
            <div className={styles.ech}>
              <span className={styles.ci}>
                <Icon name="calendar" />
              </span>
              <h3>
                Daily {pluralize(labels.lesson).toLowerCase()} —{" "}
                {activeWeekEntry ? (
                  <InstanceRenameLabel
                    level="week"
                    entityKey={weekKey(
                      activeUnit?.id ?? "",
                      activeWeekEntry.week,
                    )}
                    defaultName={`${labels.week} ${activeWeekEntry.week}`}
                    term={labels.week}
                  />
                ) : (
                  labels.week
                )}
              </h3>
            </div>
            {days.length === 0 ? (
              <div className={styles.empty}>
                No {pluralize(labels.lesson).toLowerCase()} this{" "}
                {labels.week.toLowerCase()}.
              </div>
            ) : (
              <div className={styles.hscroll}>
                {days.map((lesson) => {
                  const bucket = statusBucket(lesson.status);
                  const dayLabel = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day}`;
                  return (
                    <button
                      key={lesson.id}
                      className={`${styles.daycard} ${lesson.id === selectedId ? styles.daycardOn : ""}`}
                      onClick={() => pickDay(lesson)}
                      title={`Open ${lesson.title} in the lesson viewer`}
                    >
                      <div className={styles.dh}>{dayLabel}</div>
                      <div className={styles.dt2}>{lesson.title}</div>
                      {lesson.objective && (
                        <div className={styles.it}>
                          <Icon name="check" sw={3} />
                          {lesson.objective}
                        </div>
                      )}
                      {lesson.standards.slice(0, 2).map((s) => (
                        <div className={styles.it} key={s}>
                          <Icon name="check" sw={3} />
                          {s}
                        </div>
                      ))}
                      <div className={styles.df}>
                        <span className={styles.min}>
                          {lesson.time ?? "45 min"}
                        </span>
                        <span className={styles.dots}>
                          {bucket === "done" ? (
                            <Icon name="check" sw={3} />
                          ) : bucket === "cur" ? (
                            <Icon name="clock" />
                          ) : (
                            <Icon name="more" />
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className={styles.elegend} style={{ marginTop: 14 }}>
              <span className={styles.elg} style={{ color: "var(--done)" }}>
                <Icon name="assess" />
                <span style={{ color: "var(--muted)" }}>Completed</span>
              </span>
              <span className={styles.elg}>
                <Icon name="clock" />
                In progress
              </span>
              <span className={styles.elg}>
                <span className={styles.rc0} />
                Upcoming
              </span>
            </div>
          </div>
        </main>

        {/* ── Right lesson viewer ── */}
        <aside
          className={`${styles.rpanel} ${rpanelOpen ? styles.rpanelOpen : ""}`}
          title="The selected lesson — overview, standards, resources, and progress"
        >
          {selectedLesson ? (
            <>
              <div className={styles.rback}>
                <button
                  className={styles.b}
                  onClick={() => {
                    setRpanelOpen(false);
                  }}
                >
                  <Icon name="chL" />
                  {activeWeekEntry
                    ? `${labels.week} ${activeWeekEntry.week}`
                    : "Back"}
                </button>
                <div className={styles.rnav}>
                  <button
                    onClick={() => stepDay(-1)}
                    disabled={selectedIndex <= 0}
                    aria-label="Previous lesson"
                  >
                    <Icon name="chL" />
                  </button>
                  <button
                    onClick={() => stepDay(1)}
                    disabled={
                      selectedIndex < 0 || selectedIndex >= days.length - 1
                    }
                    aria-label="Next lesson"
                  >
                    <Icon name="chR" />
                  </button>
                  <button
                    className={styles.pclose}
                    onClick={() => setRpanelOpen(false)}
                    aria-label="Close lesson viewer"
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>

              <div className={styles.rdate}>
                {WEEK_DAYS[selectedLesson.day] ?? `Day ${selectedLesson.day}`} ·{" "}
                {labels.week} {selectedLesson.week}
              </div>
              <div className={styles.rtitle}>
                <InstanceRenameLabel
                  level="lesson"
                  entityKey={selectedLesson.id}
                  defaultName={selectedLesson.title}
                  term={labels.lesson}
                />
              </div>

              <div className={styles.rbadges}>
                <span className={`${styles.rb} ${styles.p}`}>
                  <Icon name={SUBJECT_ICON[subjectId]} />
                  {subject.name}
                </span>
                <span className={`${styles.rb} ${styles.g}`}>
                  <Icon name="clock" />
                  {selectedLesson.time ?? "45 min"}
                </span>
                {selectedLesson.status === "done" ? (
                  <span className={`${styles.rb} ${styles.d}`}>
                    <Icon name="check" sw={3} />
                    Completed
                  </span>
                ) : (
                  <span className={`${styles.rb} ${styles.g}`}>
                    <Icon name="clock" />
                    {statusBucket(selectedLesson.status) === "cur"
                      ? "In progress"
                      : "Upcoming"}
                  </span>
                )}
                {selectedLesson.isPersonal && (
                  <span className={`${styles.rb} ${styles.p}`}>
                    <Icon name="edit" />
                    Personal
                  </span>
                )}
              </div>

              <div className={styles.rtabs}>
                {TABS.map((t) => (
                  <button
                    key={t}
                    className={`${styles.rtab} ${t === tab ? styles.rtabOn : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "Assessments" ? "Assess" : t}
                  </button>
                ))}
              </div>

              {tab === "Overview" && (
                <>
                  {selectedLesson.objective && (
                    <p className={styles.robjlead}>
                      {selectedLesson.objective}
                    </p>
                  )}
                  <div className={styles.rsec}>
                    <h4>
                      <Icon name="book" />
                      {labels.lesson} overview
                    </h4>
                    <p>
                      {selectedLesson.preview ||
                        "No preview written for this lesson yet."}
                    </p>
                  </div>
                  {selectedLesson.directions && (
                    <div className={styles.rsec}>
                      <h4>
                        <Icon name="target" />
                        Directions
                      </h4>
                      <p>{selectedLesson.directions}</p>
                    </div>
                  )}
                  {selectedLesson.notes && (
                    <div className={styles.rsec}>
                      <h4>
                        <Icon name="edit" />
                        Teacher notes
                      </h4>
                      <p>{selectedLesson.notes}</p>
                    </div>
                  )}
                </>
              )}

              {tab === "Standards" && (
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="standards" />
                    Standards <span className={styles.ccgs}>CCSS</span>
                  </h4>
                  {selectedLesson.standards.length === 0 ? (
                    <p className={styles.rempty}>
                      No standards tagged on this lesson yet.
                    </p>
                  ) : (
                    selectedLesson.standards.map((code) => (
                      <div className={styles.rstd} key={code}>
                        <div className={styles.code}>{code}</div>
                        <div className={styles.txt}>
                          {describeStandard(code)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "Resources" && (
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="folder" />
                    Resources
                  </h4>
                  {selectedLesson.resources.length === 0 ? (
                    <p className={styles.rempty}>
                      No resources attached to this lesson yet.
                    </p>
                  ) : (
                    selectedLesson.resources.map((r, i) =>
                      r.url ? (
                        <a
                          key={`${r.label}-${i}`}
                          className={styles.rres}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <span className={styles.ri}>
                            <Icon name="folder" />
                          </span>
                          <div>
                            <div className={styles.rt}>{r.label}</div>
                            <div className={styles.rk}>{r.type}</div>
                          </div>
                        </a>
                      ) : (
                        <div className={styles.rres} key={`${r.label}-${i}`}>
                          <span className={styles.ri}>
                            <Icon name="folder" />
                          </span>
                          <div>
                            <div className={styles.rt}>{r.label}</div>
                            <div className={styles.rk}>{r.type}</div>
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>
              )}

              {tab === "Assessments" && (
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="clipboard" />
                    {labels.unit} assessments —{" "}
                    {activeUnit ? unitTag(activeUnit.index, labels.unit) : ""}
                  </h4>
                  {asmt.map((a) => (
                    <div className={styles.uasmt} key={a.t}>
                      <span className={styles.ai}>
                        <Icon name={a.ic} />
                      </span>
                      <div>
                        <div className={styles.at}>{a.t}</div>
                        <div className={styles.am}>{a.m}</div>
                      </div>
                      <span className={`${styles.ab} ${styles[a.st]}`}>
                        {a.st === "done"
                          ? "Done"
                          : a.st === "due"
                            ? "Due soon"
                            : "Upcoming"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {tab === "Progress" && (
                <div className={`${styles.rsec} ${styles.rprog}`}>
                  <h4>
                    <Icon name="chart" />
                    {labels.unit} progress
                  </h4>
                  <div className={styles.bar}>
                    <i style={{ width: `${unitPct}%` }} />
                  </div>
                  <div className={styles.pm}>
                    <span>
                      <b>{unitPct}%</b> complete
                    </span>
                    <span>
                      {unitDone} of {unitTotal}{" "}
                      {pluralize(labels.lesson).toLowerCase()}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={styles.rempty}>
              Pick a day from the {pluralize(labels.lesson).toLowerCase()} above
              to see its details here.
            </p>
          )}
        </aside>
      </div>

      {(snavOpen || rpanelOpen) && (
        <div
          className={styles.mscrim}
          onClick={() => {
            setSnavOpen(false);
            setRpanelOpen(false);
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ── Root SubjectView ─────────────────────────────────────────────────────────

export interface SubjectViewProps {
  initialSubject?: SubjectId;
}

export function SubjectView({ initialSubject }: SubjectViewProps): ReactNode {
  const { subjectView, setSubjectView } = useAppState();
  const router = useRouter();

  // Sync app-state when a slug param is passed in (from the dynamic route).
  useEffect(() => {
    if (initialSubject && initialSubject !== subjectView) {
      setSubjectView(initialSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubject]);

  function handleSubjectSelect(id: SubjectId): void {
    router.push(`/subject/${id}`);
    setSubjectView(id);
  }

  // Re-mount the pane on subject change so the unit/week/day selection state
  // resets cleanly to the new subject's defaults.
  return (
    <SubjectPane
      key={subjectView}
      subjectId={subjectView}
      onPickSubject={handleSubjectSelect}
    />
  );
}
