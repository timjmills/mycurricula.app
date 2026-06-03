"use client";

// Year Overview — Workspace (EduPlan) prototype, ported to idiomatic React.
// Faithful recreation of prototypes/Year Overview - Workspace (EduPlan).html:
// a dense multi-panel workspace — left subjects panel with an inline unit list,
// a center stack (Year Overview → Subject Roadmap → Week Breakdown → Daily
// Lessons), and a right docked lesson viewer with tabs. Per-subject color
// cascade. Responsive slide-overs. Data is mocked. TEMPORARY preview surface.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./workspace.module.css";

type IconName =
  | "home" | "planner" | "curriculum" | "assess" | "standards" | "folder"
  | "reports" | "calendar" | "settings" | "book" | "pencil" | "list"
  | "sparkle" | "flask" | "globe" | "heart" | "bell" | "help" | "search"
  | "x" | "chD" | "chL" | "chR" | "plus" | "check" | "clock" | "roadmap"
  | "grid" | "more" | "chart" | "target" | "clipboard" | "edit"; // prettier-ignore

const P: Record<IconName, ReactNode> = {
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></>, // prettier-ignore
  planner: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>, // prettier-ignore
  curriculum: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>, // prettier-ignore
  assess: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  standards: <><path d="M4 19.5V6a2 2 0 0 1 2-2h12v15" /><path d="M6 17h12v3H6a2 2 0 0 1 0-3z" /></>, // prettier-ignore
  folder: <path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />, // prettier-ignore
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>, // prettier-ignore
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" /></>, // prettier-ignore
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></>, // prettier-ignore
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  sparkle: <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />, // prettier-ignore
  flask: <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M7 14h10" />, // prettier-ignore
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>, // prettier-ignore
  heart: <path d="M12 20s-7-4.4-9.2-8.2C1.3 9 2.6 5.5 6 5.5c2 0 3.2 1.3 4 2.4.8-1.1 2-2.4 4-2.4 3.4 0 4.7 3.5 3.2 6.3C19 15.6 12 20 12 20z" />, // prettier-ignore
  bell: <><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17S18 15 18 9z" /><path d="M10.5 21a2 2 0 0 0 3 0" /></>, // prettier-ignore
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><path d="M12 17h.01" /></>, // prettier-ignore
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chD: <path d="m6 9 6 6 6-6" />,
  chL: <path d="m15 6-6 6 6 6" />,
  chR: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 13 4 4 10-11" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  roadmap: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H16a2 2 0 0 1 2 2v7M6 8.5V16a2 2 0 0 0 2 2h7.5" /></>, // prettier-ignore
  grid: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>, // prettier-ignore
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>, // prettier-ignore
  chart: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 14v3M12 10v7M16 7v10" /></>, // prettier-ignore
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" /></>, // prettier-ignore
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>, // prettier-ignore
  edit: <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4 1 1-4z" /></>, // prettier-ignore
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
      {" "}
      {/* prettier-ignore */}
      {P[name]}
    </svg>
  );
}

type Status = "done" | "cur" | "todo";
interface Subject {
  id: string;
  name: string;
  icon: IconName;
  c: string;
  d: string;
  t: string;
  s: string;
}
const SUBJECTS: Subject[] = [
  { id: "reading", name: "Reading", icon: "book", c: "#4788D1", d: "#244A75", t: "#E2E9F0", s: "#7A9EC7" }, // prettier-ignore
  { id: "math", name: "Math", icon: "grid", c: "#E8BB17", d: "#7A671F", t: "#F4EFDF", s: "#DCC674" }, // prettier-ignore
  { id: "writing", name: "Writing", icon: "pencil", c: "#E87917", d: "#7A491F", t: "#F4E9DF", s: "#DCA574" }, // prettier-ignore
  { id: "grammar", name: "Grammar", icon: "list", c: "#9F47D1", d: "#572475", t: "#EBE2F0", s: "#AB7AC7" }, // prettier-ignore
  { id: "spelling", name: "Spelling", icon: "sparkle", c: "#E8179B", d: "#7A1F59", t: "#F2E1EC", s: "#CF77AF" }, // prettier-ignore
  { id: "science", name: "Science", icon: "flask", c: "#47D183", d: "#247547", t: "#E2F0E8", s: "#7AC79B" }, // prettier-ignore
  { id: "social", name: "Social Studies", icon: "globe", c: "#47B6D1", d: "#246575", t: "#E2EEF0", s: "#7AB8C7" }, // prettier-ignore
  { id: "sel", name: "SEL", icon: "heart", c: "#4751D1", d: "#242975", t: "#E2E3F0", s: "#7A7FC7" }, // prettier-ignore
];

