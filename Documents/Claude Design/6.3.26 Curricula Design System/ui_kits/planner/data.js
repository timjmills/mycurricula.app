/* Curricula Planner UI kit — mock data + helpers (plain JS, attached to window).
   Subjects map onto the v1.3 muted subject scale slots; the cascade vars
   (--c bright / --ct tint / --ck ink) are derived from the slot. */

const SUBJECTS = [
  { id: "math",      name: "Math",      slot: 1,  abbr: "Ma" },
  { id: "reading",   name: "Reading",   slot: 10, abbr: "Re" },
  { id: "writing",   name: "Writing",   slot: 2,  abbr: "Wr" },
  { id: "grammar",   name: "Grammar",   slot: 7,  abbr: "Gr" },
  { id: "spelling",  name: "Spelling",  slot: 5,  abbr: "Sp" },
  { id: "ufli",      name: "UFLI",      slot: 3,  abbr: "Uf" },
  { id: "explorers", name: "Explorers", slot: 13, abbr: "Ex" },
  { id: "sel",       name: "SEL",       slot: 9,  abbr: "Se" },
];
const SUBJ = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));

/* cascade custom-properties for a subject id — bright accent + tint + ink */
function sv(id) {
  const s = SUBJ[id];
  const n = s ? s.slot : 9;
  return {
    "--c": `var(--subj-${n}-bright)`,
    "--cs": `var(--subj-${n})`,
    "--ct": `var(--subj-${n}-tint)`,
    "--ck": `var(--subj-${n}-ink)`,
    "--c-border": `var(--subj-${n}-tint)`,
  };
}

const DAYS = [
  { dn: "Mon", dd: "Mar 9" },
  { dn: "Tue", dd: "Mar 10", today: true },
  { dn: "Wed", dd: "Mar 11" },
  { dn: "Thu", dd: "Mar 12" },
  { dn: "Fri", dd: "Mar 13" },
];

/* Weekly schedule: one column per day; each entry is a lesson or event card. */
const WEEK = [
  [ // Mon
    { subject: "math", time: "9:15", title: "Multiply by 2-digit numbers", desc: "Area model → standard algorithm", std: "5.NBT.5", status: "done" },
    { subject: "ufli", time: "10:05", title: "Lesson 98 — Suffix -tion", desc: "Blend, read, dictate", std: "RF.5.3", status: "done" },
    { subject: "reading", time: "11:00", title: "Inferring character traits", desc: "Esperanza Rising, ch. 4", std: "RL.5.3", status: "prog" },
    { subject: "writing", time: "1:15", title: "Personal narrative — drafting", desc: "Lead & small moments", std: "W.5.3", status: "idle" },
    { subject: "sel", time: "2:30", title: "Naming big feelings", desc: "Zones of regulation", std: "", status: "idle" },
  ],
  [ // Tue
    { subject: "math", time: "9:15", title: "Multiply by 2-digit numbers", desc: "Partial products practice", std: "5.NBT.5", status: "prog", modified: true },
    { subject: "spelling", time: "10:05", title: "Unit 22 — Greek roots", desc: "Sort & word study", std: "L.5.4", status: "idle" },
    { subject: "reading", time: "11:00", title: "Inferring character traits", desc: "Evidence in the margin", std: "RL.5.3", status: "idle" },
    { event: true, title: "Library — 1:00 to 1:45" },
    { subject: "grammar", time: "2:30", title: "Coordinating conjunctions", desc: "FANBOYS in compound sentences", std: "L.5.1", status: "idle" },
  ],
  [ // Wed
    { subject: "math", time: "9:15", title: "Estimate products", desc: "Rounding to check reasonableness", std: "5.NBT.5", status: "idle" },
    { subject: "ufli", time: "10:05", title: "Lesson 99 — Suffix -sion", desc: "Blend, read, dictate", std: "RF.5.3", status: "idle" },
    { subject: "explorers", time: "11:00", title: "Early American settlements", desc: "Jamestown & Plymouth", std: "SS.5.2", status: "idle", moved: true },
    { subject: "writing", time: "1:15", title: "Personal narrative — revising", desc: "Show don't tell", std: "W.5.3", status: "idle" },
    { subject: "sel", time: "2:30", title: "Calming strategies", desc: "Belly breathing practice", std: "", status: "idle" },
  ],
  [ // Thu
    { subject: "math", time: "9:15", title: "Multi-digit word problems", desc: "Two-step, money context", std: "5.NBT.5", status: "idle" },
    { subject: "spelling", time: "10:05", title: "Unit 22 — review", desc: "Partner quiz", std: "L.5.4", status: "idle" },
    { subject: "reading", time: "11:00", title: "Theme across the text", desc: "Esperanza Rising, ch. 5", std: "RL.5.2", status: "idle" },
    { subject: "grammar", time: "1:15", title: "Compound sentences", desc: "Combine with conjunctions", std: "L.5.1", status: "idle" },
    { event: true, title: "Early release — 1:30" },
  ],
  [ // Fri
    { subject: "math", time: "9:15", title: "Unit 7 check-in", desc: "Quick quiz + reteach groups", std: "5.NBT.5", status: "idle" },
    { subject: "ufli", time: "10:05", title: "Lesson 100 — review", desc: "Cumulative dictation", std: "RF.5.3", status: "idle" },
    { subject: "reading", time: "11:00", title: "Book clubs", desc: "Discussion roles", std: "SL.5.1", status: "idle" },
    { subject: "writing", time: "1:15", title: "Narrative — publishing", desc: "Author's chair", std: "W.5.3", status: "idle" },
    { subject: "sel", time: "2:30", title: "Friday reflection", desc: "Rose, bud, thorn", std: "", status: "idle" },
  ],
];

