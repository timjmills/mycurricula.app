"use client";

// TimelineYear — the production Year view, rebuilt on the Timeline (Curriculy)
// design. One row per subject; a subject's units sit across the year. Click a
// unit → its weeks expand under the row with a downward arrow; click a week →
// that week's days/lessons appear; click a day → the app's lesson-detail panel
// opens via setSelectedLessonId (no bespoke drawer).
//
// Everything is wired to the LIVE planner document (usePlanner().lessons) plus
// the curriculum fixtures (SUBJECTS, ALL_UNITS). There is NO filter UI here —
// the surface's single job is to navigate the year. A StatStrip at the top
// shows live year-wide totals.
//
// Visual contract: each subject row carries the `.cp-subj.<id>` class so the
// palette bridge's --c / --cl / --cd tokens cascade; the CSS module derives
// the prototype's --uc/--ud/--ut/--us/--ush/--rt cascade aliases from those.
// Tokens only — no hex.

import { useMemo, useState, type ReactNode, type SVGProps } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, ALL_UNITS, CURRENT_WEEK, WEEK_DAYS_SHORT } from "@/lib/mock";
import type { Lesson, LessonStatus, Subject, Unit } from "@/lib/types";
import { StatStrip } from "@/components/subject";
import styles from "./TimelineYear.module.css";

// ── Inline icons (Lucide-family, currentColor) ──────────────────────────────

type IconProps = SVGProps<SVGSVGElement> & { sw?: number };
function Svg({
  sw = 2,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}
const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 13 4 4 10-11" />
  </Svg>
);
const IconChevDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const IconChevUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);
const IconArrowR = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Svg>
);
const IconDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
  </Svg>
);

// ── Derived shapes ──────────────────────────────────────────────────────────

/** One week inside a unit, derived from that unit's lessons. */
interface WeekGroup {
  /** 1-based curriculum week number. */
  week: number;
  /** Lessons in this week, sorted by day. */
  lessons: Lesson[];
  /** Rolled-up status for the week's circle marker. */
  state: "done" | "cur" | "todo";
}

/** A unit with its lessons grouped into weeks. */
interface UnitGroup {
  unit: Unit;
  /** Week-span label parsed from unit.weeks (e.g. "Wk 11–16"). */
  spanLabel: string;
  /** Inclusive [start, end] derived from the unit's lessons (falls back to the
   *  parsed label when the unit has no lessons yet). */
  start: number;
  end: number;
  weeks: WeekGroup[];
  total: number;
}

/** Roll a set of lesson statuses up into a single week marker state. */
function rollUpWeek(week: number, lessons: Lesson[]): WeekGroup["state"] {
  if (lessons.length === 0) return week < CURRENT_WEEK ? "done" : "todo";
  const allDone = lessons.every((l) => l.status === "done");
  if (allDone) return "done";
  const inProgress =
    week === CURRENT_WEEK ||
    lessons.some(
      (l) =>
        l.status === "partial" || l.status === "carried" || l.status === "done",
    );
  return inProgress ? "cur" : "todo";
}

/** Per-lesson status → the small day dot class suffix. */
function dayDotClass(status: LessonStatus): string {
  switch (status) {
    case "done":
      return styles.done;
    case "skipped":
      return styles.skipped;
    case "partial":
    case "carried":
      return styles.cur;
    default:
      return "";
  }
}

/** Parse a unit.weeks label like "Wk 11–16" / "Wk 12" into [start, end]. */
function parseSpan(label: string): [number, number] | null {
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const start = Number(nums[0]);
  const end = nums.length > 1 ? Number(nums[1]) : start;
  return [start, end];
}

/** Build the per-subject unit groups from the live lessons + unit catalog. */
function buildSubjectGroups(subject: Subject, lessons: Lesson[]): UnitGroup[] {
  const units = ALL_UNITS.filter((u) => u.subject === subject.id);

  const groups = units.map<UnitGroup>((unit) => {
    const unitLessons = lessons.filter(
      (l) => l.unit === unit.id && !l.archived,
    );

    // Group this unit's lessons by week.
    const byWeek = new Map<number, Lesson[]>();
    for (const l of unitLessons) {
      const arr = byWeek.get(l.week);
      if (arr) arr.push(l);
      else byWeek.set(l.week, [l]);
    }

    const weeks: WeekGroup[] = Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, ls]) => {
        const sorted = [...ls].sort((a, b) => a.day - b.day);
        return { week, lessons: sorted, state: rollUpWeek(week, sorted) };
      });

    // Span: prefer the real lesson weeks; fall back to the label.
    const parsed = parseSpan(unit.weeks);
    const start = weeks.length > 0 ? weeks[0].week : parsed ? parsed[0] : 0;
    const end =
      weeks.length > 0 ? weeks[weeks.length - 1].week : parsed ? parsed[1] : 0;

    return {
      unit,
      spanLabel: unit.weeks,
      start,
      end,
      weeks,
      total: unitLessons.length,
    };
  });

  // Sort units left→right by their start week so the row reads chronologically.
  return groups.sort((a, b) => a.start - b.start);
}