interface UnitT { n: string; name: string; st: Status; dates: string } // prettier-ignore
interface WeekT { n: string; name: string; dates: string; st: Status } // prettier-ignore
interface DayT { dy: string; title: string; items: string[]; st: Status; overview: string } // prettier-ignore

const READING_UNITS: UnitT[] = [
  { n: "Unit 1", name: "Building Strong Readers", st: "done", dates: "Aug 12 – Sep 27" }, // prettier-ignore
  { n: "Unit 2", name: "Exploring Theme & Message", st: "cur", dates: "Sep 30 – Nov 8" }, // prettier-ignore
  { n: "Unit 3", name: "Character & Perspective", st: "todo", dates: "Nov 11 – Jan 17" }, // prettier-ignore
  { n: "Unit 4", name: "Inform & Persuade", st: "todo", dates: "Jan 21 – Mar 14" }, // prettier-ignore
  { n: "Unit 5", name: "Research & Inquiry", st: "todo", dates: "Mar 17 – May 23" }, // prettier-ignore
];
const READING_WEEKS: WeekT[] = [
  { n: "Week 1", name: "Theme Basics", dates: "Sep 30 – Oct 4", st: "done" },
  { n: "Week 2", name: "Identifying Theme", dates: "Oct 7 – Oct 11", st: "cur" }, // prettier-ignore
  { n: "Week 3", name: "Theme in Depth", dates: "Oct 14 – Oct 18", st: "todo" }, // prettier-ignore
  { n: "Week 4", name: "Analyzing Multiple Themes", dates: "Oct 21 – Oct 25", st: "todo" }, // prettier-ignore
  { n: "Week 5", name: "Theme Across Genres", dates: "Oct 28 – Nov 1", st: "todo" }, // prettier-ignore
];
const READING_DAYS: DayT[] = [
  { dy: "Mon, Oct 7", title: "What Is Theme?", items: ["Introduce Theme", "Read Aloud", "Exit Ticket"], st: "done", overview: "Students understand the definition of theme and identify common themes in a short text." }, // prettier-ignore
  { dy: "Tue, Oct 8", title: "Finding Theme in Literature", items: ["Mini Lesson", "Guided Practice", "Quick Write"], st: "done", overview: "Students locate evidence of theme across a short literary passage and explain their thinking." }, // prettier-ignore
  { dy: "Wed, Oct 9", title: "Theme vs. Main Idea", items: ["Compare", "Group Activity", "Reflection"], st: "cur", overview: "Students distinguish theme from main idea and sort examples of each in small groups." }, // prettier-ignore
  { dy: "Thu, Oct 10", title: "Citing Text Evidence", items: ["Model", "Independent Work", "Share Out"], st: "todo", overview: "Students cite specific textual evidence to support a stated theme in writing." }, // prettier-ignore
  { dy: "Fri, Oct 11", title: "Theme Review & Synthesis", items: ["Review Game", "Writing Task", "Wrap-Up"], st: "todo", overview: "Students synthesize the week's learning and apply theme analysis to a new text." }, // prettier-ignore
];

