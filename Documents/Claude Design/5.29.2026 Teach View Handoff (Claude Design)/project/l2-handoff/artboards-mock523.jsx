// artboards-mock523.jsx — 5.23.26 mock-up.
//
// Built from the seven uploaded screenshots of the live mycurricula.app
// build. Mocks three surfaces (Weekly · Daily · Subject) so the team
// can compare the prototype against what's actually shipping and
// drive further iteration from a shared reference.
//
// Layout vocabulary lifted from the screenshots:
//   • Top bar — left logo "MyCurricula" + Grade 5, then Weekly/Daily/
//     Subject (active black pill) / Schedule soon / Unit soon / Year
//     soon, then Week 12 pill + "All changes saved", undo/redo, then
//     Personal|Master + SimpleTaskGrid toggles, search/list/notif/
//     avatar/logout.
//   • Left rail — slim icon nav (calendar / clock / list / grid /
//     mic) with "soon" labels under the inactive ones.
//   • Right panel — docked panels: Resources tab strip (All / Slides /
//     Handouts / Tools), Day Shoutbox, To-do List. Two icons top-right
//     to toggle a single-panel vs multi-panel layout.
//
// Three artboards exported:
//   ABMock523Weekly  — the weekly grid surface
//   ABMock523Daily   — the daily two-pane surface
//   ABMock523Subject — the subject (Math) drilldown
//
// All three share the same chrome (TopBar523, LeftRail523, RightDock523)
// so swapping between them in the future is a one-line change.

// ────────────────────────────────────────────────────────────────────
// Subject color palette tuned to the screenshots
// ────────────────────────────────────────────────────────────────────
const M523_SUBJ = {
  math:      { tile: "#A8C7FB", bg: "#DCE7FB", deep: "#1E40AF", label: "MATH",     short: "Ma" },
  reading:   { tile: "#A8E6B8", bg: "#DCF3E1", deep: "#166534", label: "READING",  short: "Re" },
  writing:   { tile: "#D1C4F8", bg: "#E7DEFB", deep: "#5B21B6", label: "WRITING",  short: "Wr" },
  grammar:   { tile: "#9BE5DC", bg: "#D5F2EE", deep: "#0F766E", label: "GRAMMAR",  short: "Gr" },
  spelling:  { tile: "#F9B7D5", bg: "#FCD8E7", deep: "#9D174D", label: "SPELLING", short: "Sp" },
  ufli:      { tile: "#FBC4A8", bg: "#FCDFD0", deep: "#9A3412", label: "UFLI",     short: "Uf" },
  explorers: { tile: "#FCE39A", bg: "#FEF1C8", deep: "#854D0E", label: "EXPLORERS",short: "Ex" },
  sel:       { tile: "#CBD5E1", bg: "#E2E8F0", deep: "#334155", label: "SEL",      short: "Se" },
};

const M523_DAYS = [
  { id: 0, full: "Sunday",    short: "Sun", abbr: "SUN", num: 18 },
  { id: 1, full: "Monday",    short: "Mon", abbr: "MON", num: 19 },
  { id: 2, full: "Tuesday",   short: "Tue", abbr: "TUE", num: 20 },
  { id: 3, full: "Wednesday", short: "Wed", abbr: "WED", num: 21 },
  { id: 4, full: "Thursday",  short: "Thu", abbr: "THU", num: 22 },
];