/** Strip the "Unit N · " / "List N · " / "Lessons … · " lead-in so the unit
 *  card can show a short title and a separate prefix when present. */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

// ── Week circle marker ──────────────────────────────────────────────────────

function WeekCircle({ state }: { state: WeekGroup["state"] }): ReactNode {
  if (state === "done")
    return (
      <span className={`${styles.cir} ${styles.done}`}>
        <IconCheck sw={3} />
      </span>
    );
  if (state === "cur")
    return <span className={`${styles.cir} ${styles.cur}`} />;
  return <span className={styles.cir} />;
}

// ── Component ───────────────────────────────────────────────────────────────

/** Identifies the open unit: `${subjectId}:${unitId}`. */
type OpenKey = string | null;

export function TimelineYear(): ReactNode {
  const { lessons } = usePlanner();
  const { setSelectedLessonId } = useAppState();

  // Progressive selection — nothing open by default.
  const [openUnit, setOpenUnit] = useState<OpenKey>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  // Per-subject unit groups, recomputed when the live document changes.
  const subjectGroups = useMemo(
    () =>
      SUBJECTS.map((s) => ({
        subject: s,
        groups: buildSubjectGroups(s, lessons),
      })),
    [lessons],
  );

  function toggleUnit(subjectId: string, unitId: string) {
    const key = `${subjectId}:${unitId}`;
    setOpenUnit((cur) => (cur === key ? null : key));
    setOpenWeek(null);
  }
  function pickWeek(week: number) {
    setOpenWeek((cur) => (cur === week ? null : week));
  }
  function openLesson(id: string) {
    setSelectedLessonId(id);
  }

  return (
    <div>
      {/* Page heading */}
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Plan</div>
          <h1>Yearly View</h1>
          <div className={styles.sub}>
            The whole year at a glance — open a unit to drill into its weeks and
            daily lessons.
          </div>
        </div>
      </div>

      {/* Live year-wide stat strip. The wrapper carries a neutral .cp-subj
          context (math) so StatStrip's --c / --cd resolve to a subject color
          rather than being undefined across the multi-subject year scope. */}
      <div className={`${styles.statWrap} cp-subj math`}>
        <StatStrip lessons={lessons} />
      </div>

      {/* Timeline card */}
      <div className={styles.tl}>
        <div className={styles.tlhead}>
          <div />
          <div>
            <div className={styles.months}>
              {[
                "AUG",
                "SEP",
                "OCT",
                "NOV",
                "DEC",
                "JAN",
                "FEB",
                "MAR",
                "APR",
                "MAY",
              ].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.rows}>
          <div className={styles.todayline} aria-hidden="true" />

          {subjectGroups.map(({ subject, groups }) => {
            const subjectKey = subject.id + ":";
            const isOpen = openUnit?.startsWith(subjectKey) ?? false;
            const openGroup = isOpen
              ? (groups.find(
                  (g) => `${subject.id}:${g.unit.id}` === openUnit,
                ) ?? null)
              : null;

            return (
              <div
                key={subject.id}
                className={`${styles.rowwrap} ${styles.tlVars} cp-subj ${subject.cls}`}
              >
                <div className={`${styles.subrow} ${isOpen ? styles.hot : ""}`}>
                  <div className={styles.slabel}>
                    <span className={styles.si} aria-hidden="true">
                      {subject.icon}
                    </span>
                    <div>
                      <div className={styles.sn}>{subject.name}</div>
                      <div className={styles.sg}>Grade 5</div>
                    </div>
                  </div>

                  <div className={styles.units}>
                    {groups.map((g) => {
                      const key = `${subject.id}:${g.unit.id}`;
                      const sel = key === openUnit;
                      const { prefix, rest } = splitUnitName(g.unit.name);
                      return (
                        <button
                          key={g.unit.id}
                          type="button"
                          className={`${styles.unit} ${sel ? styles.sel : ""}`}
                          onClick={() => toggleUnit(subject.id, g.unit.id)}
                          aria-expanded={sel}
                          title={g.unit.name}
                        >
                          <div className={styles.un}>{prefix || rest}</div>
                          {prefix ? (
                            <div className={styles.us}>{rest}</div>
                          ) : null}
                          <div className={styles.uw}>{g.spanLabel}</div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={styles.chev}
                      onClick={() => {
                        // Toggle the first unit open/closed as a quick handle.
                        if (groups.length === 0) return;
                        if (isOpen) {
                          setOpenUnit(null);
                          setOpenWeek(null);
                        } else {
                          toggleUnit(subject.id, groups[0].unit.id);
                        }
                      }}
                      aria-label={`Toggle ${subject.name} units`}
                    >
                      <span
                        style={{
                          transform: `rotate(${isOpen ? 180 : 0}deg)`,
                          display: "grid",
                        }}
                      >
                        <IconChevDown />
                      </span>
                    </button>
                  </div>
                </div>

                {/* Expand-under-row detail for the open unit */}
                {openGroup ? (
                  <div className={styles.detail}>
                    <div className={styles.dhead}>
                      <span className={styles.di} aria-hidden="true">
                        {subject.icon}
                      </span>
                      <div className={styles.htext}>
                        <div className={styles.dt}>
                          {(() => {
                            const { prefix, rest } = splitUnitName(
                              openGroup.unit.name,
                            );
                            return prefix ? (
                              <>
                                <b>{prefix}</b>&nbsp;&nbsp;{rest}
                              </>
                            ) : (
                              <b>{rest}</b>
                            );
                          })()}
                        </div>
                        <div className={styles.dd}>
                          {openGroup.spanLabel} · {openGroup.total}{" "}
                          {openGroup.total === 1 ? "lesson" : "lessons"} planned
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.dclose}
                        onClick={() => {
                          setOpenUnit(null);
                          setOpenWeek(null);
                        }}
                        aria-label="Collapse unit"
                      >
                        <IconChevUp />
                      </button>
                    </div>

                    <div className={styles.dbody}>
                      <div className={styles.dmain}>
                        <div className={styles.weeksLabel}>Weeks</div>

                        {openGroup.weeks.length === 0 ? (
                          <div className={styles.empty}>
                            No lessons planned for this unit yet.
                          </div>
                        ) : (
                          <div className={styles.weeks}>
                            {openGroup.weeks.map((w) => {
                              const first = w.lessons[0];
                              return (
                                <button
                                  key={w.week}
                                  type="button"
                                  className={`${styles.wk} ${w.week === openWeek ? styles.sel : ""}`}
                                  onClick={() => pickWeek(w.week)}
                                  aria-expanded={w.week === openWeek}
                                >
                                  <div className={styles.wst}>
                                    <WeekCircle state={w.state} />
                                  </div>
                                  <div className={styles.wn}>Week {w.week}</div>
                                  <div className={styles.wd}>
                                    {first ? first.title : ""}
                                  </div>
                                  <div className={styles.wdt}>
                                    {w.lessons.length}{" "}
                                    {w.lessons.length === 1
                                      ? "lesson"
                                      : "lessons"}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Days for the selected week */}
                        {openWeek == null ? (
                          openGroup.weeks.length > 0 ? (
                            <div className={styles.daysrow}>
                              <div className={styles.dhint}>
                                <IconInfo /> Select a week above to see its
                                daily lessons.
                              </div>
                            </div>
                          ) : null
                        ) : (
                          (() => {
                            const wg = openGroup.weeks.find(
                              (w) => w.week === openWeek,
                            );
                            if (!wg) return null;
                            return (
                              <div className={styles.daysrow}>
                                <div className={styles.dlabel}>
                                  <b>Week {wg.week}</b>
                                  <span>
                                    Select a day to open its lesson detail
                                  </span>
                                </div>
                                <div className={styles.days}>
                                  {wg.lessons.map((l) => (
                                    <button
                                      key={l.id}
                                      type="button"
                                      className={styles.day}
                                      onClick={() => openLesson(l.id)}
                                      title={l.title}
                                    >
                                      <div className={styles.dtop}>
                                        <div className={styles.dn}>
                                          {WEEK_DAYS_SHORT[l.day] ??
                                            `Day ${l.day + 1}`}
                                        </div>
                                        <span
                                          className={`${styles.statusDot} ${dayDotClass(
                                            l.status,
                                          )}`}
                                          aria-hidden="true"
                                        />
                                      </div>
                                      <div className={styles.dttl}>
                                        {l.title}
                                      </div>
                                      <div className={styles.dfoot}>
                                        <IconDoc />
                                        <span className={styles.dopen}>
                                          Open lesson <IconArrowR sw={2.4} />
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.leg}>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--done)" }} />
          Completed
        </span>
        <span className={styles.lg}>
          <span
            className={styles.d}
            style={{ background: "var(--brand-500)" }}
          />
          In progress
        </span>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--faint)" }} />
          Not started
        </span>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--catchup)" }} />
          Skipped
        </span>
      </div>
    </div>
  );
}
