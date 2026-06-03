"use client";

// Year Overview — Timeline (Curriculy) prototype, ported to idiomatic React.
// Faithful recreation of prototypes/Year Overview - Timeline (Curriculy).html:
// progressive selection (open a unit → pick a week → pick a day), expand-under-
// row detail with a downward arrow, and a right lesson drawer. Data is mocked.
// TEMPORARY preview surface — reachable from the top-bar "Proto · Timeline"
// button; remove with app/prototypes/* once a direction is chosen.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./timeline.module.css";

// ── Per-subject color cascade (matches curriculy-data.js COLORS) ──────────
interface Col {
  c: string;
  d: string;
  t: string;
  i: string;
  sh: string;
  rt: string;
  s: string;
}
const COLORS: Record<string, Col> = {
  blue:   { c: "#4788D1", d: "#244A75", t: "#E2E9F0", i: "#4A6A95", sh: "rgba(71,136,209,.32)", rt: "#F5F9FC", s: "#7A9EC7" }, // prettier-ignore
  orange: { c: "#E8BB17", d: "#7A671F", t: "#F4EFDF", i: "#927A2E", sh: "rgba(232,187,23,.38)", rt: "#FCFAF1", s: "#DCC674" }, // prettier-ignore
  green:  { c: "#47D183", d: "#247547", t: "#E2F0E8", i: "#3E8A60", sh: "rgba(71,209,131,.32)", rt: "#F4FBF7", s: "#7AC79B" }, // prettier-ignore
  purple: { c: "#9F47D1", d: "#572475", t: "#EBE2F0", i: "#7A5AA0", sh: "rgba(159,71,209,.30)", rt: "#FAF6FD", s: "#AB7AC7" }, // prettier-ignore
};

type Status = "done" | "cur" | "todo";
interface Week {
  n: string;
  d: string;
  dates: string;
  st: Status;
}
interface Day {
  dy: string;
  dt: string;
  t: string;
  doc?: boolean;
  x?: boolean;
  ch?: boolean;
}
interface Detail {
  dates: string;
  weeks: Week[];
  dayweeks: Record<number, Day[]>;
}
interface Unit {
  n: string;
  name: string;
  detail: Detail;
}
interface Subject {
  id: string;
  name: string;
  grade: string;
  color: keyof typeof COLORS;
  icon: IconName;
  units: Unit[];
}

const MATH_U3: Detail = {
  dates: "January 13 – February 14, 2025 · 7 Weeks",
  weeks: [
    { n: "Week 1", d: "Multiplication as Repeated Addition", dates: "Dec 30 – Jan 3", st: "done" }, // prettier-ignore
    { n: "Week 2", d: "Multiply by 1-Digit Numbers", dates: "Jan 6 – Jan 10", st: "done" }, // prettier-ignore
    { n: "Week 3", d: "Multiply by 2-Digit Numbers", dates: "Jan 13 – Jan 17", st: "cur" }, // prettier-ignore
    { n: "Week 4", d: "Division as Grouping", dates: "Jan 20 – Jan 24", st: "todo" }, // prettier-ignore
    { n: "Week 5", d: "Divide by 1-Digit Numbers", dates: "Jan 27 – Jan 31", st: "todo" }, // prettier-ignore
    { n: "Week 6", d: "Word Problems", dates: "Feb 3 – Feb 7", st: "todo" }, // prettier-ignore
    { n: "Week 7", d: "Review & Assessment", dates: "Feb 10 – Feb 14", st: "todo" }, // prettier-ignore
  ],
  dayweeks: {
    2: [
      { dy: "Mon", dt: "Jan 13", t: "Model 2-Digit Multiplication", doc: true }, // prettier-ignore
      { dy: "Tue", dt: "Jan 14", t: "Partial Products Strategy", doc: true },
      { dy: "Wed", dt: "Jan 15", t: "Area Model Multiplication", x: true },
      { dy: "Thu", dt: "Jan 16", t: "Solve with Numbers", ch: true },
      { dy: "Fri", dt: "Jan 17", t: "Practice & Exit Ticket", doc: true },
    ],
  },
};

