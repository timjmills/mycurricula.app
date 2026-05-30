// schedule-integration.jsx — Three-pane Schedule integration matching
// the 5.24.26 reference. Daily View (left) | Weekly View (center) |
// Schedule Pane (right). Glass aesthetic across all surfaces.

const S = {
  pageBg: "#F1F4F9",
  ink: "#0B1220", ink2: "#475569", ink3: "#94A3B8",
  line: "#E5E7EB", lineSoft: "#F1F3F8",
  paper: "#fff", glass: "rgba(255,255,255,0.65)",
  // Highlighter subject palette
  math:     { tile: "#E0D8FB", bg: "#E8E2FC", stripe: "#7C5FE8", deep: "#3D1F95", text: "#2A1466" },
  reading:  { tile: "#C5F0CD", bg: "#D2F4D8", stripe: "#3FBA5C", deep: "#0F6D2F", text: "#073D17" },
  writing:  { tile: "#D7C8FA", bg: "#DDCDFB", stripe: "#9072E6", deep: "#3D1F95", text: "#2A1466" },
  grammar:  { tile: "#A8E8DC", bg: "#B8ECE0", stripe: "#21B8A1", deep: "#0A6B5C", text: "#063C33" },
  spelling: { tile: "#FBC4DA", bg: "#FCCFE1", stripe: "#E4488A", deep: "#9D2E58", text: "#5C1633" },
  ufli:     { tile: "#FCD3B0", bg: "#FDDDC0", stripe: "#F09154", deep: "#A04D14", text: "#5C2A09" },
  explorers:{ tile: "#FBE38A", bg: "#FCE8A2", stripe: "#E5B423", deep: "#7A5810", text: "#3D2C08" },
  sel:      { tile: "#CFE7FE", bg: "#DAECFE", stripe: "#3A93E1", deep: "#1E4D80", text: "#0F2A48" },
  // Non-academic neutral
  recess:   { tile: "#E2E8F0", bg: "#EAEEF4", stripe: "#94A3B8", deep: "#475569", text: "#1F2937" },
  lunch:    { tile: "#FEF3C7", bg: "#FEF6D0", stripe: "#F59E0B", deep: "#92400E", text: "#451A03" },
  specials: { tile: "#E0F2FE", bg: "#E9F4FE", stripe: "#0EA5E9", deep: "#0C4A6E", text: "#082F49" },
  dismissal:{ tile: "#E2E8F0", bg: "#EAEEF4", stripe: "#64748B", deep: "#334155", text: "#0F172A" },
};

const Ic = ({ n, s = 16, c = "currentColor" }) => {
  const p = {
    side: <g><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></g>,
    search: <g><circle cx="11" cy="11" r="6"/><path d="M21 21l-4.3-4.3"/></g>,
    bell: <g><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z"/><path d="M10 21a2 2 0 0 0 4 0"/></g>,
    list: <g><path d="M3 6h18M3 12h18M3 18h18"/></g>,
    logout: <g><path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></g>,
    plus: <g><path d="M12 5v14M5 12h14"/></g>,
    chevR: <path d="M9 6l6 6-6 6"/>,
    chevL: <path d="M15 6l-6 6 6 6"/>,
    chevD: <path d="M6 9l6 6 6-6"/>,
    chevU: <path d="M18 15l-6-6-6 6"/>,
    undo: <g><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10H8"/></g>,
    redo: <g><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h7"/></g>,
    settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15H4a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 11 3.6V3a2 2 0 0 1 4 0v.1A1.7 1.7 0 0 0 16 4.6h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 9v0a1.7 1.7 0 0 0 1.4 1H21a2 2 0 0 1 0 4z"/></g>,
    cal: <g><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></g>,
    more: <g><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></g>,
    drag: <g><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>,
    check: <path d="M5 12l4 4 10-10"/>,
    x: <g><path d="M6 6l12 12M18 6L6 18"/></g>,
    clock: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    tasks: <g><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></g>,
    grid: <g><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></g>,
    duplicate: <g><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/></g>,
    eye: <g><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></g>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[n]}</svg>;
};

// Subject monogram tile (rounded square w/ initials)
const Mono = ({ subj, size = 22 }) => {
  const monos = { math:"Ma", reading:"Re", writing:"Wr", grammar:"Gr", spelling:"Sp", ufli:"Uf", explorers:"Ex", sel:"Se",
    recess:"Rc", lunch:"Lu", specials:"Spc", dismissal:"Dm" };
  const c = S[subj] || S.math;
  return (
    <span style={{
      width: size, height: size, borderRadius: 5,
      background: c.stripe, color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.45, fontWeight: 800, lineHeight: 1, letterSpacing: -0.3,
      flex: "0 0 auto",
    }}>{monos[subj] || "—"}</span>
  );
};