const GEN_UNIT_NAMES: Record<string, string[]> = {
  math: ["Place Value", "Addition & Subtraction", "Multiplication & Division", "Fractions", "Measurement & Geometry"], // prettier-ignore
  writing: ["Personal Narrative", "Opinion Writing", "Informative Writing", "Research Reports", "Poetry & Voice"], // prettier-ignore
  grammar: ["Parts of Speech", "Sentence Structure", "Punctuation", "Verb Tenses", "Editing & Revising"], // prettier-ignore
  spelling: ["Short & Long Vowels", "Blends & Digraphs", "Greek & Latin Roots", "Prefixes & Suffixes", "Tricky Words"], // prettier-ignore
  science: ["Life Cycles", "Habitats & Ecosystems", "Rocks & Minerals", "Forces & Motion", "Weather & Climate"], // prettier-ignore
  social: ["Communities", "Our Country", "Regions & Geography", "Early People", "Government & Economics"], // prettier-ignore
  sel: ["Self-Awareness", "Managing Emotions", "Building Relationships", "Responsible Choices", "Goal Setting"], // prettier-ignore
};
function genUnits(id: string): UnitT[] {
  const names = GEN_UNIT_NAMES[id] ?? ["Unit One", "Unit Two", "Unit Three", "Unit Four", "Unit Five"]; // prettier-ignore
  const dates = ["Aug – Sep", "Sep – Nov", "Nov – Jan", "Jan – Mar", "Mar – May"]; // prettier-ignore
  return names.map((nm, i) => ({
    n: "Unit " + (i + 1),
    name: nm,
    st: i === 0 ? "done" : i === 1 ? "cur" : "todo",
    dates: dates[i],
  }));
}
function genWeeks(): WeekT[] {
  return [
    "Launch & Hook",
    "Core Concepts",
    "Guided Practice",
    "Apply & Extend",
    "Review & Assess",
  ].map((d, i) => ({
    // prettier-ignore
    n: "Week " + (i + 1),
    name: d,
    dates: "",
    st: i === 0 ? "done" : i === 1 ? "cur" : "todo",
  }));
}
function genDays(weekName: string, unitName: string): DayT[] {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((dy, i) => ({
    dy,
    title: [`Launch: ${weekName}`, "Mini-lesson & model", "Guided practice", "Independent work", "Wrap-up & exit ticket"][i], // prettier-ignore
    items: ["Warm-up", "Main activity", "Exit ticket"],
    st: i < 2 ? "done" : i === 2 ? "cur" : "todo",
    overview: `Students engage with ${unitName.toLowerCase()} through a focused ${dy} lesson with modeling and practice.`, // prettier-ignore
  }));
}

type AsmtStatus = "done" | "due" | "up";
function unitAssessments(
  unitName: string,
): { t: string; m: string; st: AsmtStatus; ic: IconName }[] {
  // prettier-ignore
  return [
    { t: `${unitName} — Diagnostic`, m: "Pre-assessment · 10 items", st: "done", ic: "clipboard" }, // prettier-ignore
    { t: `${unitName} — Mid-Unit Quiz`, m: "Formative · due Oct 18", st: "due", ic: "assess" }, // prettier-ignore
    { t: `${unitName} — Performance Task`, m: "Summative · end of unit", st: "up", ic: "target" }, // prettier-ignore
    { t: `${unitName} — Exit Tickets`, m: "Daily checks · ongoing", st: "up", ic: "edit" }, // prettier-ignore
  ];
}
const RES: { t: string; k: string; c: string; bg: string; ic: IconName }[] = [
  { t: "Mini-Lesson Slides", k: "Google Slides", c: "var(--honey-600)", bg: "var(--honey-50)", ic: "grid" }, // prettier-ignore
  { t: "Anchor Text Passage", k: "PDF", c: "var(--danger)", bg: "var(--danger-tint)", ic: "standards" }, // prettier-ignore
  { t: "Anchor Chart", k: "PNG Image", c: "var(--done)", bg: "var(--done-tint)", ic: "chart" }, // prettier-ignore
];
const TABS = ["Overview", "Standards", "Resources", "Assessments", "Progress"];
const MONTHS = ["AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN"]; // prettier-ignore
const NAV: [IconName, string][] = [
  ["home", "Home"],
  ["planner", "Planner"],
  ["curriculum", "Curriculum"],
  ["assess", "Assessments"],
  ["standards", "Standards"],
  ["folder", "Resources"],
  ["reports", "Reports"],
  ["calendar", "Calendar"], // prettier-ignore
];