function genDetail(unitName: string): Detail {
  const baseW = [
    "Introduction & Hook",
    "Core Concepts",
    "Guided Practice",
    "Apply & Extend",
    "Review & Assessment",
  ];
  return {
    dates: `${unitName} · 5 Weeks`,
    weeks: baseW.map((d, i) => ({
      n: "Week " + (i + 1),
      d,
      dates: "",
      st: i < 1 ? "done" : i === 1 ? "cur" : "todo",
    })),
    dayweeks: {
      1: ["Mon", "Tue", "Wed", "Thu", "Fri"].map((dy, i) => ({
        dy,
        dt: "",
        t: [
          `Launch: ${unitName}`,
          "Mini-lesson & model",
          "Guided practice",
          "Independent work",
          "Wrap-up & exit ticket",
        ][i],
        doc: true,
      })),
    },
  };
}

const RAW_SUBJECTS: {
  id: string;
  name: string;
  grade: string;
  color: keyof typeof COLORS;
  icon: IconName;
  units: string[];
}[] = [
  { id: "reading", name: "Reading", grade: "Grade 3", color: "blue", icon: "book", units: ["Building Strong Readers", "Character & Setting", "Main Idea & Details", "Compare & Contrast", "Fact & Opinion", "Summarizing"] }, // prettier-ignore
  { id: "math", name: "Math", grade: "Grade 3", color: "orange", icon: "calc", units: ["Place Value", "Addition & Subtraction", "Multiplication & Division", "Fractions", "Measurement", "Geometry"] }, // prettier-ignore
  { id: "science", name: "Science", grade: "Grade 3", color: "green", icon: "flask", units: ["Life Cycles", "Habitats", "Rocks & Minerals", "Forces & Motion", "Weather & Climate", "Energy"] }, // prettier-ignore
  { id: "social", name: "Social Studies", grade: "Grade 3", color: "purple", icon: "globe", units: ["Communities", "Our Country", "Regions", "Early People", "Government", "Economics"] }, // prettier-ignore
];

const SUBJECTS: Subject[] = RAW_SUBJECTS.map((s) => ({
  ...s,
  units: s.units.map((name, i) => ({
    n: "Unit " + (i + 1),
    name,
    detail: s.id === "math" && i === 2 ? MATH_U3 : genDetail(name),
  })),
}));

const STD: Record<string, string> = { blue: "RL.5.3", orange: "5.NBT.5", green: "5-PS1-3", purple: "SS.5.2" }; // prettier-ignore
const STD2: Record<string, string> = { blue: "RL.5.2", orange: "5.NBT.6", green: "5-PS1-4", purple: "SS.5.3" }; // prettier-ignore
const OBJECTIVES: Record<string, string[]> = {
  blue: ["Infer using text evidence", "Explain thinking in writing", "Discuss with a partner"], // prettier-ignore
  orange: ["Model the strategy with place value", "Solve multi-digit problems", "Check answers for reasonableness"], // prettier-ignore
  green: ["Make an observation", "Record data accurately", "Draw a conclusion from evidence"], // prettier-ignore
  purple: ["Locate key facts in a source", "Compare two perspectives", "Summarize the main idea"], // prettier-ignore
};

// ── Inline line icons (Lucide-family) ─────────────────────────────────────
type IconName =
  | "book"
  | "calc"
  | "flask"
  | "globe"
  | "doc"
  | "target"
  | "info"
  | "hand"
  | "clock"
  | "check"
  | "x"
  | "standards"
  | "folder"
  | "grid"
  | "chart"
  | "arrowR"
  | "chevDown"
  | "chevUp";