// ── Top bar ───────────────────────────────────────────────────────
const TopBar = ({ active = "weekly" }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 14,
    padding: "10px 18px", background: "rgba(255,255,255,0.85)",
    backdropFilter: "saturate(180%) blur(20px)",
    WebkitBackdropFilter: "saturate(180%) blur(20px)",
    borderBottom: `1px solid ${S.line}`,
    flex: "0 0 auto", position: "relative", zIndex: 10,
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 19, fontWeight: 800, color: S.ink, letterSpacing: -0.5 }}>MyCurricula</span>
      <span style={{ fontSize: 12, color: S.ink2, fontWeight: 600 }}>Grade 5</span>
    </div>
    <span style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${S.line}`, color: S.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Ic n="side" s={15} /></span>
    <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[
        { id: "daily",      label: "Daily" },
        { id: "weekly",     label: "Weekly" },
        { id: "yearly",     label: "Yearly" },
        { id: "curriculum", label: "Curriculum" },
        { id: "schedule",   label: "Schedule", soon: true },
      ].map(t => (
        <span key={t.id} style={{
          padding: "6px 14px", borderRadius: 7, fontSize: 13.5, fontWeight: 600,
          background: t.id === active ? S.ink : "transparent",
          color: t.id === active ? "#fff" : (t.soon ? S.ink3 : S.ink),
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>{t.label}{t.soon && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: S.ink3 }}>SOON</span>}</span>
      ))}
    </nav>
    <span style={{ padding: "5px 11px", border: `1px solid ${S.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: S.ink, background: "#fff" }}>Week 12</span>
    <span style={{ fontSize: 12, color: S.ink2 }}>All changes saved</span>
    <span style={{ display: "inline-flex", gap: 6, color: S.ink3 }}>
      <Ic n="undo" s={15} /> <Ic n="redo" s={15} />
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ display: "inline-flex", padding: 2, background: "#fff", border: `1px solid ${S.line}`, borderRadius: 999 }}>
      <span style={{ padding: "4px 14px", borderRadius: 999, background: S.lineSoft, color: S.ink, fontSize: 12, fontWeight: 700 }}>Personal</span>
      <span style={{ padding: "4px 14px", color: S.ink3, fontSize: 12, fontWeight: 600 }}>Master</span>
    </span>
    <span style={{ display: "inline-flex", padding: 2, background: "#fff", border: `1px solid ${S.line}`, borderRadius: 8 }}>
      <span style={{ padding: "4px 12px", borderRadius: 6, background: S.ink, color: "#fff", fontSize: 12, fontWeight: 700 }}>Grid</span>
      <span style={{ padding: "4px 12px", color: S.ink2, fontSize: 12, fontWeight: 600 }}>List</span>
    </span>
    <span style={{ color: S.ink3 }}><Ic n="search" s={17} /></span>
    <span style={{ color: S.ink3 }}><Ic n="list" s={17} /></span>
    <span style={{ position: "relative", color: S.ink3 }}>
      <Ic n="bell" s={17} />
      <span style={{ position: "absolute", top: -3, right: -4, background: "#E4488A", color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>3</span>
    </span>
    <span style={{ width: 30, height: 30, borderRadius: 999, background: "linear-gradient(135deg, #5328AD, #E4488A)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>LH</span>
    <span style={{ color: S.ink3 }}><Ic n="logout" s={17} /></span>
  </div>
);

// Glass surface helper — used by every panel + card
const glass = (tone = "rgba(255,255,255,0.55)") => ({
  background: tone,
  backdropFilter: "saturate(180%) blur(18px)",
  WebkitBackdropFilter: "saturate(180%) blur(18px)",
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 1px 3px rgba(11,18,32,.06), inset 0 1px 0 rgba(255,255,255,.5)",
});

// Subject-tinted glass card
const subjGlass = (subj) => {
  const c = S[subj];
  return {
    background: `linear-gradient(180deg, ${c.bg}cc 0%, ${c.bg}99 100%)`,
    backdropFilter: "saturate(180%) blur(16px)",
    WebkitBackdropFilter: "saturate(180%) blur(16px)",
    border: `1px solid ${c.stripe}33`,
    boxShadow: `0 1px 3px rgba(11,18,32,.06), inset 0 1px 0 rgba(255,255,255,.6)`,
  };
};

// ── Left icon rail ─────────────────────────────────────────────────
const LeftRail = () => (
  <div style={{
    width: 50, flex: "0 0 auto",
    ...glass("rgba(255,255,255,0.5)"),
    borderRight: `1px solid ${S.line}`, border: "none",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "14px 0", gap: 16,
  }}>
    {[
      { n: "cal", label: "Cal" },
      { n: "clock", label: "soon" },
      { n: "tasks", label: "" },
      { n: "grid", label: "soon" },
      { n: "more", label: "soon" },
    ].map((r, i) => (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: i === 0 ? S.math.tile : "transparent",
          color: i === 0 ? S.math.deep : S.ink3,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}><Ic n={r.n} s={16} /></span>
        {r.label && <span style={{ fontSize: 8, color: S.ink3, fontWeight: 600, letterSpacing: 0.3 }}>{r.label}</span>}
      </div>
    ))}
  </div>
);

// ── DAILY VIEW (left pane) ─────────────────────────────────────────
const DailyPane = () => {
  const days = [
    { day: "SUN", num: 18, active: true },
    { day: "MON", num: 19 },
    { day: "TUE", num: 20 },
    { day: "WED", num: 21 },
    { day: "THU", num: 22 },
    { day: "FRI", num: 23 },
    { day: "SAT", num: 24 },
  ];
  const blocks = [
    { time: "8:10–9:10",  subj: "math",     title: "Equivalent fractions warm-up" },
    { time: "9:10–10:00", subj: "reading",  title: "Wonder, chs 14–17 — point of view" },
    { time: "10:00–11:10",subj: "writing",  title: "Lead sentences — three rewrites" },
    { time: "11:10–11:40",subj: "grammar",  title: "Past, present, future review" },
    { time: "1:40–2:00",  subj: "spelling", title: "List 12 introduction — Greek roots" },
    { time: "2:00–2:40",  subj: "ufli",     title: "Lesson 84 — closed syllables" },
  ];
  return (
    <div style={{
      width: 290, flex: "0 0 auto",
      ...glass("rgba(255,255,255,0.5)"),
      borderRight: `1px solid ${S.line}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 16px 8px", borderBottom: `1px solid ${S.line}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: S.ink, letterSpacing: -0.2 }}>Daily View</div>
      </div>
      <div style={{ overflow: "auto", flex: 1, padding: 12 }}>
        <div style={{ ...glass("rgba(255,255,255,0.7)"), borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: S.ink3, letterSpacing: 0.7, marginBottom: 6 }}>WEEK 12</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {days.map((d, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "3px 0" }}>
                <span style={{ fontSize: 9, color: S.ink3, fontWeight: 700 }}>{d.day}</span>
                <span style={{
                  width: 24, height: 24, borderRadius: 999,
                  background: d.active ? S.ink : "transparent",
                  color: d.active ? "#fff" : S.ink,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                }}>{d.num}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: S.ink, letterSpacing: -0.3 }}>Sunday</span>
            <span style={{ fontSize: 11, color: S.ink3 }}><strong style={{ color: S.ink, fontWeight: 700 }}>0</strong> of 6 lessons</span>
          </div>
        </div>

        <div style={{ fontSize: 10, color: S.ink3, fontWeight: 800, letterSpacing: 0.7, padding: "0 4px 6px" }}>SCHEDULE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {blocks.map((b, i) => {
            const c = S[b.subj];
            return (
              <div key={i} style={{ ...subjGlass(b.subj), borderRadius: 9, padding: "8px 10px", borderLeft: `3px solid ${c.stripe}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: c.deep, letterSpacing: 0.3 }}>{b.time}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <Mono subj={b.subj} size={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: c.deep, letterSpacing: 0.4 }}>{b.subj.toUpperCase()}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: S.ink, marginTop: 1, lineHeight: 1.3 }}>{b.title}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button style={{
          marginTop: 8, width: "100%", padding: "8px 10px",
          background: "transparent", border: `1px dashed ${S.ink3}`,
          borderRadius: 8, color: S.ink2, fontSize: 12, fontWeight: 600,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          cursor: "pointer",
        }}><Ic n="plus" s={12} /> Add a time block</button>

        <div style={{ fontSize: 10, color: S.ink3, fontWeight: 800, letterSpacing: 0.7, padding: "16px 4px 6px" }}>TODAY'S EVENTS</div>
        <button style={{
          width: "100%", padding: "8px 10px",
          background: "rgba(255,255,255,0.6)", border: `1px solid ${S.line}`,
          borderRadius: 8, color: S.ink2, fontSize: 12, fontWeight: 600,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          cursor: "pointer",
        }}><Ic n="plus" s={12} /> Add an event</button>
      </div>
    </div>
  );
};

// ── Minimized weekly row (Minimize all / list view) ────────────────
const WeeklyMinimized = ({ days }) => {
  // Render each day as a vertical column with a single-line list of
  // its lessons (subject monogram + time + title) instead of the grid.
  const week = [
    { day: 0, lessons: [
      ["math","8:10","Equivalent fractions warm-up"],
      ["reading","10:00","Wonder, chs 14–17"],
      ["writing","12:20","Lead sentences — three rewrites"],
      ["grammar","1:10","Past, present, future review"],
      ["spelling","1:40","List 12 — Greek roots"],
      ["ufli","2:00","Lesson 84 — closed syllables"],
    ]},
    { day: 1, lessons: [
      ["math","8:10","Fractions as division — bake sale"],
      ["reading","10:00","Book club — Via's chapters"],
      ["ufli","2:00","Lesson 85 — open syllables"],
    ]},
    { day: 2, lessons: [
      ["math","8:10","Multiplying a fraction by a…"],
      ["reading","10:00","Literacy Centers (90 min)"],
      ["writing","12:20","Drafting day — narrative middle"],
      ["grammar","1:10","Inappropriate shifts in tense"],
      ["spelling","1:40","Word sort + sentence frames"],
      ["ufli","2:00","Lesson 86 — vowel teams"],
    ]},
    { day: 3, lessons: [
      ["math","8:10","Mid-unit check — fractions"],
      ["reading","10:00","Theme mapping"],
      ["writing","12:20","Peer feedback — show vs tell"],
      ["ufli","2:00","Lesson 87 — r-controlled"],
    ]},
    { day: 4, lessons: [
      ["math","8:10","Re-engagement: error analysis"],
      ["reading","10:00","Independent reading + conferences"],
      ["grammar","1:10","Quick check — verb tense"],
      ["spelling","1:40","Friday quiz"],
      ["ufli","2:00","Lesson 88 — diphthongs"],
    ]},
    { day: 5, lessons: [
      ["math","8:10","Fraction word problems challenge"],
      ["reading","10:00","Text-to-self connections"],
      ["writing","12:20","Revise & strengthen endings"],
      ["grammar","1:10","Verb tense challenge"],
      ["spelling","1:40","Review + quiz corrections"],
      ["ufli","2:00","UFLI check-in"],
    ]},
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 4 }}>
      {days.map((d, i) => {
        const dayLessons = week[i].lessons;
        return (
          <div key={i} style={{
            ...glass("rgba(255,255,255,0.55)"),
            borderRadius: 12, padding: "10px 10px 8px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: S.ink, letterSpacing: -0.1 }}>{d.full}</span>
              <span style={{ fontSize: 10, color: S.ink3, fontWeight: 600 }}>{dayLessons.length}</span>
            </div>
            {dayLessons.map(([subj, time, title], k) => {
              const c = S[subj];
              return (
                <div key={k} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "5px 7px", borderRadius: 6,
                  background: `${c.tile}88`,
                  borderLeft: `2px solid ${c.stripe}`,
                }}>
                  <Mono subj={subj} size={14} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: c.deep, letterSpacing: 0.3, width: 30 }}>{time}</span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: c.text, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                </div>
              );
            })}
            <button style={{
              marginTop: 3, padding: "3px 0", background: "transparent", border: 0,
              color: S.ink3, fontSize: 10, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
            }}><Ic n="plus" s={10} /> Add</button>
          </div>
        );
      })}
    </div>
  );
};

// ── WEEKLY VIEW (center) ───────────────────────────────────────────
const WeeklyPane = ({ organize = "subject", showNonAcademic = false, minimized = false }) => {
  const days = [
    { id: 0, full: "Sunday",    short: "Sun" },
    { id: 1, full: "Monday",    short: "Mon" },
    { id: 2, full: "Tuesday",   short: "Tue" },
    { id: 3, full: "Wednesday", short: "Wed" },
    { id: 4, full: "Thursday",  short: "Thu" },
    { id: 5, full: "Friday",    short: "Fri" },
  ];
  const subjects = [
    { id: "math", full: "Math", times: "8:10–9:10",
      lessons: ["Equivalent fractions warm-up","Fractions as division — bake sale problem","Multiplying a fraction by a…","Mid-unit check — fractions","Re-engagement: error analysis","Fraction word problems challenge"] },
    { id: "reading", full: "Reading", times: "10:00–11:00",
      lessons: ["Wonder, chs 14–17 — point of view","Book club — Via's chapters","Literacy Centers (90 min)","Theme mapping","Independent reading + conferences","Text-to-self connections"] },
    { id: "writing", full: "Writing", times: "12:20–1:10",
      lessons: ["Lead sentences — three rewrites","", "Drafting day — narrative middle","Peer feedback — show vs tell","", "Revise & strengthen endings"] },
    { id: "grammar", full: "Grammar", times: "1:10–1:40",
      lessons: ["Past, present, future review","","Inappropriate shifts in tense","","Quick check — verb tense","Verb tense challenge"] },
    { id: "spelling", full: "Spelling", times: "1:40–2:00",
      lessons: ["List 12 introduction — Greek roots","","Word sort + sentence frames","","Friday quiz","Review + quiz corrections"] },
    { id: "ufli", full: "UFLI", times: "2:00–2:40",
      lessons: ["Lesson 84 — closed syllables","Lesson 85 — open syllables","Lesson 86 — vowel teams","Lesson 87 — r-controlled","Lesson 88 — diphthongs","UFLI check-in"] },
  ];
  const nonAcademic = [
    { id: "recess",    full: "Recess",    times: "11:40–12:20", label: "Recess" },
    { id: "lunch",     full: "Lunch",     times: "11:40–12:20", label: "Lunch" },
    { id: "specials",  full: "Specials",  times: "2:40–3:20",   labels: ["PE","Art","Music","Library","PE","STEAM"] },
    { id: "dismissal", full: "Dismissal", times: "3:20–3:30",   label: "Dismissal" },
  ];
  return (
    <div style={{
      flex: 1, minWidth: 0,
      ...glass("rgba(255,255,255,0.4)"),
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 22px 8px", borderBottom: `1px solid ${S.line}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: S.ink, letterSpacing: -0.2 }}>Weekly View</div>
      </div>
      {/* sub-toolbar with organize toggle */}
      <div style={{ padding: "10px 22px", borderBottom: `1px solid ${S.line}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ padding: "5px 12px", border: `1px solid ${S.line}`, borderRadius: 7, background: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, color: S.ink, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Ic n="grid" s={12} /> Expand all
        </span>
        <span style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, color: S.ink2 }}>Minimize all</span>
        <span style={{ padding: "5px 12px", border: `1px solid ${S.line}`, borderRadius: 7, background: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, color: S.ink, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Ic n="duplicate" s={12} /> Duplicate week
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", padding: 2, background: "rgba(255,255,255,0.7)", border: `1px solid ${S.line}`, borderRadius: 999 }}>
          <span style={{ padding: "4px 12px", borderRadius: 999, background: organize === "subject" ? S.ink : "transparent", color: organize === "subject" ? "#fff" : S.ink2, fontSize: 11.5, fontWeight: 700 }}>By subject</span>
          <span style={{ padding: "4px 12px", borderRadius: 999, background: organize === "schedule" ? S.ink : "transparent", color: organize === "schedule" ? "#fff" : S.ink2, fontSize: 11.5, fontWeight: 700 }}>By schedule</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: S.ink2, fontWeight: 600 }}>
          <span style={{
            width: 28, height: 16, borderRadius: 999,
            background: showNonAcademic ? S.math.stripe : S.line,
            position: "relative",
          }}>
            <span style={{
              position: "absolute", top: 2, left: showNonAcademic ? 14 : 2,
              width: 12, height: 12, borderRadius: 999, background: "#fff",
              transition: "left .15s",
            }} />
          </span>
          Include non-academic
        </span>
      </div>

      <div style={{ overflow: "auto", flex: 1, padding: 12 }}>
        {minimized ? (
          <WeeklyMinimized days={days} />
        ) : (
          <>
        {/* Day-header row */}
        <div style={{ display: "grid", gridTemplateColumns: "70px repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
          <div />
          {days.map((d, i) => (
            <div key={i} style={{ padding: "0 8px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: S.ink, letterSpacing: -0.2 }}>{d.full}</span>
              <span style={{ fontSize: 11, color: S.ink3, marginLeft: 5 }}>{d.short}</span>
            </div>
          ))}
        </div>

        {/* Subject rows */}
        {subjects.map(s => (
          <SubjectRow key={s.id} subj={s} days={days} />
        ))}

        {/* Non-academic */}
        {showNonAcademic ? (
          nonAcademic.map(n => (
            <NonAcademicRow key={n.id} n={n} days={days} />
          ))
        ) : (
          <div style={{
            ...glass("rgba(255,255,255,0.5)"),
            borderRadius: 10, padding: "10px 14px", marginTop: 8,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ display: "flex", gap: 4 }}>
              {nonAcademic.map((n, i) => <Mono key={i} subj={n.id} size={18} />)}
            </span>
            <span style={{ fontSize: 12, color: S.ink2 }}>
              <strong style={{ color: S.ink, fontWeight: 700 }}>4 non-academic blocks</strong> per day · Recess · Lunch · Specials · Dismissal
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ padding: "4px 12px", borderRadius: 7, background: "rgba(255,255,255,0.7)", border: `1px solid ${S.line}`, fontSize: 11, fontWeight: 700, color: S.ink, cursor: "pointer" }}>Show</span>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};

const SubjectRow = ({ subj, days }) => {
  const c = S[subj.id];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 6 }}>
        <Mono subj={subj.id} size={22} />
        <span style={{ fontSize: 12, fontWeight: 700, color: S.ink }}>{subj.full}</span>
      </div>
      {days.map((d, i) => {
        const title = subj.lessons[i];
        if (!title) return (
          <div key={i} style={{
            ...glass("rgba(255,255,255,0.3)"),
            border: `1px dashed ${S.line}`, borderRadius: 10,
            minHeight: 92, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            color: S.ink3, fontSize: 11, fontWeight: 500, gap: 3,
          }}>
            <span>Drag a lesson here or click</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>+</span>
          </div>
        );
        return (
          <div key={i} style={{
            ...subjGlass(subj.id),
            borderLeft: `3px solid ${c.stripe}`,
            borderRadius: 10, padding: "8px 10px", minHeight: 92,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Mono subj={subj.id} size={16} />
              <span style={{ fontSize: 9.5, fontWeight: 800, color: c.deep, letterSpacing: 0.4 }}>{subj.times}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: c.deep, opacity: 0.5 }}><Ic n="more" s={11} /></span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: c.text, lineHeight: 1.25, textWrap: "pretty" }}>{title}</div>
          </div>
        );
      })}
    </div>
  );
};

const NonAcademicRow = ({ n, days }) => {
  const c = S[n.id];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 6 }}>
        <Mono subj={n.id} size={22} />
        <span style={{ fontSize: 12, fontWeight: 700, color: S.ink2 }}>{n.full}</span>
      </div>
      {days.map((d, i) => (
        <div key={i} style={{
          ...subjGlass(n.id),
          borderLeft: `3px solid ${c.stripe}`,
          borderRadius: 8, padding: "6px 9px", minHeight: 44,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.deep, letterSpacing: 0.3 }}>{n.times}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{n.labels ? n.labels[i] : n.label}</span>
        </div>
      ))}
    </div>
  );
};

// ── SCHEDULE PANE (right) ──────────────────────────────────────────
const SchedulePane = ({ tab = "bell" }) => {
  const tabs = [
    { id: "bell",     label: "Bell Schedule" },
    { id: "daily",    label: "Daily Schedule" },
    { id: "events",   label: "Events" },
    { id: "specials", label: "Specials" },
    { id: "cover",    label: "Sub plans" },
  ];
  return (
    <div style={{
      width: 320, flex: "0 0 auto",
      ...glass("rgba(255,255,255,0.55)"),
      borderLeft: `1px solid ${S.line}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${S.line}` }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: S.ink, letterSpacing: -0.2 }}>Schedule Pane</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: S.ink3 }}><Ic n="list" s={14} /></span>
      </div>
      <div style={{ padding: "0 12px", display: "flex", gap: 2, borderBottom: `1px solid ${S.line}`, overflow: "auto" }}>
        {tabs.map(t => (
          <span key={t.id} style={{
            padding: "8px 10px", fontSize: 11.5, fontWeight: 700,
            color: t.id === tab ? S.ink : S.ink3,
            borderBottom: t.id === tab ? `2px solid ${S.ink}` : "2px solid transparent",
            marginBottom: -1, whiteSpace: "nowrap",
          }}>{t.label}</span>
        ))}
      </div>
      <div style={{ overflow: "auto", flex: 1, padding: 12 }}>
        {tab === "bell"     && <BellScheduleContent />}
        {tab === "daily"    && <DailyScheduleContent />}
        {tab === "events"   && <EventsContent />}
        {tab === "specials" && <SpecialsContent />}
        {tab === "cover"    && <SubPlansContent />}
        <FooterActions />
      </div>
    </div>
  );
};

const FooterActions = () => (
  <>
    <button style={{
      width: "100%", padding: "9px 10px", marginTop: 10,
      background: "rgba(255,255,255,0.7)", border: `1px solid ${S.line}`,
      borderRadius: 8, color: S.ink, fontSize: 12, fontWeight: 700,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      cursor: "pointer",
    }}><Ic n="plus" s={12} /> Add</button>
    <button style={{
      width: "100%", padding: "8px 10px", marginTop: 6,
      background: "transparent", border: 0,
      color: S.ink2, fontSize: 11.5, fontWeight: 600,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
      cursor: "pointer",
    }}><Ic n="settings" s={12} /> Edit full schedule in Settings</button>
  </>
);

const BellScheduleContent = () => {
  const blocks = [
    { time: "8:10 – 9:10",   subj: "math",     title: "Equivalent fractions warm-up" },
    { time: "9:10 – 10:00",  subj: "reading",  title: "Wonder, chs 14–17 — point of view" },
    { time: "10:00 – 11:10", subj: "writing",  title: "Lead sentences — three rewrites" },
    { time: "11:10 – 11:40", subj: "grammar",  title: "Past, present, future review" },
    { time: "11:40 – 12:20", subj: "lunch",    title: "Lunch" },
    { time: "12:20 – 1:10",  subj: "writing",  title: "Drafting day — narrative middle" },
    { time: "1:10 – 1:40",   subj: "grammar",  title: "Quick check — verb tense" },
    { time: "1:40 – 2:00",   subj: "spelling", title: "List 12 introduction — Greek roots" },
    { time: "2:00 – 2:40",   subj: "ufli",     title: "Lesson 84 — closed syllables" },
    { time: "2:40 – 3:20",   subj: "specials", title: "PE" },
    { time: "3:20 – 3:30",   subj: "dismissal",title: "Dismissal" },
  ];
  return (
    <>
      <PaneDate />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {blocks.map((b, i) => <BlockRow key={i} block={b} />)}
      </div>
    </>
  );
};

const DailyScheduleContent = () => {
  const lessons = [
    { time: "8:10 – 9:10",  subj: "math",     title: "Equivalent fractions warm-up", status: "todo" },
    { time: "9:10 – 10:00", subj: "reading",  title: "Wonder, chs 14–17 — point of view", status: "todo" },
    { time: "10:00 – 11:10", subj: "writing", title: "Lead sentences — three rewrites", status: "todo" },
    { time: "11:10 – 11:40", subj: "grammar", title: "Past, present, future review", status: "todo" },
    { time: "12:20 – 1:10", subj: "writing",  title: "Drafting day — narrative middle", status: "todo" },
    { time: "1:10 – 1:40",  subj: "grammar",  title: "Quick check — verb tense", status: "todo" },
    { time: "1:40 – 2:00",  subj: "spelling", title: "List 12 introduction — Greek roots", status: "todo" },
    { time: "2:00 – 2:40",  subj: "ufli",     title: "Lesson 84 — closed syllables", status: "todo" },
  ];
  return (
    <>
      <PaneDate sub="8 lessons · 0 done" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {lessons.map((l, i) => <BlockRow key={i} block={l} withCheck />)}
      </div>
    </>
  );
};

const EventsContent = () => {
  const events = [
    { date: "Mon · May 19", icon: "🎉", title: "Birthday: Tariq",        time: "10:00", scope: "PERSONAL" },
    { date: "Tue · May 20", icon: "🚨", title: "Fire drill",              time: "9:45",  scope: "SCHOOL", urgent: true },
    { date: "Wed · May 21", icon: "🎙", title: "Guest speaker — Maths Olympiad", time: "1:00", scope: "GRADE" },
    { date: "Wed · May 21", icon: "📚", title: "Library closed (inventory)", time: "all day", scope: "SCHOOL" },
    { date: "Thu · May 22", icon: "🎓", title: "PD early dismissal",      time: "1:30", scope: "SCHOOL", urgent: true },
    { date: "Thu · May 22", icon: "🎂", title: "Class party — Aya",        time: "2:30", scope: "PERSONAL" },
    { date: "Fri · May 23", icon: "✈", title: "Field trip — Aquarium",   time: "all day", scope: "GRADE" },
  ];
  return (
    <>
      <PaneDate label="This week's events" sub="7 across 4 days" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {events.map((e, i) => (
          <div key={i} style={{
            ...glass("rgba(255,255,255,0.75)"),
            borderRadius: 8, padding: "8px 10px",
            borderLeft: `3px solid ${e.urgent ? "#DC2626" : S.ink3}`,
            display: "flex", alignItems: "center", gap: 9,
          }}>
            <span style={{ fontSize: 20, lineHeight: 1, flex: "0 0 auto" }}>{e.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: S.ink3, letterSpacing: 0.5, display: "flex", gap: 6, alignItems: "center" }}>
                <span>{e.date}</span>
                <span>·</span>
                <span style={{
                  padding: "1px 6px", borderRadius: 999,
                  background: e.scope === "PERSONAL" ? "#FCE7F3" : (e.scope === "SCHOOL" ? "#E0F2FE" : "#DCFCE7"),
                  color: e.scope === "PERSONAL" ? "#9D2D5E" : (e.scope === "SCHOOL" ? "#0C4A6E" : "#166534"),
                }}>{e.scope}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: S.ink, marginTop: 1, lineHeight: 1.3 }}>{e.title}</div>
              <div style={{ fontSize: 10.5, color: S.ink2, marginTop: 1 }}>{e.time}</div>
            </div>
            {e.urgent && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", padding: "2px 7px", borderRadius: 4, letterSpacing: 0.4 }}>!</span>}
          </div>
        ))}
      </div>
    </>
  );
};

const SpecialsContent = () => {
  const rotation = [
    { day: "Mon", special: "Art",     teacher: "Ms. Reyna",   room: "Art 1",   time: "2:40 – 3:20" },
    { day: "Tue", special: "Music",   teacher: "Mr. Issa",    room: "Music",   time: "2:40 – 3:20" },
    { day: "Wed", special: "Library", teacher: "Mrs. Salem",  room: "Library", time: "2:40 – 3:20" },
    { day: "Thu", special: "PE",      teacher: "Coach Adam",  room: "Gym",     time: "2:40 – 3:20", today: true },
    { day: "Fri", special: "STEAM",   teacher: "Mr. Karim",   room: "Lab 2",   time: "2:40 – 3:20" },
  ];
  return (
    <>
      <PaneDate label="Specials Rotation" sub="Week 12 · daily 2:40 – 3:20" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rotation.map((r, i) => {
          const tone = r.special === "Art" ? "spelling" : r.special === "Music" ? "writing" : r.special === "Library" ? "explorers" : r.special === "PE" ? "ufli" : "grammar";
          const c = S[tone];
          return (
            <div key={i} style={{
              ...subjGlass(tone),
              borderRadius: 8, padding: "8px 10px",
              borderLeft: `3px solid ${c.stripe}`,
              display: "flex", alignItems: "center", gap: 10,
              outline: r.today ? `2px solid ${c.stripe}` : "none",
            }}>
              <span style={{
                width: 30, height: 30, borderRadius: 6,
                background: c.stripe, color: "#fff",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
              }}>{r.day.toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: c.text }}>{r.special}</span>
                  {r.today && <span style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: c.stripe, color: "#fff", letterSpacing: 0.4 }}>TODAY</span>}
                </div>
                <div style={{ fontSize: 10.5, color: c.deep, fontWeight: 600 }}>{r.teacher} · {r.room}</div>
                <div style={{ fontSize: 10, color: S.ink3 }}>{r.time}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, padding: "8px 10px", ...glass("rgba(255,255,255,0.7)"), borderRadius: 8, fontSize: 11, color: S.ink2, lineHeight: 1.5 }}>
        <strong style={{ color: S.ink, fontWeight: 700 }}>Note:</strong> rotation is shared school-wide. Sub plan auto-includes the day's special.
      </div>
    </>
  );
};

const SubPlansContent = () => {
  const days = [
    { day: "Sun · May 18", state: "current", sub: null,           ready: true },
    { day: "Mon · May 19", state: "ready",   sub: "Mrs. Khalifa", ready: true },
    { day: "Tue · May 20", state: "ready",   sub: null,           ready: false },
    { day: "Wed · May 21", state: "future",  sub: null,           ready: false },
    { day: "Thu · May 22", state: "future",  sub: null,           ready: false },
    { day: "Fri · May 23", state: "future",  sub: null,           ready: false },
  ];
  return (
    <>
      <PaneDate label="Sub plans" sub="Pre-filled coverage notes per day" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            ...glass("rgba(255,255,255,0.7)"),
            borderRadius: 8, padding: "9px 10px",
            display: "flex", alignItems: "center", gap: 10,
            opacity: d.state === "future" ? 0.65 : 1,
          }}>
            <span style={{
              width: 8, height: 36, borderRadius: 4,
              background: d.ready ? "#22C55E" : (d.state === "future" ? S.ink3 : "#F59E0B"),
              flex: "0 0 auto",
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: S.ink, letterSpacing: -0.1 }}>{d.day}</div>
              <div style={{ fontSize: 10.5, color: S.ink2, marginTop: 1 }}>
                {d.sub ? `Sub: ${d.sub}` : (d.state === "future" ? "Not needed" : "No sub assigned")}
              </div>
            </div>
            <span style={{
              padding: "3px 9px", borderRadius: 999,
              fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
              background: d.ready ? "#DCFCE7" : (d.state === "future" ? "#F1F5F9" : "#FEF3C7"),
              color: d.ready ? "#166534" : (d.state === "future" ? S.ink3 : "#92400E"),
            }}>{d.ready ? "READY" : (d.state === "future" ? "OPEN" : "DRAFT")}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: "10px 12px", ...glass("rgba(255,255,255,0.75)"), borderRadius: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: S.ink, letterSpacing: 0.4, marginBottom: 5 }}>QUICK SUB PACKET</div>
        <div style={{ fontSize: 11, color: S.ink2, lineHeight: 1.5 }}>One-click PDF: today's schedule + lesson summaries + behavior plan + class roster + emergency contacts.</div>
        <button style={{
          width: "100%", marginTop: 7, padding: "6px 10px",
          background: S.ink, color: "#fff", border: 0, borderRadius: 7,
          fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>Generate sub packet</button>
      </div>
    </>
  );
};

const PaneDate = ({ label = "Sunday, May 18", sub = "WEEK 12" }) => (
  <div style={{ marginBottom: 9 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: S.ink, letterSpacing: -0.2 }}>{label}</span>
      <span style={{ color: S.ink3 }}><Ic n="cal" s={13} /></span>
    </div>
    <div style={{ fontSize: 9.5, color: S.ink3, fontWeight: 800, letterSpacing: 0.7, marginTop: 2 }}>{sub}</div>
  </div>
);

const BlockRow = ({ block, withCheck }) => {
  const c = S[block.subj];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 9px",
      ...subjGlass(block.subj),
      borderRadius: 8, borderLeft: `3px solid ${c.stripe}`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: c.deep, letterSpacing: 0.3, width: 70, flex: "0 0 auto" }}>{block.time}</span>
      {withCheck && (
        <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${c.stripe}`, background: "#fff", flex: "0 0 auto" }} />
      )}
      <Mono subj={block.subj} size={16} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 8.5, fontWeight: 800, color: c.deep, letterSpacing: 0.4 }}>{block.subj.toUpperCase()}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: c.text, lineHeight: 1.25 }}>{block.title}</div>
      </div>
    </div>
  );
};