export function WorkspaceProto(): ReactNode {
  const [subject, setSubject] = useState(0);
  const [unit, setUnit] = useState(1);
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState(2);
  const [tab, setTab] = useState("Overview");
  const [snavOpen, setSnavOpen] = useState(false);
  const [rpanelOpen, setRpanelOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSnavOpen(false);
        setRpanelOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const s = SUBJECTS[subject];
  const units = s.id === "reading" ? READING_UNITS : genUnits(s.id);
  const weeks = s.id === "reading" ? READING_WEEKS : genWeeks();
  const days =
    s.id === "reading"
      ? READING_DAYS
      : genDays(weeks[week].name, units[unit].name);
  const u = units[unit];
  const w = weeks[week];
  const d = days[day];
  const asmt = unitAssessments(u.name);

  // Active-subject accent cascade — set on the root so the whole tree inherits.
  const accent = {
    "--ac": s.c,
    "--ac-d": s.d,
    "--ac-t": s.t,
    "--ac-s": s.s,
  } as CSSProperties;

  function pickSubject(i: number) {
    setSubject(i);
    setUnit(1);
    setWeek(1);
    setDay(2);
    setTab("Overview");
    if (typeof window !== "undefined" && window.innerWidth <= 1000)
      setSnavOpen(false);
  }
  function pickUnit(i: number) {
    setUnit(i);
    setWeek(1);
    setDay(2);
  }
  function pickWeek(i: number) {
    setWeek(i);
    setDay(2);
  }
  function pickDay(i: number) {
    setDay(i);
    setTab("Overview");
    if (typeof window !== "undefined" && window.innerWidth <= 1240)
      setRpanelOpen(true);
  }

  return (
    <div className={styles.app} style={accent}>
      {/* Left rail */}
      <aside className={styles.side}>
        <div className={styles.elogo}>
          <span className={styles.bk}>
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
            mycurricula<span style={{ color: "var(--honey-600)" }}>.app</span>
          </b>
        </div>
        {NAV.map(([ic, t], i) => (
          <span
            key={t}
            className={`${styles.enav} ${i === 2 ? styles.enavOn : ""}`}
          >
            <Icon name={ic} />
            <span className={styles.lbl}>{t}</span>
          </span>
        ))}
        <div className={styles.grow} />
        <span className={styles.enav}>
          <Icon name="settings" />
          <span className={styles.lbl}>Settings</span>
        </span>
        <div className={styles.ediv} />
        <div className={styles.euser}>
          <span className={styles.av}>MH</span>
          <div>
            <div className={styles.nm}>Ms. Harper</div>
            <div className={styles.rl}>Grade 5 · Room 12</div>
          </div>
        </div>
      </aside>

      <div className={styles.wrap}>
        {/* Top bar */}
        <header className={styles.etop}>
          <button
            className={`${styles.topbtn} ${styles.topbtnSubjects}`}
            onClick={() => setSnavOpen(true)}
            aria-label="Show subjects"
          >
            <Icon name="curriculum" />
          </button>
          <div className={styles.eyear}>
            <Icon name="calendar" />
            2024–2025 <span className={styles.g}>School Year</span>
            <Icon name="chD" />
          </div>
          <div className={styles.esearch}>
            <Icon name="search" />
            <input placeholder="Search units, lessons, standards…" />
          </div>
          <button className={styles.etbtn} aria-label="Notifications">
            <Icon name="bell" />
            <span className={styles.bd}>3</span>
          </button>
          <button className={styles.etbtn} aria-label="Help">
            <Icon name="help" />
          </button>
          <div className={styles.euser2}>
            <span className={styles.av}>MH</span>
            <div>
              <div className={styles.nm}>Ms. Harper</div>
              <div className={styles.rl}>Teacher</div>
            </div>
          </div>
        </header>

        <div className={styles.bodyrow}>
          {/* Subjects panel */}
          <aside
            className={`${styles.snav} ${snavOpen ? styles.snavOpen : ""}`}
          >
            <div className={styles.snhead}>
              Subjects <span className={styles.n}>{SUBJECTS.length}</span>
              <button
                className={styles.pclose}
                style={{ marginLeft: 10 }}
                onClick={() => setSnavOpen(false)}
                aria-label="Close subjects panel"
              >
                <Icon name="x" />
              </button>
            </div>
            {SUBJECTS.map((sj, i) => {
              const open = i === subject;
              const svars = {
                "--s-c": sj.c,
                "--s-d": sj.d,
                "--s-t": sj.t,
                "--s-s": sj.s,
              } as CSSProperties;
              return (
                <div key={sj.id}>
                  <button
                    className={`${styles.subj} ${open ? styles.subjOn : ""}`}
                    style={svars}
                    onClick={() => pickSubject(i)}
                  >
                    <span className={styles.si}>
                      <Icon name={sj.icon} />
                    </span>
                    <div>
                      <div className={styles.sn}>{sj.name}</div>
                      <div className={styles.sg}>Grade 5</div>
                    </div>
                    <span className={styles.sc} />
                  </button>
                  {open && (
                    <div className={styles.subwrap}>
                      {units.map((ut, ui) => (
                        <button
                          key={ui}
                          className={`${styles.uitem} ${ui === unit ? styles.uitemOn : ""} ${ut.st === "done" ? styles.uitemDone : ""}`}
                          onClick={() => pickUnit(ui)}
                        >
                          <span className={styles.uc}>
                            {ut.st === "done" && <Icon name="check" sw={3} />}
                          </span>
                          <div>
                            <span className={styles.un}>{ut.n}</span> ·{" "}
                            <span className={styles.ut}>{ut.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </aside>

          {/* Center stack */}
          <main className={styles.center}>
            {/* Year Overview */}
            <div className={styles.ecard}>
              <div className={styles.ech}>
                <span className={styles.ci}>
                  <Icon name="calendar" />
                </span>
                <h3>Year overview — {s.name}</h3>
                <div className={styles.vsel}>
                  <span className={styles.vl}>View:</span> Year{" "}
                  <Icon name="chD" />
                </div>
              </div>
              <div className={styles.months2}>
                {MONTHS.map((m, i) => (
                  <span key={m} className={i === 8 ? styles.on : ""}>
                    {m}
                  </span>
                ))}
              </div>
              <div className={styles.ybars}>
                {units.map((ut, i) => (
                  <div
                    key={i}
                    className={styles.ybar}
                    style={{
                      background: i <= unit ? s.c : s.s,
                      opacity: i <= unit ? 1 : 0.5,
                    }}
                  >
                    {i <= 1 && (
                      <span className={styles.mk} style={{ color: s.c }}>
                        <Icon name={i === 0 ? "check" : "plus"} sw={2.6} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.ulegend}>
                {units.map((ut) => (
                  <div className={styles.uleg} key={ut.n}>
                    <div className={styles.ud}>
                      <span className={styles.d} style={{ background: s.c }} />
                      {ut.n}
                    </div>
                    <div className={styles.un}>{ut.name}</div>
                    <div className={styles.udt}>{ut.dates}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subject Roadmap */}
            <div className={styles.ecard}>
              <div className={styles.ech}>
                <span className={styles.ci}>
                  <Icon name="roadmap" />
                </span>
                <h3>Subject roadmap</h3>
                <div className={styles.vsel}>
                  <span className={styles.vl}>View:</span> Units{" "}
                  <Icon name="chD" />
                </div>
              </div>
              <div className={styles.roadmap}>
                {units.map((ut, i) => (
                  <button
                    key={i}
                    className={`${styles.rcard} ${i === unit ? styles.rcardOn : ""}`}
                    onClick={() => pickUnit(i)}
                  >
                    <div className={styles.rn} style={{ color: s.d }}>
                      {ut.n}
                    </div>
                    <div className={styles.rnm}>{ut.name}</div>
                    <div className={styles.rdt}>{ut.dates}</div>
                    {i === unit && (
                      <div className={styles.arr}>
                        <Icon name="chR" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Week Breakdown */}
            <div className={styles.ecard}>
              <div className={styles.ech}>
                <span className={styles.ci}>
                  <Icon name="grid" />
                </span>
                <h3>
                  Week breakdown — {u.n}: {u.name}
                </h3>
                <div className={styles.vsel}>
                  <span className={styles.vl}>View:</span> Weeks{" "}
                  <Icon name="chD" />
                </div>
              </div>
              <div className={styles.hscroll}>
                {weeks.map((wk, i) => (
                  <button
                    key={i}
                    className={`${styles.wkcard} ${i === week ? styles.wkcardOn : ""}`}
                    onClick={() => pickWeek(i)}
                  >
                    <div className={styles.wn}>{wk.n}</div>
                    <div className={styles.wt}>{wk.name}</div>
                    <div className={styles.wd}>
                      <span className={styles.wdt}>{wk.dates}</span>
                      {wk.st === "done" && (
                        <span style={{ color: "var(--done)" }}>
                          <Icon name="check" sw={3} />
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Lessons */}
            <div className={styles.ecard}>
              <div className={styles.ech}>
                <span className={styles.ci}>
                  <Icon name="calendar" />
                </span>
                <h3>
                  Daily lessons — {w.n}: {w.name}
                </h3>
                <div className={styles.vsel}>
                  <span className={styles.vl}>View:</span> Days{" "}
                  <Icon name="chD" />
                </div>
              </div>
              <div className={styles.hscroll}>
                {days.map((dd, i) => (
                  <button
                    key={i}
                    className={`${styles.daycard} ${i === day ? styles.daycardOn : ""}`}
                    onClick={() => pickDay(i)}
                  >
                    <div className={styles.dh}>{dd.dy.split(",")[0]}</div>
                    <div className={styles.dt2}>{dd.title}</div>
                    {dd.items.map((it) => (
                      <div className={styles.it} key={it}>
                        <Icon name="check" sw={3} />
                        {it}
                      </div>
                    ))}
                    <div className={styles.df}>
                      <span className={styles.min}>45 min</span>
                      <span className={styles.dots}>
                        <Icon name="more" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
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

          {/* Right lesson viewer */}
          <aside
            className={`${styles.rpanel} ${rpanelOpen ? styles.rpanelOpen : ""}`}
          >
            <div className={styles.rback}>
              <button className={styles.b}>
                <Icon name="chL" />
                Back to {w.n}
              </button>
              <div className={styles.rnav}>
                <button aria-label="Previous day">
                  <Icon name="chL" />
                </button>
                <button aria-label="Next day">
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
            <div className={styles.rdate}>{d.dy}</div>
            <div className={styles.rtitle}>{d.title}</div>
            <div className={styles.rbadges}>
              <span className={`${styles.rb} ${styles.p}`}>
                <Icon name={s.icon} />
                {s.name}
              </span>
              <span className={`${styles.rb} ${styles.g}`}>
                <Icon name="clock" />
                45 min
              </span>
              {d.st === "done" ? (
                <span className={`${styles.rb} ${styles.d}`}>
                  <Icon name="check" sw={3} />
                  Completed
                </span>
              ) : (
                <span className={`${styles.rb} ${styles.g}`}>
                  <Icon name="clock" />
                  {d.st === "cur" ? "In progress" : "Upcoming"}
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
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="book" />
                    Lesson overview
                  </h4>
                  <p>{d.overview}</p>
                </div>
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="target" />
                    Learning objectives
                  </h4>
                  {[
                    "Define the focus concept",
                    "Identify it with evidence",
                    "Explain thinking in writing",
                  ].map(
                    (
                      o, // prettier-ignore
                    ) => (
                      <div className={styles.robj} key={o}>
                        <Icon name="check" sw={3} />
                        {o}
                      </div>
                    ),
                  )}
                </div>
                <div className={styles.rsec}>
                  <h4>
                    <Icon name="clipboard" />
                    Unit assessments
                  </h4>
                  <AsmtRows rows={asmt} />
                  <div className={styles.rlink}>Open assessment planner →</div>
                </div>
              </>
            )}
            {tab === "Standards" && (
              <div className={styles.rsec}>
                <h4>
                  <Icon name="standards" />
                  Standards <span className={styles.ccgs}>CCSS</span>
                </h4>
                <div className={styles.rstd}>
                  <div className={styles.code}>RL.5.2</div>
                  <div className={styles.txt}>
                    Determine a theme of a story from details, including how
                    characters respond to challenges.
                  </div>
                </div>
                <div className={styles.rstd}>
                  <div className={styles.code}>RL.5.3</div>
                  <div className={styles.txt}>
                    Compare and contrast two characters, settings, or events,
                    drawing on specific details.
                  </div>
                </div>
                <div className={styles.rlink}>View all standards (2) →</div>
              </div>
            )}
            {tab === "Resources" && (
              <div className={styles.rsec}>
                <h4>
                  <Icon name="folder" />
                  Resources
                </h4>
                {RES.map((r) => (
                  <div className={styles.rres} key={r.t}>
                    <span
                      className={styles.ri}
                      style={{ background: r.bg, color: r.c }}
                    >
                      <Icon name={r.ic} />
                    </span>
                    <div>
                      <div className={styles.rt}>{r.t}</div>
                      <div className={styles.rk}>{r.k}</div>
                    </div>
                  </div>
                ))}
                <div className={styles.rlink}>View all resources (6) →</div>
              </div>
            )}
            {tab === "Assessments" && (
              <div className={styles.rsec}>
                <h4>
                  <Icon name="clipboard" />
                  Unit assessments — {u.n}
                </h4>
                <AsmtRows rows={asmt} />
                <button className={styles.rbtn}>
                  <Icon name="plus" />
                  Add assessment
                </button>
              </div>
            )}
            {tab === "Progress" && (
              <div className={`${styles.rsec} ${styles.rprog}`}>
                <h4>
                  <Icon name="chart" />
                  Class progress
                </h4>
                <div className={styles.bar}>
                  <i style={{ width: "75%" }} />
                </div>
                <div className={styles.pm}>
                  <span>
                    <b>75%</b> on track
                  </span>
                  <span>18 of 24 students</span>
                </div>
                <button className={styles.rbtn}>
                  <Icon name="chart" />
                  View class report
                </button>
              </div>
            )}
          </aside>
        </div>
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

      <div className={styles.protoFlag}>
        Prototype B · Workspace — temporary preview
      </div>
    </div>
  );
}

function AsmtRows({
  rows,
}: {
  rows: { t: string; m: string; st: AsmtStatus; ic: IconName }[];
}): ReactNode {
  return (
    <>
      {rows.map((a) => (
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
    </>
  );
}