const PATHS: Record<IconName, ReactNode> = {
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></>, // prettier-ignore
  calc: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h.01M12 11h.01M16 11h4M8 15h.01M12 15h.01M8 19h.01M12 19h.01M16 15v4" /></>, // prettier-ignore
  flask: <><path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" /><path d="M7 14h10" /></>, // prettier-ignore
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>, // prettier-ignore
  doc: <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /></>, // prettier-ignore
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1.2" /></>, // prettier-ignore
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>, // prettier-ignore
  hand: <path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11M12 10V3.5a1.5 1.5 0 0 1 3 0V12a6 6 0 0 1-6 6 6 6 0 0 1-5.2-3l-1.5-2.6a1.5 1.5 0 0 1 2.6-1.5L7 13" />, // prettier-ignore
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="m5 13 4 4 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  standards: <><path d="M4 19.5V6a2 2 0 0 1 2-2h12v15" /><path d="M6 17h12v3H6a2 2 0 0 1 0-3z" /></>, // prettier-ignore
  folder: <path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />, // prettier-ignore
  grid: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>, // prettier-ignore
  chart: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 14v3M12 10v7M16 7v10" /></>, // prettier-ignore
  arrowR: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevDown: <path d="m6 9 6 6 6-6" />,
  chevUp: <path d="m6 15 6-6 6 6" />,
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
      {PATHS[name]}
    </svg>
  );
}

function svar(col: Col): CSSProperties {
  return {
    "--uc": col.c,
    "--ud": col.d,
    "--ut": col.t,
    "--ui": col.i,
    "--ush": col.sh,
    "--rt": col.rt,
    "--us": col.s,
  } as CSSProperties;
}

function Circle({ st }: { st: Status }): ReactNode {
  if (st === "done")
    return (
      <span className={`${styles.cir} ${styles.done}`}>
        <Icon name="check" sw={3} />
      </span>
    );
  if (st === "cur") return <span className={`${styles.cir} ${styles.cur}`} />;
  return <span className={styles.cir} />;
}