// ── LESSON DETAIL pane (Math 8:10–9:10 expanded) ────────────────────
const LessonDetailPane = () => (
  <div style={{
    width: 340, flex: "0 0 auto",
    ...glass("rgba(255,255,255,0.65)"),
    borderRight: `1px solid ${S.line}`,
    display: "flex", flexDirection: "column", overflow: "hidden",
  }}>
    <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${S.line}`, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: S.ink2, letterSpacing: -0.1 }}>Math <span style={{ color: S.ink3, fontWeight: 500, marginLeft: 4 }}>8:10–9:10</span></span>
      <div style={{ flex: 1 }} />
      <span style={{ color: S.ink3 }}><Ic n="drag" s={12} /></span>
      <span style={{ color: S.ink3 }}><Ic n="more" s={13} /></span>
    </div>

    <div style={{ overflow: "auto", flex: 1, padding: "12px 14px 18px" }}>
      {/* Lesson header card */}
      <div style={{ ...subjGlass("math"), borderRadius: 10, padding: "12px 13px", borderLeft: `3px solid ${S.math.stripe}`, marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: S.math.deep, letterSpacing: 0.5, marginBottom: 3 }}>MATH</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: S.math.text, letterSpacing: -0.2, lineHeight: 1.3 }}>Equivalent fractions warm-up</div>
        <div style={{ marginTop: 9, display: "inline-flex", alignItems: "flex-start", gap: 7 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: S.math.stripe, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.4, flex: "0 0 auto", marginTop: 1 }}>I CAN</span>
          <span style={{ fontSize: 11.5, color: S.math.text, lineHeight: 1.45, fontWeight: 500, textWrap: "pretty" }}>find three equivalent fractions for a given fraction.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: S.ink2 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, border: `1.5px solid ${S.ink3}` }} />
            Mark done
          </span>
          <span style={{ fontSize: 10.5, color: S.ink2, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${S.ink3}` }} />
            Add status
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: S.ink2, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Ic n="more" s={10} /> Lesson notes
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 10.5, color: S.ink2, fontWeight: 600 }}>
        <span>Expand all</span><span style={{ color: S.ink3 }}>|</span><span>Collapse all</span>
      </div>

      {/* Numbered teaching sections */}
      {[
        { n: 1, label: "Standards", tone: "#22C55E", sub: "5.NF.B.3 · 5.NF.A.1", chips: true, open: true },
        { n: 2, label: "Focus Lesson — I Do",       tone: "#FB923C", sub: "Model the concept and solve examples together." },
        { n: 3, label: "Guided Instruction — We Do",tone: "#A78BFA", sub: "Practice together with teacher support." },
        { n: 4, label: "Independent Practice — You Do", tone: "#38BDF8", sub: "Students practice on their own." },
        { n: 5, label: "Closure — Reflect & Share", tone: "#F472B6", sub: "Exit ticket and discussion." },
      ].map((s, i) => (
        <div key={i} style={{
          ...glass("rgba(255,255,255,0.65)"),
          borderRadius: 9, padding: "9px 11px", marginBottom: 6,
          borderLeft: `3px solid ${s.tone}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5,
              background: s.tone, color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800,
            }}>{s.n}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: S.ink, flex: 1, letterSpacing: -0.1 }}>{s.label}</span>
            <span style={{ color: S.ink3 }}><Ic n={s.open ? "chevD" : "chevR"} s={11} /></span>
          </div>
          {s.open && s.chips && (
            <div style={{ marginTop: 7 }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1E3A8A", background: "#DBEAFE", padding: "2px 7px", borderRadius: 4, fontFamily: "ui-monospace, monospace" }}>5.NF.B.3</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1E3A8A", background: "#DBEAFE", padding: "2px 7px", borderRadius: 4, fontFamily: "ui-monospace, monospace" }}>5.NF.A.1</span>
              </div>
              <div style={{
                background: "#fff", border: `1px solid ${S.line}`,
                borderRadius: 6, padding: "7px 9px", fontSize: 11, color: S.ink3, fontStyle: "italic",
              }}>Write lesson plan for this section…</div>
              {/* Resources */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: S.ink3, letterSpacing: 0.5 }}>RESOURCES</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: S.ink3 }}><Ic n="more" s={11} /></span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { lbl: "Fraction Basics",    tone: "reading" },
                    { lbl: "What is a Fraction?", tone: "explorers" },
                    { lbl: "Fractions Overview",  tone: "reading" },
                    { lbl: "Khan Academy",        tone: "explorers" },
                  ].map((r, j) => {
                    const c = S[r.tone];
                    return (
                      <div key={j} style={{
                        ...subjGlass(r.tone), borderRadius: 7, padding: "8px 9px",
                        borderLeft: `2px solid ${c.stripe}`,
                        fontSize: 10.5, fontWeight: 700, color: c.text,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: c.stripe }} />
                        {r.lbl}
                      </div>
                    );
                  })}
                </div>
                <button style={{
                  width: "100%", padding: "6px 9px", marginTop: 6,
                  background: "transparent", border: `1px dashed ${S.ink3}`,
                  borderRadius: 7, color: S.ink2, fontSize: 10.5, fontWeight: 600,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer",
                }}><Ic n="plus" s={10} /> Add resource</button>

                <div style={{ marginTop: 10, fontSize: 9.5, fontWeight: 800, color: S.ink3, letterSpacing: 0.5, marginBottom: 5 }}>MORE RESOURCES</div>
                {[
                  { lbl: "Fraction Wall Poster", kind: "PDF",  c: "#991B1B", bg: "#FEE2E2" },
                  { lbl: "Anchor Chart Tem…",     kind: "DOCX", c: "#1E3A8A", bg: "#DBEAFE" },
                  { lbl: "Fraction Examples …",   kind: "PDF",  c: "#991B1B", bg: "#FEE2E2" },
                ].map((r, k) => (
                  <div key={k} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 8px", marginBottom: 3,
                    background: "rgba(255,255,255,0.7)", border: `1px solid ${S.line}`,
                    borderRadius: 6,
                  }}>
                    <span style={{ color: r.c }}><Ic n="cal" s={11} /></span>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: S.ink }}>{r.lbl}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: r.c, background: r.bg, padding: "1px 5px", borderRadius: 3, letterSpacing: 0.4 }}>{r.kind}</span>
                  </div>
                ))}
                <button style={{
                  background: "transparent", border: 0, padding: "3px 0",
                  color: S.ink2, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>Show more <Ic n="chevD" s={10} /></button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// ── Full shell ─────────────────────────────────────────────────────
const ABScheduleIntegration = ({ organize = "subject", showNonAcademic = false, minimized = false, tab = "bell" }) => (
  <div style={{
    height: "100%", display: "flex", flexDirection: "column",
    fontFamily: "Inter, system-ui, sans-serif",
    background: "linear-gradient(135deg, #F0EAFB 0%, #E8F4FB 35%, #FBF1E2 70%, #F2FBED 100%)",
  }}>
    <TopBar active="weekly" />
    <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
      <LeftRail />
      <DailyPane />
      <LessonDetailPane />
      <WeeklyPane organize={organize} showNonAcademic={showNonAcademic} minimized={minimized} />
      <SchedulePane tab={tab} />
    </div>
  </div>
);

Object.assign(window, { ABScheduleIntegration });