/* Year roadmap: units per subject with progress + status */
const YEAR = [
  { subject: "math", done: 8, total: 12, units: [
    { n: "U5", name: "Decimals", sub: "Done · 18 lessons", prog: 100, active: false },
    { n: "U6", name: "Fractions × Fractions", sub: "Done · 16 lessons", prog: 100 },
    { n: "U7", name: "Multi-digit multiplication", sub: "In progress · wk 3 of 4", prog: 62, active: true },
    { n: "U8", name: "Division strategies", sub: "Up next · 15 lessons", prog: 0 },
    { n: "U9", name: "Volume & measurement", sub: "Planned", prog: 0 },
  ]},
  { subject: "reading", done: 9, total: 14, units: [
    { n: "U7", name: "Historical fiction", sub: "Done · 12 lessons", prog: 100 },
    { n: "U8", name: "Inference & theme", sub: "In progress · wk 2 of 3", prog: 55, active: true },
    { n: "U9", name: "Poetry & figurative lang.", sub: "Up next", prog: 0 },
    { n: "U10", name: "Research & nonfiction", sub: "Planned", prog: 0 },
  ]},
  { subject: "writing", done: 5, total: 9, units: [
    { n: "U4", name: "Opinion essay", sub: "Done · 14 lessons", prog: 100 },
    { n: "U5", name: "Personal narrative", sub: "In progress · wk 1 of 3", prog: 30, active: true },
    { n: "U6", name: "Informational report", sub: "Planned", prog: 0 },
  ]},
  { subject: "explorers", done: 4, total: 8, units: [
    { n: "U3", name: "Colonial America", sub: "In progress · wk 2 of 4", prog: 48, active: true },
    { n: "U4", name: "Road to revolution", sub: "Up next", prog: 0 },
    { n: "U5", name: "Westward expansion", sub: "Planned", prog: 0 },
  ]},
];

/* Subject (curriculum) drill-down — Reading Unit 8 */
const UNIT_WEEKS = [
  { n: "Week 1", d: "Launch & character", active: false, lessons: [
    { t: "Meet Esperanza", st: "done" }, { t: "Setting: 1930s Mexico", st: "done" }, { t: "First-chapter notice & note", st: "done" },
  ]},
  { n: "Week 2", d: "Inference & traits", active: true, lessons: [
    { t: "Inferring character traits", st: "prog" }, { t: "Text evidence in the margin", st: "idle" }, { t: "Drawing conclusions", st: "idle" }, { t: "Tracking change over time", st: "idle" },
  ]},
  { n: "Week 3", d: "Theme", active: false, lessons: [
    { t: "Identifying theme", st: "idle" }, { t: "Theme across chapters", st: "idle" }, { t: "Book club discussion", st: "idle" },
  ]},
];

/* Catch-up items */
const CATCHUP = [
  { subject: "explorers", title: "Early American settlements", meta: "Moved from Wed · class field trip", urgent: false },
  { subject: "math", title: "Estimate products", meta: "Skipped Wed · assembly ran long", urgent: true },
  { subject: "writing", title: "Personal narrative — revising", meta: "Behind by 1 lesson", urgent: false },
];

Object.assign(window, { SUBJECTS, SUBJ, sv, DAYS, WEEK, YEAR, UNIT_WEEKS, CATCHUP });