export function TimelineProto(): ReactNode {
  // Progressive selection state — nothing selected by default.
  const [open, setOpen] = useState<{ si: number; ui: number } | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [selDay, setSelDay] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);

  // Escape closes the drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawer(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openUnit(si: number, ui: number) {
    const same = open && open.si === si && open.ui === ui;
    setOpen(same ? null : { si, ui });
    setSelWeek(null);
    setSelDay(null);
    setDrawer(false);
  }
  function toggleChev(si: number) {
    const same = open && open.si === si;
    setOpen(same ? null : { si, ui: 0 });
    setSelWeek(null);
    setSelDay(null);
    setDrawer(false);
  }
  function pickWeek(w: number) {
    setSelWeek((cur) => (cur === w ? null : w));
    setSelDay(null);
    setDrawer(false);
  }
  function pickDay(d: number) {
    setSelDay(d);
    setDrawer(true);
  }

  const openSubject = open ? SUBJECTS[open.si] : null;
  const openUnitObj = open ? openSubject!.units[open.ui] : null;
  const daysFor =
    openUnitObj && selWeek != null
      ? (openUnitObj.detail.dayweeks[selWeek] ??
        genDetail(openUnitObj.detail.weeks[selWeek].d).dayweeks[1])
      : [];

  return (
    <div className={styles.app}>
      {/* Sidebar */}
      <aside className={styles.side}>
        <div className={styles.logo}>
          <span className={styles.cube}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"
                fill="#fff"
              />{" "}
              {/* prettier-ignore */}
              <path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" fill="#3A2A05" opacity=".5" />{" "}
              {/* prettier-ignore */}
            </svg>
          </span>
          <b>
            mycurricula<span className={styles.tld}>.app</span>
          </b>
        </div>
        <div className={styles.navsec}>PLAN</div>
        <span className={`${styles.nav} ${styles.navOn}`}>
          <Icon name="grid" /> Year overview
        </span>
        <span className={styles.nav}>
          <Icon name="book" /> By subject
        </span>
        <span className={styles.nav}>
          <Icon name="doc" /> By unit
        </span>
        <div className={styles.navsec}>TOOLS</div>
        <span className={styles.nav}>
          <Icon name="standards" /> Standards
        </span>
        <span className={styles.nav}>
          <Icon name="folder" /> Resources
        </span>
        <div className={styles.grow} />
        <div className={styles.classes}>
          <div className={styles.clshead}>My classes</div>
          <div className={styles.clsitem}>
            <span className={styles.dot} />
            5th grade
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.yearsel}>
            <Icon name="grid" />
            2024–2025 school year
            <Icon name="chevDown" />
          </div>
          <div className={styles.search}>
            <Icon name="info" />
            <input placeholder="Search units, lessons, standards…" />
          </div>
          <div className={styles.user}>
            <span className={styles.av}>MH</span>
            <div>
              <div className={styles.nm}>Ms. Harper</div>
              <div className={styles.rl}>Teacher</div>
            </div>
          </div>
        </header>

        <div className={styles.scroll}>
          <div className={styles.pagehead}>
            <div>
              <h1>Year overview</h1>
              <div className={styles.sub}>2024–2025 school year</div>
            </div>
            <div className={styles.acts}>
              <div className={styles.toggle}>
                <button className={styles.on}>
                  <Icon name="standards" /> Timeline
                </button>
                <button>
                  <Icon name="grid" /> Table
                </button>
              </div>
              <button className={styles.obtn}>Export</button>
              <button className={styles.pbtn}>
                <Icon name="check" sw={2.2} /> Add unit
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className={styles.tl}>
            <div className={styles.tlhead}>
              <div />
              <div>
                <div className={styles.years}>
                  <span className={`${styles.y} ${styles.y1}`}>2024</span>
                  <span className={styles.y}>2025</span>
                </div>
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
                    "JUN",
                  ].map(
                    (
                      m, // prettier-ignore
                    ) => (
                      <span key={m}>{m}</span>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className={styles.rows}>
              <div className={styles.todayline} aria-hidden="true" />
              {SUBJECTS.map((s, si) => {
                const col = COLORS[s.color];
                const isOpen = open?.si === si;
                const openU = isOpen ? open!.ui : -1;
                return (
                  <div className={styles.rowwrap} key={s.id} style={svar(col)}>
                    <div
                      className={`${styles.subrow} ${isOpen ? styles.hot : ""}`}
                    >
                      <div className={styles.slabel}>
                        <span
                          className={styles.si}
                          style={{ background: col.t, color: col.c }}
                        >
                          <Icon name={s.icon} />
                        </span>
                        <div>
                          <div className={styles.sn}>{s.name}</div>
                          <div className={styles.sg}>{s.grade}</div>
                        </div>
                      </div>
                      <div className={styles.units}>
                        {s.units.map((u, ui) => (
                          <button
                            key={ui}
                            className={`${styles.unit} ${ui === openU ? styles.sel : ""}`}
                            onClick={() => openUnit(si, ui)}
                          >
                            <div className={styles.un}>{u.n}</div>
                            <div className={styles.us}>{u.name}</div>
                          </button>
                        ))}
                        <button
                          className={styles.chev}
                          onClick={() => toggleChev(si)}
                          aria-label={`Toggle ${s.name} units`}
                        >
                          <span
                            style={{
                              transform: `rotate(${isOpen ? 180 : 0}deg)`,
                              display: "grid",
                            }}
                          >
                            <Icon name="chevDown" />
                          </span>
                        </button>
                      </div>
                    </div>

                    {isOpen && openUnitObj && (
                      <div className={styles.detail}>
                        <div className={styles.dhead}>
                          <span className={styles.di}>
                            <Icon name={s.icon} />
                          </span>
                          <div className={styles.htext}>
                            <div className={styles.dt}>
                              <b>{openUnitObj.n}</b>&nbsp;&nbsp;
                              {openUnitObj.name}
                            </div>
                            <div className={styles.dd}>
                              {openUnitObj.detail.dates}
                            </div>
                          </div>
                          <button
                            className={styles.dclose}
                            onClick={() => setOpen(null)}
                            aria-label="Collapse unit"
                          >
                            <Icon name="chevUp" />
                          </button>
                        </div>
                        <div className={styles.dbody}>
                          <div className={styles.dmain}>
                            <div className={styles.weeksLabel}>Weeks</div>
                            <div className={styles.weeks}>
                              {openUnitObj.detail.weeks.map((w, i) => (
                                <button
                                  key={i}
                                  className={`${styles.wk} ${i === selWeek ? styles.sel : ""}`}
                                  onClick={() => pickWeek(i)}
                                >
                                  <div className={styles.wst}>
                                    <Circle st={w.st} />
                                  </div>
                                  <div className={styles.wn}>{w.n}</div>
                                  <div className={styles.wd}>{w.d}</div>
                                  <div className={styles.wdt}>{w.dates}</div>
                                </button>
                              ))}
                            </div>

                            {selWeek == null ? (
                              <div className={styles.daysrow}>
                                <div className={styles.dhint}>
                                  <Icon name="info" /> Select a week above to
                                  see its daily lessons.
                                </div>
                              </div>
                            ) : (
                              <div className={styles.daysrow}>
                                <div className={styles.dlabel}>
                                  <b>{openUnitObj.detail.weeks[selWeek].n}</b>
                                  <span>
                                    {openUnitObj.detail.weeks[selWeek].dates}
                                    {selDay == null
                                      ? " · select a day to open its lesson"
                                      : ""}
                                  </span>
                                </div>
                                <div className={styles.days}>
                                  {daysFor.map((d, di) => (
                                    <button
                                      key={di}
                                      className={`${styles.day} ${di === selDay ? styles.sel : ""}`}
                                      onClick={() => pickDay(di)}
                                    >
                                      <div className={styles.dtop}>
                                        <div className={styles.dn}>{d.dy}</div>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                          }}
                                        >
                                          {d.dt && (
                                            <span className={styles.ddt}>
                                              {d.dt}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className={styles.dttl}>{d.t}</div>
                                      <div className={styles.dfoot}>
                                        {d.doc && <Icon name="doc" />}
                                        <span className={styles.dopen}>
                                          Open lesson{" "}
                                          <Icon name="arrowR" sw={2.4} />
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer stats */}
          <div className={styles.stats}>
            {[
              ["6", "Subjects"],
              ["36", "Units"],
              ["180", "Weeks"],
              ["900+", "Lessons"],
              ["120", "Assessments"],
            ].map(([v, l]) => (
              <div className={styles.stat} key={l}>
                <span
                  className={styles.si}
                  style={{ background: "var(--brand-50)", color: "var(--brand-600)" }} // prettier-ignore
                >
                  <Icon name="chart" />
                </span>
                <div>
                  <div className={styles.sv}>{v}</div>
                  <div className={styles.sl}>{l}</div>
                </div>
              </div>
            ))}
            <div className={styles.leg}>
              <span className={styles.lg}>
                <span
                  className={styles.d}
                  style={{ background: "var(--brand-500)" }}
                />{" "}
                {/* prettier-ignore */}
                In progress
              </span>
              <span className={styles.lg}>
                <span
                  className={styles.d}
                  style={{ background: "var(--faint)" }}
                />{" "}
                {/* prettier-ignore */}
                Not started
              </span>
              <span className={styles.lg}>
                <span
                  className={styles.d}
                  style={{ background: "var(--done)" }}
                />{" "}
                {/* prettier-ignore */}
                Completed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right lesson drawer */}
      {drawer &&
        open &&
        selWeek != null &&
        selDay != null &&
        daysFor[selDay] && (
          <LessonDrawer
            subject={openSubject!}
            unit={openUnitObj!}
            week={openUnitObj!.detail.weeks[selWeek]}
            day={daysFor[selDay]}
            onClose={() => setDrawer(false)}
          />
        )}

      <div className={styles.protoFlag}>
        Prototype A · Timeline — temporary preview
      </div>
    </div>
  );
}

function LessonDrawer({
  subject,
  unit,
  week,
  day,
  onClose,
}: {
  subject: Subject;
  unit: Unit;
  week: Week;
  day: Day;
  onClose: () => void;
}): ReactNode {
  const col = COLORS[subject.color];
  const status: [string, string] = day.ch
    ? ["done", "Taught"]
    : day.x
      ? ["g", "Moved this week"]
      : ["g", "Planned"];
  const acts: [string, string][] = [
    ["Warm-up", "5 min"],
    [`Mini-lesson · ${day.t}`, "15 min"],
    ["Guided practice", "15 min"],
    ["Independent work", "8 min"],
    ["Exit ticket", "2 min"],
  ];
  const resources: [IconName, string, string][] = [
    ["grid", "Mini-lesson slides", "Google Slides"],
    ["doc", "Practice pages", "PDF · 2 pages"],
    ["chart", "Anchor chart", "PNG image"],
  ];
  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.ldraw}
        style={svar(col)}
        aria-label="Lesson detail"
      >
        <div className={styles.lh}>
          <span className={styles.lhi}>
            <Icon name={subject.icon} />
          </span>
          <div>
            <div className={styles.lsub}>{subject.name}</div>
            <div className={styles.lwk}>
              {unit.n} · {week.n}
            </div>
          </div>
          <button
            className={styles.lx}
            onClick={onClose}
            aria-label="Close lesson detail"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className={styles.lbody}>
          <div className={styles.lday}>
            {day.dy}
            {day.dt ? " · " + day.dt : ""}
          </div>
          <div className={styles.ltitle}>{day.t}</div>
          <div className={styles.lbadges}>
            <span className={`${styles.lb} ${styles.s}`}>
              <Icon name={subject.icon} />
              {subject.name}
            </span>
            <span className={`${styles.lb} ${styles.g}`}>
              <Icon name="clock" />
              45 min
            </span>
            <span className={`${styles.lb} ${styles[status[0]]}`}>
              {status[0] === "done" ? (
                <Icon name="check" sw={3} />
              ) : (
                <Icon name="clock" />
              )}
              {status[1]}
            </span>
          </div>
          <div className={styles.lsec}>
            <h4>
              <Icon name="info" />
              Lesson overview
            </h4>
            <p>
              Students work toward “{day.t.toLowerCase()}” through a short
              mini-lesson, guided practice, and an independent task, finishing
              with a quick exit ticket to check understanding.
            </p>
          </div>
          <div className={styles.lsec}>
            <h4>
              <Icon name="hand" />
              Activities
            </h4>
            {acts.map(([n, m], i) => (
              <div className={styles.lact} key={i}>
                <span className={styles.ln}>{i + 1}</span>
                {n}
                <span className={styles.lm}>{m}</span>
              </div>
            ))}
          </div>
          <div className={styles.lsec}>
            <h4>
              <Icon name="target" />
              Objectives
            </h4>
            {OBJECTIVES[subject.color].map((o) => (
              <div className={styles.lobj} key={o}>
                <Icon name="check" sw={3} />
                {o}
              </div>
            ))}
          </div>
          <div className={styles.lsec}>
            <h4>
              <Icon name="standards" />
              Standards
            </h4>
            <div className={styles.lstd}>
              <div className={styles.code}>{STD[subject.color]}</div>
              <div className={styles.txt}>
                Grade 5 standard addressed by today&apos;s lesson and practice.
              </div>
            </div>
            <div className={styles.lstd}>
              <div className={styles.code}>{STD2[subject.color]}</div>
              <div className={styles.txt}>
                Supporting standard reinforced through guided work.
              </div>
            </div>
          </div>
          <div className={styles.lsec}>
            <h4>
              <Icon name="folder" />
              Resources
            </h4>
            {resources.map(([i, t, k]) => (
              <div className={styles.lres} key={t}>
                <span className={styles.ri}>
                  <Icon name={i} />
                </span>
                <div>
                  <div className={styles.rt}>{t}</div>
                  <div className={styles.rk}>{k}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.lfoot}>
          <button className={`${styles.lbtn} ${styles.lprimary}`}>
            <Icon name="check" sw={3} />
            Mark complete
          </button>
          <button className={`${styles.lbtn} ${styles.lsecondary}`}>
            <Icon name="doc" />
            Edit
          </button>
        </div>
      </aside>
    </>
  );
}