// ────────────────────────────────────────────────────────────────────
// Shared chrome
// ────────────────────────────────────────────────────────────────────
const TopBar523 = ({ active }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 14,
    padding: "10px 18px",
    background: "#FAF5F7",
    borderBottom: "1px solid #E9DCE3",
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>MyCurricula</span>
      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>Grade 5</span>
    </div>
    <span style={{ width: 1, height: 18, background: "#E2E8F0", marginLeft: 4 }} />
    <button style={{ padding: 0, background: "transparent", border: 0, color: "#64748B", cursor: "pointer" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
    </button>
    <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[
        { id: "weekly",   label: "Weekly" },
        { id: "daily",    label: "Daily" },
        { id: "subject",  label: "Subject" },
      ].map(t => (
        <span key={t.id} style={{
          padding: "5px 12px", borderRadius: 6, fontSize: 13.5, fontWeight: 600,
          background: t.id === active ? "#0B181E" : "transparent",
          color: t.id === active ? "#fff" : "#0B181E",
        }}>{t.label}</span>
      ))}
      {["Schedule", "Unit", "Year"].map(s => (
        <span key={s} style={{ padding: "5px 10px", fontSize: 13.5, fontWeight: 500, color: "#9AA3B2" }}>
          {s} <span style={{ fontSize: 10, color: "#C1C6D2", letterSpacing: 0.5, textTransform: "uppercase" }}>soon</span>
        </span>
      ))}
    </nav>
    <span style={{ width: 1, height: 18, background: "#E2E8F0", marginLeft: 4 }} />
    <span style={{ padding: "4px 10px", border: "1px solid #D8C5D0", borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: "#0B181E", background: "#fff" }}>Week 12</span>
    <span style={{ fontSize: 12, color: "#64748B" }}>All changes saved</span>
    <span style={{ display: "inline-flex", gap: 2, color: "#94A3B8" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ padding: "5px 11px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: "#0B181E", background: "#fff" }}>Personal<span style={{ color: "#94A3B8" }}> | </span>Master</span>
    <span style={{ padding: "5px 11px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: "#0B181E", background: "#fff" }}>Simple<span style={{ color: "#94A3B8" }}> | </span>Task<span style={{ color: "#94A3B8" }}> | </span>Grid</span>
    <span style={{ color: "#94A3B8", display: "inline-flex", gap: 10 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M3 12h18M3 19h18"/></svg>
      <span style={{ position: "relative" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 10a6 6 0 0 1 12 0v4l2 2H4l2-2z"/><path d="M10 18a2 2 0 0 0 4 0"/></svg>
        <span style={{ position: "absolute", top: -3, right: -5, width: 13, height: 13, borderRadius: 999, background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>3</span>
      </span>
    </span>
    <span style={{ width: 28, height: 28, borderRadius: 999, background: "#94A3B8", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>LH</span>
    <span style={{ color: "#94A3B8" }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>
    </span>
  </div>
);

const LeftRail523 = ({ active = "weekly" }) => (
  <div style={{
    width: 50, flex: "0 0 auto",
    background: "#fff", borderRight: "1px solid #ECEFF4",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "12px 0", gap: 14,
  }}>
    {[
      { id: "weekly",   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>, soon: false },
      { id: "daily",    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>, soon: true },
      { id: "subject",  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>, soon: false },
      { id: "grid",     icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>, soon: true },
      { id: "mic",      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>, soon: true },
    ].map((r, i) => (
      <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 7,
          background: r.id === active ? "#EEF2FF" : "transparent",
          color: r.id === active ? "#1E40AF" : "#64748B",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{r.icon}</span>
        {r.soon && <span style={{ fontSize: 8, color: "#C1C6D2", letterSpacing: 0.5, fontWeight: 600 }}>soon</span>}
      </div>
    ))}
    <div style={{ flex: 1 }} />
    <span style={{ width: 26, height: 26, color: "#94A3B8", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
    </span>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// Right dock — Resources panel + Day Shoutbox + To-do List
// ────────────────────────────────────────────────────────────────────
const RightDock523 = ({ context = "week", contextLabel = "Week 12", contextCount = 34 }) => (
  <div style={{
    width: 360, flex: "0 0 auto",
    background: "#fff", borderLeft: "1px solid #ECEFF4",
    display: "flex", flexDirection: "column", overflow: "hidden",
  }}>
    {/* Mini toggle bar at top */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "6px 12px", borderBottom: "1px solid #F2F4F8" }}>
      <span style={{ color: "#94A3B8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg></span>
      <div style={{ flex: 1 }} />
      <span style={{ color: "#94A3B8" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18"/></svg></span>
      <span style={{ color: "#94A3B8" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/></svg></span>
    </div>

    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Resources panel */}
      <div style={{ padding: "12px 14px 14px", borderBottom: "1px solid #F2F4F8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg></span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0B181E" }}>Resources · {contextLabel}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", background: "#EEF2FF", padding: "1px 7px", borderRadius: 999 }}>{contextCount}</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></span>
          <span style={{ color: "#475569" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></span>
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></span>
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></span>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E2E8F0", marginBottom: 10 }}>
          {[["All", true],["Slides", false],["Handouts", false],["Tools", false]].map(([lbl, on], i) => (
            <span key={i} style={{
              padding: "4px 14px", fontSize: 11.5, fontWeight: 600,
              color: on ? "#0B181E" : "#64748B",
              borderBottom: on ? "2px solid #0B181E" : "2px solid transparent",
              marginBottom: -1,
            }}>{lbl}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ResThumb kind="video"  label="Fraction Basics"  badge="YOUTUBE" tone="#FECDD3" />
          <ResThumb kind="link"   label="What is a Fraction?" badge="LINK" tone="#FDE2D2" />
          <ResThumb kind="doc"    label="Fractions Overview" badge="DOC" tone="#FBC4E1" />
          <ResThumb kind="link"   label="Khan Academy"     badge="LINK" tone="#FDE2D2" />
          <ResThumb kind="doc"    label="Fraction Wall Poster" badge="PDF" tone="#FECACA" />
          <ResThumb kind="doc"    label="Anchor Chart Template" badge="DOC" tone="#FEE2D9" />
        </div>
      </div>

      {/* Day Shoutbox */}
      <div style={{ padding: "14px 14px 14px", borderBottom: "1px solid #F2F4F8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg></span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0B181E" }}>Day Shoutbox</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: "#94A3B8", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5 }}>TEAM CHAT</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#DC2626", width: 18, height: 18, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>2</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></span>
        </div>
        <Shout who="OM" name="Omar" time="7:52 AM" body="Morning, team — reminder the library is closed Sun–Wed for inventory." />
        <Shout who="SK" name="Sarah" time="8:05 AM" body="Thanks Omar. I'll move my reading groups to the back corner this week." />
        <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
          <input placeholder="Type a message…" style={{
            flex: 1, padding: "6px 11px", border: "1px solid #E2E8F0", borderRadius: 999,
            fontSize: 12, color: "#0B181E", outline: "none",
          }} />
          <span style={{ color: "#94A3B8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg></span>
          <span style={{ color: "#94A3B8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></span>
          <span style={{ color: "#1D4ED8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></span>
        </div>
      </div>

      {/* To-do List */}
      <div style={{ padding: "14px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg></span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0B181E" }}>To-do List</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", background: "#EEF2FF", padding: "1px 7px", borderRadius: 999 }}>4</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></span>
        </div>
        <Todo label="Print List 12 spelling for Mon" dot="#F59E0B" />
        <Todo label="Email Aya's mum re. samosas Wed" dot="#F59E0B" />
        <Todo label="Photocopy fraction strips ×26" dot="#10B981" done />
        <Todo label="Grab clipboards from storage" />
        <Todo label="Decide Tuesday assembly seating" badge="TEAM" />
      </div>
    </div>
  </div>
);

const Shout = ({ who, name, time, body }) => (
  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
    <span style={{
      width: 24, height: 24, borderRadius: 999, background: "#94A3B8", color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 700, flex: "0 0 auto",
    }}>{who}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0B181E" }}>{name}</span>
        <span style={{ fontSize: 10.5, color: "#94A3B8" }}>{time}</span>
      </div>
      <div style={{ fontSize: 12, color: "#334155", marginTop: 1, lineHeight: 1.5, textWrap: "pretty", background: "#F2F4F8", padding: "5px 9px", borderRadius: 9 }}>{body}</div>
    </div>
  </div>
);

const Todo = ({ label, dot, done, badge }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 9,
    padding: "6px 4px",
    color: done ? "#94A3B8" : "#0B181E",
  }}>
    <span style={{
      width: 14, height: 14, borderRadius: 4, flex: "0 0 auto",
      background: done ? "#10B981" : "#fff",
      border: done ? "1.5px solid #10B981" : "1.5px solid #CBD5E1",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>{done && <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7"/></svg>}</span>
    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, textDecoration: done ? "line-through" : "none" }}>{label}</span>
    {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
    {badge && <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", background: "#F1F5F9", padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5 }}>{badge}</span>}
  </div>
);

const ResThumb = ({ kind, label, badge, tone }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{
      height: 70, borderRadius: 8, background: tone,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <span style={{ position: "absolute", top: 4, left: 6, color: "#94A3B8" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </span>
      <span style={{ position: "absolute", top: 4, right: 22, color: "#94A3B8" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </span>
      <span style={{ position: "absolute", top: 4, right: 6, color: "#94A3B8" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </span>
      {kind === "video" && (
        <span style={{ width: 30, height: 30, borderRadius: 999, background: "#fff", color: "#DC2626", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      )}
      {kind === "link" && (
        <span style={{ color: "#9A3412" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
        </span>
      )}
      {kind === "doc" && (
        <span style={{ color: "#9D174D" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
        </span>
      )}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 10, color: "#475569" }}>
        {kind === "video" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4z"/></svg>}
        {kind === "link"  && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>}
        {kind === "doc"   && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#0B181E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>{badge}</span>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// Weekly lesson card — matches the screenshots' card anatomy
// ────────────────────────────────────────────────────────────────────
const M523WeeklyCard = ({ lesson, dense }) => {
  const subj = M523_SUBJ[lesson.subject];
  const empty = !lesson.title;
  if (empty) {
    return (
      <div style={{
        minHeight: 130, background: subj.bg, opacity: 0.55,
        borderRadius: 8, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
        color: subj.deep,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500 }}>Drag a lesson here or click</span>
        <span style={{ width: 24, height: 24, borderRadius: 999, background: "#fff", color: subj.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>+</span>
      </div>
    );
  }
  return (
    <div style={{
      background: subj.bg, borderRadius: 6, padding: "9px 11px 8px",
      borderLeft: lesson.modified ? `dashed 2px ${subj.deep}` : 0,
      position: "relative", minHeight: 130, display: "flex", flexDirection: "column",
      backgroundImage: lesson.modified
        ? `linear-gradient(to bottom, ${subj.deep} 0, ${subj.deep} 4px, transparent 4px, transparent 8px), linear-gradient(${subj.bg}, ${subj.bg})`
        : undefined,
      backgroundRepeat: "repeat-y, no-repeat", backgroundSize: "3px 8px, auto",
      backgroundPosition: "left top, 3px top",
    }}>
      {/* header strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, background: subj.tile, color: subj.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{subj.short}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: subj.deep, letterSpacing: 0.4 }}>{subj.label}</span>
        <span style={{ fontSize: 9.5, color: "#475569" }}>| {lesson.time || "10:00–11:00"}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#94A3B8" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg></span>
      </div>
      {lesson.modified && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8.5, fontWeight: 700, color: "#fff", background: "#0F172A", padding: "1px 6px", borderRadius: 4, letterSpacing: 0.5, alignSelf: "flex-start", marginBottom: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "#10B981" }} /> MODIFIED
        </span>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0B181E", lineHeight: 1.3, letterSpacing: -0.1, textWrap: "pretty" }}>{lesson.title}</div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 4, lineHeight: 1.45, textWrap: "pretty", flex: 1,
        display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{lesson.preview}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#475569" }}>CCSS <span style={{ background: "#fff", padding: "0 5px", borderRadius: 3 }}>·{lesson.standards}</span></span>
        {lesson.resources > 0 && (
          <span style={{ display: "inline-flex", gap: 3, fontSize: 9.5, color: "#475569" }}>
            <span style={{ color: "#DC2626" }}>📄</span>{lesson.resources}
          </span>
        )}
        {lesson.tasks && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", background: "#E0F2FE", padding: "1px 6px", borderRadius: 999 }}>≡ {lesson.tasks} tasks</span>
        )}
        <div style={{ flex: 1 }} />
        {lesson.carryOver && (
          <span style={{ fontSize: 9, color: "#9A3412", fontWeight: 600 }}>carry-over ⚠</span>
        )}
        {lesson.core && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#7A4F08", background: "#FDE68A", padding: "1px 6px", borderRadius: 4 }}>CORE ↑</span>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// WEEKLY ARTBOARD
// ────────────────────────────────────────────────────────────────────
const M523_WEEK = {
  math: [
    { time: "8:10–9:10", title: "Equivalent fractions warm-up", preview: "Number-talk routine: pairs find three equivalent fractions for 3/4, share strategies, then class consolidates the visual model on the board.", standards: 2, resources: 4 },
    { time: "8:10–9:10", title: "Fractions as division — bake sale problem", preview: "Anchor problem: 5 cookies shared by 4 friends. Students use bar models then long division to…", standards: 1, resources: 3, modified: true },
    { time: "8:10–9:10", title: "Multiplying a fraction by a whole number", preview: "Concrete-pictorial-abstract sequence. Start with fraction tiles, move to area models, end with the algorithm.", standards: 1, resources: 2 },
    { time: "8:10–9:10", title: "Mid-unit check — fractions", preview: "Independent 20-minute check covering equivalence, fractions as division, and multiplication of a fraction by a whole number.", standards: 1, resources: 0, core: true },
    { time: "8:10–9:10", title: "Re-engagement: error analysis", preview: "Look at three flawed student solutions on equivalent fractions. Identify the misconception, repair the work, then write a one-sentence rule.", standards: 1, resources: 1 },
  ],
  reading: [
    { time: "10:00–11:00", title: "Wonder, chs 14–17 — point of view", preview: "First-person narrator shift from August to Via. Students annotate three places the same event is reframed.", standards: 2, resources: 1 },
    { time: "10:00–11:00", title: "Book club — Via's chapters", preview: "Pre-assigned literature circle roles: discussion leader, connector, vocabulary detective, summarizer. 18-minute discussion, 4-minute share.", standards: 1, resources: 1, modified: true },
    { time: "10:00–11:00", title: "Literacy Centers (90 min)", preview: "Three-station rotation: reading comprehension · grammar dictation · narrative wri…", standards: 3, resources: 1, tasks: 3 },
    { time: "10:00–11:00", title: "Theme mapping", preview: "Build a class theme map. Each student adds one piece of evidence from chapters 1–20 supporting kindness as a theme.", standards: 1, resources: 1 },
    { time: "10:00–11:00", title: "Independent reading + conferences", preview: "20-min sustained silent reading; teacher conferences with 4 students rotating through fluency, comprehension, and goal-setting.", standards: 1, resources: 0 },
  ],
  writing: [
    { time: "12:20–1:10", title: "Lead sentences — three rewrites", preview: "Students rewrite the same opening three ways: with dialogue, with sensory detail, with a question. Share-out and class vote on strongest.", standards: 2, resources: 1 },
    {},
    { time: "12:20–1:10", title: "Drafting day — narrative middle", preview: "30-minute sustained drafting block on the rising action of their personal narrative. Quiet writing, music optional.", standards: 1, resources: 0, carryOver: true },
    { time: "12:20–1:10", title: "Peer feedback — show vs tell", preview: "Partner conferences focused on one paragraph: highlight what's telling, suggest one place to show. Use the show/tell cue cards.", standards: 1, resources: 1, modified: true },
    {},
  ],
  grammar: [
    { time: "1:10–1:40", title: "Past, present, future review", preview: "Sort 18 sample sentences into three columns by verb tense. Identify three sentences with shifts.", standards: 1, resources: 1 },
    {},
    { time: "1:10–1:40", title: "Inappropriate shifts in tense", preview: "Edit a one-paragraph narrative that drifts between tenses. Highlight every verb, then rewrite consistently in past.", standards: 1, resources: 1 },
    {},
    { time: "1:10–1:40", title: "Quick check — verb tense", preview: "10-question multiple-choice and 3 short-answer rewrites. Goes home as a study tool.", standards: 2, resources: 0 },
  ],
  spelling: [
    { time: "1:40–2:00", title: "List 12 introduction — Greek roots", preview: "Introduce -graph, -phone, -scope, -meter. Build five words from each root with the class. Send list home.", standards: 1, resources: 1 },
    {},
    { time: "1:40–2:00", title: "Word sort + sentence frames", preview: "Students sort the week's 20 words by root, then write three sentences each using two roots. Pair-share.", standards: 1, resources: 1 },
    {},
    { time: "1:40–2:00", title: "Friday quiz", preview: "Standard dictation-style quiz on List 12. Includes two challenge words from previous lists.", standards: 1, resources: 0 },
  ],
  ufli: [
    { time: "9:10–9:40", title: "Lesson 84 — closed syllables review", preview: "10-min warm-up, blending drill, two decodable passages. Track decoding errors on the class form.", standards: 1, resources: 0 },
    { time: "9:10–9:40", title: "Lesson 85 — V/CV and VC/V split", preview: "Introduce the two patterns for syllable division before a single consonant. 12 words, marking syllables.", standards: 1, resources: 0 },
    { time: "9:10–9:40", title: "Lesson 86 — practice & decodable", preview: "Re-read yesterday's words at speed; new decodable passage with embedded V/CV words. Partner reading.", standards: 1, resources: 0, modified: true },
    { time: "9:10–9:40", title: "Lesson 87 — open syllables intro", preview: "Open-syllable rule. Sort 16 words by syllable type. Quick-check at end.", standards: 1, resources: 0 },
    { time: "9:10–9:40", title: "Lesson 88 — cumulative review", preview: "Sprint review of lessons 80–87. Mixed practice and a one-page progress probe.", standards: 1, resources: 0 },
  ],
  explorers: [
    {},
    { time: "2:10–2:50", title: "Nile geography — why here?", preview: "Maps activity: students annotate four features of the Nile valley that made it attractive for civilization. Compare with Tigris/Euphrates next week.", standards: 0, resources: 2 },
    {},
    { time: "2:10–2:50", title: "Hieroglyphs cartouche workshop", preview: "Students build their own name cartouche in hieroglyphs using the phonetic alphabet handout. Display in the hallway.", standards: 0, resources: 2 },
    {},
  ],
  sel: [
    {},
    {},
    { time: "9:40–10:00", title: "Conflict — name it, claim it", preview: "Class circle. Students share one small recent conflict (anonymously written), the group identifies its trigger and one repair move.", standards: 0, resources: 0 },
    {},
    {},
  ],
};

const ABMock523Weekly = () => (
  <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
    <TopBar523 active="weekly" />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail523 active="weekly" />
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 22px", background: "#fff" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>WEEKLY PLAN</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Week 12</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#3B82F6", padding: "2px 9px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>This Week</span>
            <div style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 14, color: "#475569", fontSize: 13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6"/></svg>
              <span style={{ fontWeight: 600 }}>Today</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: "#0B181E", fontWeight: 500 }}>Expand all<span style={{ color: "#CBD5E1" }}> | </span>Minimize all</span>
          <span style={{ color: "#0B181E", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="2" width="12" height="14" rx="2"/><path d="M16 2v6h4"/></svg>
            Duplicate week
          </span>
        </div>

        {/* day header row */}
        <div style={{ display: "grid", gridTemplateColumns: "76px repeat(5, 1fr)", gap: 8, marginBottom: 8 }}>
          <div />
          {M523_DAYS.map(d => (
            <div key={d.id} style={{ fontSize: 13, color: "#0B181E", padding: "0 4px" }}>
              <span style={{ fontWeight: 600 }}>{d.full}</span><span style={{ color: "#94A3B8", fontWeight: 500 }}> {d.short}</span>
            </div>
          ))}
        </div>

        {/* subject rows */}
        {Object.entries(M523_WEEK).map(([sid, days]) => {
          const subj = M523_SUBJ[sid];
          return (
            <div key={sid} style={{ display: "grid", gridTemplateColumns: "76px repeat(5, 1fr)", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: subj.tile, color: subj.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, letterSpacing: -0.2 }}>{subj.short}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#0B181E" }}>{sid.charAt(0).toUpperCase() + sid.slice(1)}</span>
              </div>
              {days.map((l, i) => (
                <M523WeeklyCard key={i} lesson={{ ...l, subject: sid }} />
              ))}
            </div>
          );
        })}
      </div>
      <RightDock523 context="week" contextLabel="Week 12" contextCount={34} />
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// DAILY ARTBOARD
// ────────────────────────────────────────────────────────────────────
const M523_DAILY_LESSONS = [
  { subject: "math", title: "Equivalent fractions warm-up", active: true },
  { subject: "reading", title: "Wonder, chs 14–17 — point of view" },
  { subject: "writing", title: "Lead sentences — three rewrites" },
  { subject: "grammar", title: "Past, present, future review" },
  { subject: "spelling", title: "List 12 introduction — Greek roots" },
  { subject: "ufli", title: "Lesson 84 — closed syllables revi…" },
];

const M523_SECTIONS = [
  { n: 1, color: "#10B981", title: "Standards",                      sub: "5.NF.B.3 · 5.NF.A.1" },
  { n: 2, color: "#F97316", title: "Focus Lesson — I Do",            sub: "Model the concept and solve examples together." },
  { n: 3, color: "#8B5CF6", title: "Guided Instruction — We Do",     sub: "Practice together with teacher support." },
  { n: 4, color: "#0EA5E9", title: "Collaborative Practice — You Do Together", sub: "Work in pairs or groups to apply the skill." },
  { n: 5, color: "#3B82F6", title: "Independent Practice — You Do Alone", sub: "Students practice independently." },
  { n: 6, color: "#EC4899", title: "Debrief",                        sub: "Reflect on learning and key takeaways." },
];

const ABMock523Daily = () => (
  <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
    <TopBar523 active="daily" />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail523 active="daily" />

      {/* Day list */}
      <div style={{ width: 290, flex: "0 0 auto", borderRight: "1px solid #ECEFF4", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #F2F4F8" }}>
          <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Week 12</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", padding: "10px 8px 6px", gap: 4 }}>
          {M523_DAYS.map(d => (
            <div key={d.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: 0.5 }}>{d.abbr}</span>
              <span style={{
                width: 28, height: 28, borderRadius: 999,
                background: d.id === 0 ? "#3B82F6" : "transparent",
                color: d.id === 0 ? "#fff" : "#0B181E",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
              }}>{d.num}</span>
              {d.id === 2 && <span style={{ width: 5, height: 5, borderRadius: 999, background: "#EF4444" }} />}
              {d.id === 3 && <span style={{ width: 5, height: 5, borderRadius: 999, background: "#3B82F6" }} />}
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 14px 6px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>Sunday</span>
            <span style={{ fontSize: 11, color: "#475569" }}><strong style={{ color: "#0B181E" }}>0</strong> of 6 lessons</span>
          </div>
          <div style={{ height: 3, background: "#E2E8F0", borderRadius: 999, marginTop: 6 }}>
            <div style={{ width: "0%", height: "100%", background: "#3B82F6", borderRadius: 999 }} />
          </div>
        </div>

        <div style={{ padding: "8px 14px 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, flex: 1 }}>Lessons</span>
          <span style={{ fontSize: 11.5, color: "#475569", display: "inline-flex", alignItems: "center", gap: 3 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            Collapse all
          </span>
          <span style={{ color: "#94A3B8" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 10px" }}>
          {M523_DAILY_LESSONS.map((l, i) => {
            const subj = M523_SUBJ[l.subject];
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 10px", marginBottom: 4,
                background: l.active ? "#fff" : "transparent",
                border: l.active ? `1px solid ${subj.tile}` : "1px solid transparent",
                borderRadius: 7,
                boxShadow: l.active ? "0 1px 2px rgba(11,24,30,.04)" : "none",
              }}>
                <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg></span>
                <span style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid #CBD5E1", background: "#fff", flex: "0 0 auto" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: subj.deep, letterSpacing: 0.5 }}>{subj.label}</div>
                  <div style={{ fontSize: 12.5, color: "#0B181E", fontWeight: 500, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 14px", borderTop: "1px solid #F2F4F8" }}>
          <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Today's Events</div>
          <button style={{ marginTop: 6, padding: 0, color: "#475569", background: "transparent", border: 0, fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: "#94A3B8", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>+</span>
            Add an event
          </button>
        </div>
      </div>

      {/* Center pane */}
      <div style={{ flex: 1, overflow: "auto", background: "#fff", padding: "16px 22px 24px" }}>
        {/* Subject banner */}
        <div style={{
          background: M523_SUBJ.math.tile,
          borderRadius: 6, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 12,
          marginBottom: 18,
        }}>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: "#fff", color: M523_SUBJ.math.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{M523_SUBJ.math.short}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: M523_SUBJ.math.deep, letterSpacing: 0.5 }}>MATH</span>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: M523_SUBJ.math.deep }}>Equivalent fractions warm-up</span>
          </div>
        </div>

        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0B181E", letterSpacing: -0.5 }}>Equivalent fractions warm-up</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#3B82F6", padding: "2px 9px", borderRadius: 4, letterSpacing: 0.5 }}>I CAN</span>
          <span style={{ fontSize: 13, color: "#0B181E" }}>find three equivalent fractions for a given fraction.</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, fontSize: 12, color: "#475569" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px solid #CBD5E1" }} />
            Mark done
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, border: "1.5px solid #CBD5E1" }} />
            Add status
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            Lesson notes
          </span>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: "#475569" }}>
          Expand all<span style={{ color: "#0B181E", fontWeight: 600 }}> Collapse all</span>
        </div>

        {/* Sections */}
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {M523_SECTIONS.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < M523_SECTIONS.length - 1 ? "1px solid #F2F4F8" : "none" }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: s.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flex: "0 0 auto" }}>{s.n}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0B181E" }}>{s.title}</div>
                {s.sub && i > 0 && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{s.sub}</div>}
                {i === 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>5.NF.B.3 · 5.NF.A.1</span>
                  </div>
                )}
              </div>
              <span style={{ color: "#94A3B8" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </span>
              {i > 0 && (
                <span style={{ color: "#94A3B8" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <RightDock523 context="lesson" contextLabel="Equivalent fractions war…" contextCount={7} />
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// SUBJECT ARTBOARD
// ────────────────────────────────────────────────────────────────────
const M523_SUBJECT_LESSONS = [
  { title: "Equivalent fractions — area models",        week: "W11", day: "Mon", codes: ["5.NF.A.1"],            count: 1, done: true,  strike: true },
  { title: "Equivalent fractions warm-up",              week: "W12", day: "Sun", codes: ["5.NF.B.3","5.NF.A.1"], count: 7, done: false },
  { title: "Fractions as division — bake sale problem", week: "W12", day: "Mon", codes: ["5.NF.B.3"],            count: 3, done: false },
  { title: "Math centers (last 20 min)",                week: "W12", day: "Mon", codes: ["+3"],                  count: 2, done: false },
  { title: "Multiplying a fraction by a whole number",  week: "W12", day: "Tue", codes: ["5.NF.B.4"],            count: 2, done: true,  strike: true },
  { title: "Mid-unit check — fractions",                week: "W12", day: "Wed", codes: ["5.NF.B.3","5.NF.B.4"], count: 1, done: false },
  { title: "Re-engagement: error analysis",             week: "W12", day: "Thu", codes: ["5.NF.A.1"],            count: 1, done: false },
  { title: "Adding fractions with unlike denominators", week: "W13", day: "Mon", codes: ["5.NF.A.1"],            count: 1, done: false },
];

const M523_SUBJECT_RESOURCES = [
  { kind: "tools",  title: "Area model deck",          ctx: "Equivalent fractions — area models" },
  { kind: "video",  title: "Fraction Basics",          ctx: "Equivalent fractions warm-up" },
  { kind: "link",   title: "What is a Fraction?",      ctx: "Equivalent fractions warm-up" },
  { kind: "tools",  title: "Fractions Overview",       ctx: "Equivalent fractions warm-up" },
  { kind: "link",   title: "Khan Academy",             ctx: "Equivalent fractions warm-up" },
  { kind: "tools",  title: "Fraction Wall Poster",     ctx: "Equivalent fractions warm-up" },
  { kind: "tools",  title: "Anchor Chart Template",    ctx: "Equivalent fractions warm-up" },
  { kind: "tools",  title: "Fraction Examples Sheet",  ctx: "Equivalent fractions warm-up" },
];

const ABMock523Subject = () => (
  <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
    <TopBar523 active="subject" />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail523 active="subject" />

      {/* Subject sidebar */}
      <div style={{ width: 200, flex: "0 0 auto", borderRight: "1px solid #ECEFF4", background: "#fff", padding: "16px 10px" }}>
        <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 8px" }}>Subjects</div>
        {[
          { id: "math",      label: "Math",      active: true, count: "2/8" },
          { id: "reading",   label: "Reading" },
          { id: "writing",   label: "Writing" },
          { id: "grammar",   label: "Grammar" },
          { id: "spelling",  label: "Spelling" },
          { id: "ufli",      label: "UFLI" },
          { id: "explorers", label: "Explorers" },
          { id: "sel",       label: "SEL" },
        ].map(s => {
          const subj = M523_SUBJ[s.id];
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 7,
              background: s.active ? "#F1F5F9" : "transparent",
              color: s.active ? "#0B181E" : "#0B181E",
            }}>
              <span style={{ width: 3, height: 16, background: subj.deep, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: s.active ? 700 : 500, flex: 1 }}>{s.label}</span>
              {s.count && <span style={{ fontSize: 10.5, fontWeight: 600, color: "#64748B" }}>{s.count}</span>}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 26px", background: "#fff" }}>
        <div style={{ fontSize: 10.5, color: "#3B82F6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: "#3B82F6", borderRadius: 2 }} /> SUBJECT
        </div>
        <h1 style={{ margin: "4px 0 4px", fontSize: 30, fontWeight: 700, color: "#0B181E", letterSpacing: -0.6 }}>Math</h1>
        <div style={{ fontSize: 13, color: "#475569" }}>Unit 3 · Fractions on a Number Line · Wk 9–14</div>

        <div style={{ display: "flex", gap: 32, marginTop: 16, paddingBottom: 16, borderBottom: "1px solid #F2F4F8" }}>
          <Stat label="DONE" value="2 / 8" />
          <Stat label="COMPLETE" value="25%" />
          <Stat label="RESOURCES" value="18" />
          <div style={{ flex: 1 }} />
        </div>

        {/* Timeline */}
        <div style={{ position: "relative", margin: "16px 0 20px" }}>
          <div style={{ height: 4, background: "#E5E7EB", borderRadius: 999 }}>
            <div style={{ width: "33%", height: "100%", background: "#3B82F6", borderRadius: 999 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#475569", fontWeight: 500 }}>
            <span>Wk 11</span><span>Wk 12</span><span>Wk 13</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14, fontSize: 12, color: "#0B181E" }}>
          <span style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>PERIOD</span>
          <span style={{ fontWeight: 600 }}>All</span>
          <span style={{ color: "#64748B" }}>Unit</span>
          <span style={{ color: "#64748B" }}>Month</span>
          <span style={{ color: "#64748B" }}>Week</span>
          <span style={{ width: 1, height: 12, background: "#E2E8F0" }} />
          <span style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>GROUP BY</span>
          <span style={{ padding: "3px 9px", background: "#0B181E", color: "#fff", borderRadius: 4, fontWeight: 600 }}>By Unit By Week</span>
        </div>

        {/* Unit block */}
        <div style={{ border: "1px solid #ECEFF4", borderRadius: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #F2F4F8" }}>
            <span style={{ color: "#94A3B8" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6"/></svg></span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#3B82F6", padding: "2px 7px", borderRadius: 4, letterSpacing: 0.4 }}>U1</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>Unit 3 · Fractions on a Number Line</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#7A4F08", background: "#FDE68A", padding: "2px 9px", borderRadius: 4, letterSpacing: 0.5 }}>NOW</span>
            <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>2/8</span>
            <span style={{ fontSize: 12, color: "#1D4ED8", fontWeight: 600 }}>Expand all</span>
          </div>
          {M523_SUBJECT_LESSONS.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: i < M523_SUBJECT_LESSONS.length - 1 ? "1px solid #F8FAFC" : "none" }}>
              <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg></span>
              <span style={{
                width: 14, height: 14, borderRadius: 4, flex: "0 0 auto",
                background: l.done ? "#10B981" : "#fff",
                border: l.done ? "1.5px solid #10B981" : "1.5px solid #CBD5E1",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>{l.done && <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7"/></svg>}</span>
              <span style={{
                flex: 1, fontSize: 13, color: "#0B181E", fontWeight: 500,
                textDecoration: l.strike ? "line-through" : "none",
                color: l.strike ? "#94A3B8" : "#0B181E",
              }}>{l.title}</span>
              <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>{l.week}</span>
              <span style={{ fontSize: 11, color: "#475569" }}>·</span>
              <span style={{ fontSize: 11, color: "#475569", width: 30 }}>{l.day}</span>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {l.codes.map((c, j) => (
                  <span key={j} className="cp-mono" style={{
                    fontSize: 9.5, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                    background: c.startsWith("+") ? "#3B82F6" : "#F1F5F9",
                    color: c.startsWith("+") ? "#fff" : "#475569",
                  }}>{c}</span>
                ))}
              </span>
              <span style={{ fontSize: 11, color: "#94A3B8", width: 42, textAlign: "right" }}>{l.count} res</span>
            </div>
          ))}
        </div>

        {/* Resources block */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>Resources</div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>18 total</span>
        </div>
        <div style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 12 }}>
          {[
            { lbl: "All", on: true, icon: "▤" },
            { lbl: "Slides", icon: "▦" },
            { lbl: "Video", icon: "▷" },
            { lbl: "Link", icon: "⊗" },
            { lbl: "Doc", icon: "▤" },
            { lbl: "PDF", icon: "▥" },
            { lbl: "Image", icon: "▣" },
          ].map((f, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              color: f.on ? "#0B181E" : "#64748B",
              fontWeight: f.on ? 600 : 500,
              borderBottom: f.on ? "2px solid #0B181E" : "2px solid transparent",
              paddingBottom: 4,
            }}><span>{f.icon}</span>{f.lbl}</span>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {M523_SUBJECT_RESOURCES.map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 7,
              background: i % 2 === 0 ? "#FAFBFD" : "transparent",
            }}>
              <span style={{ color: "#94A3B8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg></span>
              <span style={{ flex: 1, fontSize: 13, color: "#0B181E", fontWeight: 500 }}>{r.title}</span>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>{r.ctx}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const Stat = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: "#3B82F6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4, marginTop: 1 }}>{value}</div>
  </div>
);

Object.assign(window, {
  ABMock523Weekly, ABMock523Daily, ABMock523Subject,
  TopBar523, LeftRail523, RightDock523,
  M523_SUBJ, M523_DAYS, M523_WEEK,
});
