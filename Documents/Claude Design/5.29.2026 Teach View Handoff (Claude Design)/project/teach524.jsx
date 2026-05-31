// teach524.jsx — Teach View (rebuilt to match the 5.24.26 reference image).
//
// Top bar:   MyCurricula · Grade 5 · Dashboard · Plan · Teach (active)
//            · Assess · Report · Resources · search · + · bell · help · avatar
// Sub-bar:   Week 12 · Math · numbered board tabs · + Add Board · Present
//            · Pop-Out · Duplicate · Full Screen
// Left rail: icon nav with labels (Lessons / Boards / Groups / Class /
//            Notes / Timer / Tools). Collapsible.
// Left pane: Lesson card · subject-lesson list · Teaching Boards thumbs.
// Center:    Drawing toolbar · widget canvas · floating tool dock.
// Right pane: Resources panel · grid/list · search · filter · thumb cards.
// Footer:    Panels · Lessons / Resources / Notes · Board N of 5 · Saved
//            · shortcuts.

const T = {
  pageBg: "#F4F6FB",
  ink: "#0B1220",
  ink2: "#4B5563",
  ink3: "#9CA3AF",
  line: "#E5E7EB",
  lineSoft: "#F1F2F6",
  blue: "#2563EB",
  blueTile: "#DBEAFE",
  blueDeep: "#1E3A8A",
  iCanBg: "#DBEAFE",
  purple: "#8B5CF6",
  rose: "#EC4899",
  amber: "#F59E0B",
  green: "#10B981",
  yel: "#FEF3C7",
  yelD: "#92400E",
  // group chip palette
  g1: "#A78BFA", g2: "#34D399", g3: "#F472B6", g4: "#FBBF24",
  // resource type palettes
  rPdf: { bg: "#FEE2E2", fg: "#991B1B", lbl: "PDF" },
  rSlides: { bg: "#FEF3C7", fg: "#92400E", lbl: "SLIDES" },
  rVideo: { bg: "#FCE7F3", fg: "#9D174D", lbl: "VIDEO" },
  rLink: { bg: "#E0E7FF", fg: "#3730A3", lbl: "LINK" },
  rDoc: { bg: "#DCFCE7", fg: "#166534", lbl: "DOC" },
  rImage: { bg: "#FED7AA", fg: "#9A3412", lbl: "IMAGE" },
  rTools: { bg: "#FECDD3", fg: "#9F1239", lbl: "TOOLS" }
};

// ── icons ──────────────────────────────────────────────────────────
const Icon = ({ name, s = 16, c = "currentColor" }) => {
  const p = {
    bell: <g><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z" /><path d="M10 21a2 2 0 0 0 4 0" /></g>,
    help: <g><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3M12 17h.01" /></g>,
    search: <g><circle cx="11" cy="11" r="6" /><path d="M21 21l-4.3-4.3" /></g>,
    plus: <g><path d="M12 5v14M5 12h14" /></g>,
    chevD: <g><path d="M6 9l6 6 6-6" /></g>,
    chevR: <g><path d="M9 6l6 6-6 6" /></g>,
    chevL: <g><path d="M15 6l-6 6 6 6" /></g>,
    chevUp: <g><path d="M18 15l-6-6-6 6" /></g>,
    x: <g><path d="M6 6l12 12M18 6L6 18" /></g>,
    play: <path d="M8 5v14l11-7z" />,
    pause: <g><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></g>,
    rotate: <g><path d="M3 12a9 9 0 0 1 15-6.7l3 2.7M21 4v6h-6" /></g>,
    expand: <g><path d="M15 3h6v6M3 21l7-7M9 21H3v-6M21 3l-7 7" /></g>,
    shrink: <g><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></g>,
    book: <g><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3V4z" /><path d="M19 17H7" /></g>,
    boards: <g><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></g>,
    users: <g><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" /></g>,
    classy: <g><path d="M12 3l10 5-10 5L2 8z" /><path d="M22 8v6M6 10v6a6 4 0 0 0 12 0v-6" /></g>,
    notes: <g><path d="M5 3h11l3 3v15H5z" /><path d="M9 8h8M9 12h8M9 16h5" /></g>,
    clock: <g><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
    tools: <g><path d="M14 6a4 4 0 0 0 6 6l-9 9a4 4 0 0 1-6-6z" /></g>,
    cog: <g><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15H4a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 11 3.6V3a2 2 0 0 1 4 0v.1A1.7 1.7 0 0 0 16 4.6h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 9v0a1.7 1.7 0 0 0 1.4 1H21a2 2 0 0 1 0 4z" /></g>,
    extLink: <g><path d="M14 4h6v6" /><path d="M10 14L20 4" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></g>,
    text: <g><path d="M5 6h14M12 6v13M9 19h6" /></g>,
    pen: <g><path d="M14 4l6 6L8 22H2v-6z" /></g>,
    rect: <rect x="4" y="5" width="16" height="14" rx="1" />,
    image: <g><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="9" cy="10" r="1.7" /><path d="M21 17l-5-5-10 9" /></g>,
    sticky: <g><path d="M5 3h11l4 4v14H5z" /><path d="M16 3v4h4" /></g>,
    table: <g><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 12h18M9 5v14M15 5v14" /></g>,
    more: <g><circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18" cy="12" r="1.7" /></g>,
    undo: <g><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10H8" /></g>,
    redo: <g><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h7" /></g>,
    pop: <g><path d="M14 4h6v6" /><path d="M10 14L20 4" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></g>,
    duplicate: <g><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M4 16V4h12" /></g>,
    full: <g><path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" /></g>,
    target: <g><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></g>,
    check: <path d="M5 12l4 4 10-10" />,
    bold: <path d="M7 5h6a3 3 0 0 1 0 6H7zM7 11h7a3 3 0 0 1 0 6H7z" fill="currentColor" />,
    italic: <g><path d="M10 5h8M6 19h8M14 5l-4 14" /></g>,
    underline: <g><path d="M7 5v8a5 5 0 0 0 10 0V5" /><path d="M5 21h14" /></g>,
    listOl: <g><path d="M10 6h11M10 12h11M10 18h11" /><path d="M4 6h2v3M4 9h3M4 13l3 3" /></g>,
    listUl: <g><circle cx="5" cy="6" r="1.4" fill="currentColor" /><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="5" cy="18" r="1.4" fill="currentColor" /><path d="M10 6h11M10 12h11M10 18h11" /></g>,
    timer: <g><circle cx="12" cy="13" r="8" /><path d="M9 1h6M12 5v8l3 2" /></g>,
    stopw: <g><circle cx="12" cy="14" r="7" /><path d="M9 2h6M12 14V9M19 7l1.5-1.5" /></g>,
    dice: <g><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="15" r="1.3" fill="currentColor" /><circle cx="9" cy="15" r="1.3" fill="currentColor" /></g>,
    poll: <g><path d="M5 18V8M11 18V4M17 18v-6" /></g>,
    groupAdd: <g><circle cx="9" cy="8" r="3" /><path d="M3 18a6 6 0 0 1 12 0M17 6v6M14 9h6" /></g>,
    light: <g><circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" /></g>,
    pip: <g><rect x="3" y="3" width="18" height="14" rx="1" /><rect x="12" y="11" width="9" height="7" rx="1" fill="currentColor" /></g>,
    arrow: <g><path d="M7 17L17 7M9 7h8v8" /></g>,
    boardSettings: <g><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></g>,
    plusCircle: <g><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></g>
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>);

};

// ── Top bar ────────────────────────────────────────────────────────
const TopBar = () =>
<div style={{
  display: "flex", alignItems: "center", gap: 12,
  padding: "9px 16px", background: "#fff",
  borderBottom: `1px solid ${T.line}`
}}>
    <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>MyCurricula</span>
    <span style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="side" s={15} /></span>
    <nav style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 4 }}>
      {[
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly", active: true },
    { id: "yearly", label: "Yearly" },
    { id: "curriculum", label: "Curriculum" }].
    map((t) =>
    <span key={t.id} style={{
      padding: "6px 16px", borderRadius: 8,
      fontSize: 13.5, fontWeight: 700,
      background: t.active ? T.ink : "transparent",
      color: t.active ? "#fff" : T.ink2
    }}>{t.label}</span>
    )}
    </nav>
    <span style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Week 12</span>
    <span style={{ fontSize: 12.5, color: T.ink2 }}>Friday · May 29 · 12:56 PM</span>
    <span style={{ fontSize: 11.5, color: T.ink3 }}>All changes saved</span>
    <span style={{ display: "inline-flex", gap: 8, color: T.ink3, marginLeft: 2 }}>
      <Icon name="undo" s={15} /> <Icon name="redo" s={15} />
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 4px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ padding: "3px 11px", borderRadius: 6, background: T.lineSoft, color: T.ink }}>Personal</span>
      <span style={{ padding: "3px 11px", color: T.rose }}>Team Curriculum</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="search" s={17} /></span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="timer" s={17} />
      <span style={{ position: "absolute", top: -5, right: -7, background: "#F97316", color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>29</span>
    </span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="bell" s={17} />
      <span style={{ position: "absolute", top: -5, right: -6, background: T.blue, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>4</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="more" s={17} /></span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="notes" s={17} />
      <span style={{ position: "absolute", top: -5, right: -6, background: T.rose, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>3</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="help" s={17} /></span>
    <span style={{
    width: 30, height: 30, borderRadius: 999,
    background: "linear-gradient(135deg, #FCD34D, #F472B6)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 800, color: "#fff"
  }}>LH</span>
    <span style={{ color: T.ink3 }}><Icon name="logout" s={16} /></span>
  </div>;


// ── Sub-toolbar (board tabs + Present + chrome buttons) ───────────
const SubBar = () =>
<div style={{
  display: "flex", alignItems: "center", gap: 12,
  padding: "8px 16px", background: "#fff",
  borderBottom: `1px solid ${T.line}`
}}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: T.ink }}>
      Week 12 <Icon name="chevD" s={13} />
    </span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: T.ink }}>
      Math <Icon name="chevD" s={13} />
    </span>
    <div style={{ flex: "0 0 auto", display: "flex", gap: 5, alignItems: "center", marginLeft: 6 }}>
      {[
    { n: 1, label: "Warm-Up", active: true },
    { n: 2, label: "Mini Lesson" },
    { n: 3, label: "Guided Practice" },
    { n: 4, label: "Centers" },
    { n: 5, label: "Exit Ticket" }].
    map((b) =>
    <span key={b.n} style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 12px", borderRadius: 999,
      background: b.active ? T.blueTile : "transparent",
      color: b.active ? T.blueDeep : T.ink,
      border: b.active ? `1px solid ${T.blue}` : `1px solid ${T.line}`,
      fontSize: 12.5, fontWeight: 600, cursor: "pointer"
    }}>
          <span style={{
        width: 18, height: 18, borderRadius: 999,
        background: b.active ? T.blue : T.lineSoft,
        color: b.active ? "#fff" : T.ink2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800
      }}>{b.n}</span>
          {b.label}
        </span>
    )}
      <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 999,
      border: `1px dashed ${T.ink3}`,
      fontSize: 12.5, fontWeight: 600, color: T.ink2
    }}>
        <Icon name="plus" s={13} /> Add Board <Icon name="chevD" s={12} />
      </span>
    </div>
    <div style={{ flex: 1 }} />
    <span style={{
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "7px 16px", background: T.blue, color: "#fff",
    borderRadius: 8, fontSize: 13, fontWeight: 700
  }}>
      <Icon name="play" s={13} c="currentColor" /> Present
    </span>
    {[
  { label: "Pop-Out", icon: "pop" },
  { label: "Duplicate", icon: "duplicate" },
  { label: "Full Screen", icon: "full" }].
  map((b) =>
  <span key={b.label} style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "6px 12px", border: `1px solid ${T.line}`, borderRadius: 8,
    fontSize: 12.5, fontWeight: 600, color: T.ink
  }}>
        <Icon name={b.icon} s={13} /> {b.label}
      </span>
  )}
  </div>;


// ── Left icon rail (52px) ─────────────────────────────────────────
const LeftRail = ({ collapsed }) => {
  const items = [
  { id: "lessons", lbl: "Lessons", icon: "book", active: !collapsed },
  { id: "boards", lbl: "Boards", icon: "boards" },
  { id: "groups", lbl: "Groups", icon: "users" },
  { id: "class", lbl: "Class", icon: "classy" },
  { id: "notes", lbl: "Notes", icon: "notes" },
  { id: "timer", lbl: "Timer", icon: "clock" },
  { id: "tools", lbl: "Tools", icon: "tools" }];

  return (
    <div style={{
      width: 64, flex: "0 0 auto",
      background: "#fff", borderRight: `1px solid ${T.line}`,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 0", gap: 14
    }}>
      {items.map((r) =>
      <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{
          width: 36, height: 36, borderRadius: 9,
          background: r.active ? T.ink : "transparent",
          color: r.active ? "#fff" : T.ink2,
          display: "inline-flex", alignItems: "center", justifyContent: "center"
        }}><Icon name={r.icon} s={17} /></span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: r.active ? T.ink : T.ink3 }}>{r.lbl}</span>
        </div>
      )}
    </div>);

};

// ── Left panel (Lesson + lessons list + Teaching Boards) ──────────
const LeftPanel = () =>
<div style={{
  width: 268, flex: "0 0 auto",
  background: "#fff", borderRight: `1px solid ${T.line}`,
  display: "flex", flexDirection: "column", overflow: "hidden", position: "relative"
}}>
    <span title="Minimize panel" style={{ position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 6, color: T.ink3, background: T.lineSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 }}><Icon name="chevL" s={13} /></span>
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      {/* Lesson card */}
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: T.blueTile, color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="book" s={14} /></span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>Lesson</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: T.ink3 }}><Icon name="more" s={14} /></span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink3, letterSpacing: 0.5, marginBottom: 3 }}>LESSON TEXT</div>
        <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.5, textWrap: "pretty", marginBottom: 10 }}>I can find three equivalent fractions for a given fraction.</div>
        <button style={{
        width: "100%", padding: "7px 11px",
        background: "#fff", border: `1px solid ${T.line}`, borderRadius: 7,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        fontSize: 12, fontWeight: 600, color: T.ink, cursor: "pointer"
      }}>Open full lesson <Icon name="extLink" s={12} /></button>
      </div>

      {/* Subject lessons list */}
      {[
    { subj: "MATH", icon: "📐", color: T.blue, tile: T.blueTile, deep: T.blueDeep, title: "Equivalent fractions warm-up", meta: "Sun · 5 min", active: true },
    { subj: "READING", icon: "📖", color: T.green, tile: "#D1FAE5", deep: "#065F46", title: "Wonder: Chs 14–17 — point of view", meta: "Sun · 40 min" },
    { subj: "WRITING", icon: "✎", color: T.purple, tile: "#EDE9FE", deep: "#5B21B6", title: "Lead sentence — three rewrites", meta: "Mon · 30 min" },
    { subj: "GRAMMAR", icon: "Ag", color: "#0D9488", tile: "#CCFBF1", deep: "#0F766E", title: "Past, present, future review", meta: "Tue · 25 min" },
    { subj: "SPELLING", icon: "Sp", color: T.rose, tile: "#FCE7F3", deep: "#9D174D", title: "List 12: introduction — Greek roots", meta: "Wed · 20 min" },
    { subj: "UFLI", icon: "Uf", color: "#EA580C", tile: "#FED7AA", deep: "#9A3412", title: "Lesson 84 — closed syllables", meta: "Thu · 30 min" }].
    map((l, i) =>
    <div key={i} style={{
      background: "#fff",
      border: l.active ? `1.5px solid ${T.blue}` : `1px solid ${T.line}`,
      borderRadius: 8, padding: "9px 11px", marginBottom: 6,
      boxShadow: l.active ? "0 1px 2px rgba(37,99,235,.12)" : "none"
    }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, background: l.tile, color: l.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{l.icon}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: l.deep, letterSpacing: 0.5, flex: 1 }}>{l.subj}</span>
            <span style={{ color: T.ink3 }}><Icon name="more" s={13} /></span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: l.active ? 700 : 500, color: T.ink, marginTop: 4, lineHeight: 1.3, textWrap: "pretty" }}>{l.title}</div>
          <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{l.meta}</div>
        </div>
    )}
      <button style={{
      width: "100%", padding: "7px 11px", marginTop: 4,
      background: "#fff", border: `1px dashed ${T.ink3}`, borderRadius: 7,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
      fontSize: 12, fontWeight: 600, color: T.ink2, cursor: "pointer"
    }}><Icon name="plus" s={12} /> Add lesson</button>
    </div>

    {/* Teaching Boards section */}
    <div style={{ borderTop: `1px solid ${T.line}`, padding: "10px 12px", background: "#FAFBFC" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: T.ink2, letterSpacing: 0.6, flex: 1, textTransform: "uppercase" }}>Teaching Boards</span>
        <span style={{ color: T.ink3 }}><Icon name="chevUp" s={13} /></span>
      </div>
      {[
    { n: 1, lbl: "Warm-Up", active: true },
    { n: 2, lbl: "Mini Lesson" },
    { n: 3, lbl: "Guided Practice" },
    { n: 4, lbl: "Centers" },
    { n: 5, lbl: "Exit Ticket" }].
    map((b, i) =>
    <div key={i} style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "5px 8px", marginBottom: 4,
      border: b.active ? `1.5px solid ${T.ink}` : `1px solid ${T.line}`,
      borderRadius: 7, background: "#fff"
    }}>
          <span style={{ width: 16, height: 16, borderRadius: 999, background: b.active ? T.ink : T.lineSoft, color: b.active ? "#fff" : T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800 }}>{b.n}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: b.active ? 700 : 500, color: T.ink }}>{b.lbl}</span>
          {/* mini thumb */}
          <span style={{ width: 38, height: 22, background: T.lineSoft, borderRadius: 3, display: "flex", padding: 2, gap: 2 }}>
            <span style={{ flex: 1, background: T.blueTile, borderRadius: 1 }} />
            <span style={{ flex: 1, background: T.yel, borderRadius: 1 }} />
          </span>
        </div>
    )}
      <button style={{
      width: "100%", padding: "6px 10px", marginTop: 4,
      background: "#fff", border: `1px dashed ${T.ink3}`, borderRadius: 7,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
      fontSize: 11.5, fontWeight: 600, color: T.ink2, cursor: "pointer"
    }}><Icon name="plus" s={12} /> Add board</button>
    </div>
  </div>;


// ── Canvas drawing toolbar ────────────────────────────────────────
const CanvasToolbar = () =>
<div style={{
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderBottom: `1px solid ${T.line}`,
  background: "#fff"
}}>
    {["arrow", "text", "pen", "rect", "image", "sticky", "table", "more"].map((n, i) =>
  <span key={i} style={{
    width: 28, height: 28, borderRadius: 7,
    background: i === 0 ? T.blueTile : "transparent",
    color: i === 0 ? T.blueDeep : T.ink2,
    display: "inline-flex", alignItems: "center", justifyContent: "center"
  }}><Icon name={n} s={15} /></span>
  )}
    <div style={{ flex: 1 }} />
    <span style={{ color: T.ink3 }}><Icon name="undo" s={15} /></span>
    <span style={{ color: T.ink3 }}><Icon name="redo" s={15} /></span>
    <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", border: `1px solid ${T.line}`, borderRadius: 7,
    fontSize: 12, fontWeight: 600, color: T.ink
  }}><Icon name="cog" s={13} /> Board settings</span>
    <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="expand" s={14} /></span>
    <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pip" s={14} /></span>
  </div>;


// ── Widget shell ──────────────────────────────────────────────────
const Widget = ({ kicker, kickerIcon = "more", tone = "#fff", padding = 14, gridCol, gridRow, headerRight, children, dragHandle }) =>
<div className="teach-widget" style={{
  background: tone, borderRadius: 12, border: `1px solid ${T.line}`,
  boxShadow: "0 1px 2px rgba(11,18,32,.04)",
  gridColumn: gridCol, gridRow: gridRow,
  display: "flex", flexDirection: "column", overflow: "hidden"
}}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", color: T.ink2 }}>
      {dragHandle && <Icon name="more" s={12} c={T.ink3} />}
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: T.ink2 }}>{kicker}</span>
      <div style={{ flex: 1 }} />
      {headerRight}
      <span className="teach-chrome" style={{ color: T.ink3, opacity: 0, transition: "opacity .15s" }}><Icon name="expand" s={12} /></span>
    </div>
    <div style={{ flex: 1, padding: `0 ${padding}px ${padding}px`, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>;


// ── Widget bodies ─────────────────────────────────────────────────
const ICanWidget = () =>
<Widget kicker="" gridCol="span 2" tone="transparent">
    <div style={{
    background: T.iCanBg, borderRadius: 12, padding: "16px 20px",
    display: "flex", alignItems: "center", gap: 16, height: "100%"
  }}>
      <span style={{
      width: 48, height: 48, borderRadius: 12, background: "#fff", color: T.blueDeep,
      display: "inline-flex", alignItems: "center", justifyContent: "center"
    }}><Icon name="target" s={26} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: T.blue, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>I CAN</span>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.blueDeep, letterSpacing: -0.3, lineHeight: 1.25, marginTop: 6 }}>Find three equivalent fractions for a given fraction.</div>
        <div style={{ fontSize: 11.5, color: T.blueDeep, marginTop: 6, fontWeight: 500 }}>
          Standard: <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.B.3</span> &nbsp;|&nbsp; <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.A.1</span>
        </div>
      </div>
    </div>
  </Widget>;


const TimerWidget = () =>
<Widget kicker="◷ VISUAL TIMER">
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: "100%" }}>
      <div style={{
      fontSize: 38, fontWeight: 800, color: T.ink, letterSpacing: -1,
      fontVariantNumeric: "tabular-nums"
    }}>08:14</div>
      <svg width="70" height="70" viewBox="0 0 70 70" style={{ flex: "0 0 auto" }}>
        <circle cx="35" cy="35" r="30" fill="none" stroke="#EDE9FE" strokeWidth="7" />
        <circle cx="35" cy="35" r="30" fill="none" stroke={T.purple} strokeWidth="7"
      strokeDasharray="188.5" strokeDashoffset="58" strokeLinecap="round" transform="rotate(-90 35 35)" />
      </svg>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <span style={{ width: 30, height: 30, borderRadius: 999, background: T.lineSoft, color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pause" s={13} /></span>
        <span style={{ width: 30, height: 30, borderRadius: 999, background: T.lineSoft, color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="rotate" s={13} /></span>
      </div>
    </div>
  </Widget>;


const GroupAvatar = ({ initials, color }) =>
<span style={{
  width: 22, height: 22, borderRadius: 999, background: color, color: "#fff",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 9, fontWeight: 800, letterSpacing: 0.3
}}>{initials}</span>;


const GroupsWidget = () => {
  const groups = [
  { n: 1, names: [["AJ", T.g1], ["CB", T.g2], ["EM", T.g3], ["KY", T.g4], ["LN", T.g1]] },
  { n: 2, names: [["MW", T.g2], ["NS", T.g3], ["OG", T.g4], ["PR", T.g1], ["TJ", T.g2]] },
  { n: 3, names: [["AR", T.g3], ["JC", T.g4], ["KM", T.g1], ["LO", T.g2], ["SY", T.g3]] },
  { n: 4, names: [["BD", T.g4], ["HC", T.g1], ["IZ", T.g2], ["MJ", T.g3], ["RV", T.g4]] }];

  return (
    <Widget kicker="▦ STUDENT GROUPS">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        {groups.map((g) =>
        <div key={g.n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, width: 56, flex: "0 0 auto" }}>Group {g.n}</span>
            <span style={{ fontSize: 11, color: T.ink3, marginRight: 2 }}>5 students</span>
            <div style={{ flex: 1, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              {g.names.map(([init, col], i) => <GroupAvatar key={i} initials={init} color={col} />)}
              <span style={{ width: 22, height: 22, borderRadius: 999, border: `1px dashed ${T.ink3}`, color: T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>+</span>
            </div>
          </div>
        )}
        <button style={{
          marginTop: 2, padding: "5px 0", background: "transparent",
          color: T.blue, fontSize: 11.5, fontWeight: 700, border: 0,
          textAlign: "left", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer"
        }}><Icon name="plus" s={12} /> Add group</button>
      </div>
    </Widget>);

};

// Bar model for the Model It widget — single bar partitioned in halves/
// thirds/sixths/ninths to show 2/3 = 4/6 = 6/9.
const ModelBar = ({ parts, filled, color, deep }) =>
<div style={{ display: "flex", gap: 0, border: `1.5px solid ${deep}`, borderRadius: 6, overflow: "hidden", height: 70 }}>
    {Array.from({ length: parts }).map((_, i) =>
  <div key={i} style={{
    flex: 1,
    background: i < filled ? color : "#fff",
    borderRight: i < parts - 1 ? `1.5px solid ${deep}` : "none"
  }} />
  )}
  </div>;


const ModelWidget = () =>
<Widget kicker="⌗ MODEL IT">
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, color: T.ink, fontSize: 13 }}>
        Find three equivalent fractions for{" "}
        <Frac n="2" d="3" big />
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ModelBar parts={3} filled={2} color="#DDD6FE" deep="#5B21B6" />
          <div style={{ textAlign: "center", color: T.ink }}><Frac n="2" d="3" /></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ModelBar parts={6} filled={4} color="#DDD6FE" deep="#5B21B6" />
          <div style={{ textAlign: "center", color: T.ink }}><Frac n="4" d="6" /></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ModelBar parts={9} filled={6} color="#DDD6FE" deep="#5B21B6" />
          <div style={{ textAlign: "center", color: T.ink }}><Frac n="6" d="9" /></div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", color: T.ink, fontSize: 16, fontWeight: 700, alignItems: "center" }}>
        <span><Frac n="2" d="3" /></span>
        <span style={{ color: T.ink2 }}>=</span>
        <span><Frac n="4" d="6" /></span>
        <span style={{ color: T.ink2 }}>=</span>
        <span><Frac n="6" d="9" /></span>
      </div>
    </div>
  </Widget>;


const Frac = ({ n, d, big }) =>
<span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", margin: "0 2px" }}>
    <span style={{ fontSize: big ? 18 : 14, fontWeight: 700, lineHeight: 1 }}>{n}</span>
    <span style={{ width: "100%", borderTop: `1.5px solid currentColor`, margin: "1px 0" }} />
    <span style={{ fontSize: big ? 18 : 14, fontWeight: 700, lineHeight: 1 }}>{d}</span>
  </span>;


const AgendaWidget = () => {
  const items = [
  { lbl: "Warm-Up", time: "8 min", state: "done" },
  { lbl: "Mini Lesson", time: "12 min", state: "todo" },
  { lbl: "Guided Practice", time: "15 min", state: "todo" },
  { lbl: "Centers", time: "20 min", state: "todo" },
  { lbl: "Exit Ticket", time: "5 min", state: "todo" }];

  return (
    <Widget kicker="☷ AGENDA">
      <div style={{ display: "flex", flexDirection: "column", gap: 7, height: "100%" }}>
        {items.map((it, i) => {
          const done = it.state === "done";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4, flex: "0 0 auto",
                background: done ? T.blue : "#fff",
                border: `1.5px solid ${done ? T.blue : T.ink3}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center"
              }}>{done && <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>}</span>
              <span style={{ width: 16, color: T.ink3 }}><Icon name="users" s={13} /></span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: T.ink, textDecoration: done ? "line-through" : "none" }}>{it.lbl}</span>
              <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{it.time}</span>
            </div>);

        })}
      </div>
    </Widget>);

};

const ManipulativesWidget = () =>
<Widget kicker="▢ MANIPULATIVES / IMAGE" gridCol="span 2">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100%" }}>
      {/* Fraction strips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[
      { p: 1, color: "#C7B2F4", deep: "#5B21B6", label: "1" },
      { p: 2, color: "#A7E1B5", deep: "#166534", label: "1/2" },
      { p: 3, color: "#A8D5FB", deep: "#1E3A8A", label: "1/3" },
      { p: 4, color: "#F7B576", deep: "#9A3412", label: "1/4" },
      { p: 6, color: "#F7D466", deep: "#92400E", label: "1/6" }].
      map((row, i) =>
      <div key={i} style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: row.p }).map((_, j) =>
        <div key={j} style={{
          flex: 1, height: 24, background: row.color,
          border: `1.5px solid ${row.deep}`, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: row.deep
        }}>{row.label}</div>
        )}
          </div>
      )}
      </div>
      {/* "Photo" placeholder of physical fraction tiles */}
      <div style={{
      background: "#9B8268", borderRadius: 10, padding: 10,
      display: "flex", flexDirection: "column", gap: 3, position: "relative",
      backgroundImage: "linear-gradient(135deg, #B89673 0%, #8A6F58 100%)"
    }}>
        {[
      [{ c: "#F1C7A3", w: "100%", t: "1" }],
      [{ c: "#7DD3A4", w: "48%", t: "1/2" }, { c: "#7DD3A4", w: "48%", t: "1/2" }],
      [{ c: "#FED884", w: "31%", t: "1/3" }, { c: "#FED884", w: "31%", t: "1/3" }, { c: "#FED884", w: "31%", t: "1/3" }],
      [{ c: "#F38FA5", w: "23%", t: "1/4" }, { c: "#F38FA5", w: "23%", t: "1/4" }, { c: "#F38FA5", w: "23%", t: "1/4" }, { c: "#F38FA5", w: "23%", t: "1/4" }],
      [{ c: "#F0E58A", w: "15%", t: "1/6" }, { c: "#F0E58A", w: "15%", t: "1/6" }, { c: "#F0E58A", w: "15%", t: "1/6" }, { c: "#F0E58A", w: "15%", t: "1/6" }, { c: "#F0E58A", w: "15%", t: "1/6" }, { c: "#F0E58A", w: "15%", t: "1/6" }]].
      map((row, i) =>
      <div key={i} style={{ display: "flex", gap: 3 }}>
            {row.map((cell, j) =>
        <div key={j} style={{
          flex: cell.w === "100%" ? 1 : undefined,
          width: cell.w === "100%" ? undefined : cell.w,
          height: 20, background: cell.c,
          borderRadius: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#5B3A1F",
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.5)"
        }}>{cell.t}</div>
        )}
          </div>
      )}
      </div>
    </div>
  </Widget>;


const NotesWidget = () =>
<Widget kicker="🗒 TEACHER NOTES" tone={T.yel}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ fontSize: 12.5, color: T.yelD, lineHeight: 1.6, fontFamily: "'Caveat', 'Comic Sans MS', cursive", textWrap: "pretty", flex: 1 }}>
        Circulate during centers. Check in with Group 3 on partitioning into equal parts. Use fraction strips if needed.
      </div>
      <div style={{ display: "flex", gap: 4, color: T.yelD }}>
        <span style={{ padding: 4, borderRadius: 5 }}><Icon name="bold" s={13} /></span>
        <span style={{ padding: 4, borderRadius: 5 }}><Icon name="italic" s={13} /></span>
        <span style={{ padding: 4, borderRadius: 5 }}><Icon name="underline" s={13} /></span>
        <span style={{ padding: 4, borderRadius: 5 }}><Icon name="listOl" s={13} /></span>
        <span style={{ padding: 4, borderRadius: 5 }}><Icon name="listUl" s={13} /></span>
      </div>
    </div>
  </Widget>;


// ── Tool dock (floating bottom) ──────────────────────────────────
const ToolDock = () =>
<div style={{
  position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
  background: "#fff", borderRadius: 14,
  boxShadow: "0 6px 20px rgba(11,18,32,.12), 0 1px 2px rgba(11,18,32,.06)",
  border: `1px solid ${T.line}`,
  padding: "8px 8px 8px 12px", display: "flex", alignItems: "center", gap: 4
}} data-comment-anchor="121c2ba329-div-658-1">
    {/* drag handle — bar can be moved / docked left or right */}
    <span title="Drag to dock left, right, or hide" style={{ color: T.ink3, cursor: "grab", marginRight: 2 }}><Icon name="drag" s={13} /></span>
    {[
  { ic: "arrow", lbl: "select", active: true },
  { ic: "text", lbl: "text" },
  { ic: "pen", lbl: "pen" },
  { ic: "sticky", lbl: "sticky" },
  { ic: "timer", lbl: "timer" },
  { ic: "stopw", lbl: "stopwatch" },
  { ic: "dice", lbl: "dice" },
  { ic: "poll", lbl: "poll" },
  { ic: "groupAdd", lbl: "group maker" },
  { ic: "light", lbl: "traffic light" }].
  map((t, i) =>
  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 8px", borderRadius: 8, background: t.active ? T.blueTile : "transparent", color: t.active ? T.blueDeep : T.ink2 }}>
        <Icon name={t.ic} s={17} />
        <span style={{ fontSize: 9.5, fontWeight: 600 }}>{t.lbl}</span>
      </div>
  )}
    <span style={{ width: 1, height: 26, background: T.line, margin: "0 4px" }} />
    {/* customize + reset to default */}
    <span title="Customize tools / reset to default" style={{ width: 30, height: 30, borderRadius: 8, color: T.ink2, background: T.lineSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="cog" s={15} /></span>
    <span title="Close bar" style={{ width: 30, height: 30, borderRadius: 8, color: T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="x" s={14} /></span>
  </div>;


// ── Right panel — Resources (grid default) ───────────────────────
const ResourcesPanel = ({ view = "grid", hoverItem }) => {
  const resources = [
  { type: T.rPdf, title: "Fraction Wall Poster", art: "wallposter" },
  { type: T.rSlides, title: "Equivalent Fractions Deck", art: "slidesdeck" },
  { type: T.rVideo, title: "Equivalent Fractions Explained", art: "video" },
  { type: T.rLink, title: "Khan Academy", art: "khan" },
  { type: T.rDoc, title: "Guided Practice Worksheet", art: "doc" },
  { type: T.rImage, title: "Fraction Tiles (Set of 5)", art: "tiles" },
  { type: T.rPdf, title: "Exit Ticket (Printable)", art: "exitticket" },
  { type: T.rTools, title: "Fraction Strips (Interactive)", art: "strips", hot: true }];

  return (
    <div style={{
      width: 312, flex: "0 0 auto", position: "relative",
      background: "#fff", borderLeft: `1px solid ${T.line}`,
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      <span title="Drag to resize" style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 6, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
        <span style={{ width: 3, height: 34, borderRadius: 999, background: T.line }} />
      </span>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <span title="Minimize panel" style={{ width: 22, height: 22, borderRadius: 6, color: T.ink3, background: T.lineSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 auto" }}><Icon name="chevR" s={13} /></span>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Resources</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: T.ink3 }}><Icon name="x" s={14} /></span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 11px", background: "#F3F4F6", borderRadius: 7,
            color: T.ink3, flex: 1
          }}>
            <Icon name="search" s={13} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Search resources…</span>
          </div>
          <span style={{ width: 28, height: 28, border: `1px solid ${T.line}`, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="boards" s={13} /></span>
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 10, padding: 2, background: T.lineSoft, borderRadius: 8, width: "fit-content" }}>
          <span style={{ padding: "4px 16px", borderRadius: 6, background: view === "grid" ? "#fff" : "transparent", color: view === "grid" ? T.ink : T.ink3, fontSize: 11.5, fontWeight: 700, boxShadow: view === "grid" ? "0 1px 2px rgba(0,0,0,.06)" : "none" }}>Grid</span>
          <span style={{ padding: "4px 16px", borderRadius: 6, background: view === "list" ? "#fff" : "transparent", color: view === "list" ? T.ink : T.ink3, fontSize: 11.5, fontWeight: 700 }}>List</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
          {["All", "Slides", "Handouts", "Tools"].map((c, i) =>
          <span key={c} style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
            background: i === 0 ? T.blue : "#fff",
            color: i === 0 ? "#fff" : T.ink2,
            border: i === 0 ? `1px solid ${T.blue}` : `1px solid ${T.line}`
          }}>{c}</span>
          )}
        </div>
        {/* Organize by lesson placement — filter to a section of the lesson */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 9 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, flex: "0 0 auto" }}>BY SECTION</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["All", "Warm-Up", "Mini Lesson", "Guided", "Centers", "Exit Ticket"].map((c, i) =>
            <span key={c} style={{
              padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: i === 0 ? T.blueTile : "#fff",
              color: i === 0 ? T.blueDeep : T.ink2,
              border: i === 0 ? `1px solid ${T.blue}55` : `1px solid ${T.line}`,
              display: "inline-flex", alignItems: "center", gap: 4
            }}>
              {i > 0 && <span style={{ width: 12, height: 12, borderRadius: 999, background: T.lineSoft, color: T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800 }}>{i}</span>}
              {c}
            </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {view === "grid" ?
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {resources.map((r, i) =>
          <ResThumb key={i} r={r} hovered={r.hot && hoverItem} />
          )}
          </div> :

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {resources.map((r, i) =>
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 7 }}>
                <span style={{ width: 26, height: 26, borderRadius: 6, background: r.type.bg, color: r.type.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>{r.type.lbl}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.ink }}>{r.title}</span>
                <span style={{ color: T.ink3 }}><Icon name="more" s={13} /></span>
              </div>
          )}
          </div>
        }
        <div style={{ marginTop: 10, padding: "8px 0", textAlign: "center", color: T.blue, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <Icon name="plus" s={13} /> Add resource
        </div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>86 resources</div>
      </div>
    </div>);

};

// Resource thumbnail card
const ResThumb = ({ r, hovered }) =>
<div style={{ position: "relative", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 9, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,18,32,.04)" }}>
    <span style={{ position: "absolute", top: 6, left: 6, padding: "1px 6px", background: "#fff", color: r.type.fg, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, borderRadius: 4, border: `1px solid ${r.type.bg}` }}>{r.type.lbl}</span>
    <span style={{ position: "absolute", top: 6, right: 6, color: T.ink3 }}><Icon name="more" s={12} /></span>
    <div style={{ height: 84, background: r.type.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ResArt kind={r.art} fg={r.type.fg} />
    </div>
    <div style={{ padding: "7px 9px 9px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.25, textWrap: "pretty" }}>{r.title}</div>
    </div>
    {hovered &&
  <div style={{
    position: "absolute", bottom: -2, right: -6,
    background: "#fff", borderRadius: 8,
    boxShadow: "0 8px 20px rgba(11,18,32,.18)",
    border: `1px solid ${T.line}`,
    padding: 5, width: 150, zIndex: 10
  }}>
        <div style={{ padding: "6px 9px", fontSize: 11.5, color: T.ink, fontWeight: 600, borderRadius: 5 }}>Embed to Board</div>
        <div style={{ padding: "6px 9px", fontSize: 11.5, color: T.ink, fontWeight: 600, borderRadius: 5, background: T.blueTile }}>Open Large</div>
      </div>
  }
  </div>;


// Tiny artwork per resource kind — pure CSS/SVG, no images
const ResArt = ({ kind, fg }) => {
  if (kind === "wallposter") return (
    <div style={{ width: 70, height: 50, display: "flex", flexDirection: "column", gap: 1 }}>
      {[1, 2, 3, 4].map((n) => <div key={n} style={{ flex: 1, display: "flex", gap: 1 }}>
        {Array.from({ length: n }).map((_, i) => <div key={i} style={{ flex: 1, background: ["#A8D5FB", "#FCD34D", "#FCA5A5", "#86EFAC"][n - 1] }} />)}
      </div>)}
    </div>);

  if (kind === "slidesdeck") return (
    <div style={{ fontSize: 11, fontWeight: 700, color: fg, display: "flex", alignItems: "center", gap: 5 }}>
      <Frac n="2" d="3" /><span>=</span><Frac n="4" d="6" /><span>=</span><Frac n="6" d="9" />
    </div>);

  if (kind === "video") return <span style={{ width: 36, height: 36, borderRadius: 999, background: "#fff", color: "#DC2626", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" s={16} /></span>;
  if (kind === "khan") return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}><div style={{ width: 22, height: 22, borderRadius: 999, background: "#0F9D58", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>K</div><div style={{ fontSize: 9, fontWeight: 700, color: fg }}>Khan Academy</div></div>;
  if (kind === "doc") return (
    <div style={{ width: 50, height: 56, background: "#fff", borderRadius: 3, padding: 4, display: "flex", flexDirection: "column", gap: 2 }}>
      {Array.from({ length: 7 }).map((_, i) => <div key={i} style={{ height: 2, background: T.lineSoft }} />)}
    </div>);

  if (kind === "tiles") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, width: 70 }}>
      {["#FCA5A5", "#86EFAC", "#FCD34D", "#7DD3FC", "#C4B5FD", "#F9A8D4"].map((c, i) =>
      <div key={i} style={{ background: c, height: 18, borderRadius: 2 }} />
      )}
    </div>);

  if (kind === "exitticket") return (
    <div style={{ width: 46, height: 56, background: "#FEE2E2", borderRadius: 3, padding: 4, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ height: 3, background: "#991B1B", width: "60%" }} />
      {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 2, background: "#FCA5A5" }} />)}
    </div>);

  if (kind === "strips") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 78 }}>
      <div style={{ height: 7, background: "#C7B2F4", borderRadius: 1 }} />
      <div style={{ display: "flex", gap: 2 }}><div style={{ flex: 1, height: 7, background: "#A7E1B5", borderRadius: 1 }} /><div style={{ flex: 1, height: 7, background: "#A7E1B5", borderRadius: 1 }} /></div>
      <div style={{ display: "flex", gap: 2 }}>{[0, 1, 2].map((i) => <div key={i} style={{ flex: 1, height: 7, background: "#A8D5FB", borderRadius: 1 }} />)}</div>
      <div style={{ display: "flex", gap: 2 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 7, background: "#F7B576", borderRadius: 1 }} />)}</div>
    </div>);

  return null;
};

// ── Footer ──────────────────────────────────────────────────────
const Footer = () =>
<div style={{
  display: "flex", alignItems: "center", gap: 16,
  padding: "8px 16px", background: "#fff",
  borderTop: `1px solid ${T.line}`, fontSize: 11.5, color: T.ink2
}}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
      Panels <Icon name="chevUp" s={12} />
    </span>
    <span style={{ fontWeight: 700, color: T.ink }}>Lessons</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Resources <span style={{ width: 5, height: 5, borderRadius: 999, background: T.green }} /></span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="notes" s={12} /> Notes</span>
    <div style={{ flex: 1 }} />
    <span>Board 1 of 5</span>
    <span style={{ color: T.ink3 }}>·</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon name="check" s={12} /> Saved to MyCurricula
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ color: T.ink3 }}>Shortcuts:</span>
    <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘P</span> Present</span>
    <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘/</span> Search</span>
    <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘?</span> Help</span>
  </div>;


// ── Right icon rail (when right panel is collapsed) ────────────────
const RightRail = () => {
  const items = [
  { id: "resources", lbl: "Resources", icon: "boards", active: true },
  { id: "chat", lbl: "Chat", icon: "notes" },
  { id: "todo", lbl: "To-do", icon: "boards" }];

  return (
    <div style={{
      width: 64, flex: "0 0 auto",
      background: "#fff", borderLeft: `1px solid ${T.line}`,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 0", gap: 14
    }}>
      {items.map((r) =>
      <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{
          width: 36, height: 36, borderRadius: 9,
          background: r.active ? T.ink : "transparent",
          color: r.active ? "#fff" : T.ink2,
          display: "inline-flex", alignItems: "center", justifyContent: "center"
        }}><Icon name={r.icon} s={17} /></span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: r.active ? T.ink : T.ink3 }}>{r.lbl}</span>
        </div>
      )}
    </div>);

};

// ── Full Teach shell ───────────────────────────────────────────────
const TeachShell = ({ leftCollapsed, rightCollapsed, resourcesView = "grid", hoverItem }) =>
<div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
    <TopBar />
    <SubBar />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail collapsed={leftCollapsed} />
      {!leftCollapsed && <LeftPanel />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
        <CanvasToolbar />
        <div style={{ flex: 1, position: "relative", padding: 18, overflow: "auto", background: "#fff" }}>
          <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gridTemplateRows: "120px 230px 230px",
          gap: 12
        }}>
            <ICanWidget />
            <TimerWidget />
            <Widget kicker="◷ COMPLETED" tone="transparent">{null}</Widget>
            <GroupsWidget />
            <ModelWidget />
            <AgendaWidget />
            <ManipulativesWidget />
            <NotesWidget />
          </div>
          <ToolDock />
        </div>
      </div>
      {rightCollapsed ? <RightRail /> : <ResourcesPanel view={resourcesView} hoverItem={hoverItem} />}
    </div>
    <Footer />
  </div>;


// Fix: ICan + Timer + Groups + Model + Agenda + Manipulatives + Notes
// laid out in a precise 4-column grid mirroring the reference:
//   Row 1 (120px): I CAN spans cols 1-3, TIMER col 4
//   Row 2 (230px): GROUPS cols 1-2, MODEL IT cols 3-4    — wait, the
//                   reference has GROUPS + MODEL IT (both wider) and an
//                   AGENDA column on the right
// Simpler & truer: 4 cols, with widget spans matching the screenshot.
// I'll redefine the layout below in ABTeachDefault using explicit
// gridColumn props on each widget.
const ABTeachDefault = () =>
<div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
    <TopBar />
    <SubBar />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail />
      <LeftPanel />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
        <CanvasToolbar />
        <div style={{ flex: 1, position: "relative", padding: 18, overflow: "auto", background: "#fff" }}>
          <div style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.1fr 1fr",
          gridTemplateRows: "120px 220px 240px",
          gap: 12,
          maxWidth: 1080, margin: "0 auto"
        }}>
            <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
            <TimerWidget />
            <GroupsWidget />
            <ModelWidget />
            <AgendaWidget />
            <ManipulativesWidget />
            <NotesWidget />
          </div>
          <ToolDock />
        </div>
      </div>
      <ResourcesPanel view="grid" hoverItem />
    </div>
    <Footer />
  </div>;


// I Can without the wrapper Widget (we want it to fill its grid cell directly)
const ICanWidgetRaw = () =>
<div style={{
  background: T.iCanBg, borderRadius: 12, padding: "16px 20px",
  display: "flex", alignItems: "center", gap: 16, height: "100%",
  position: "relative"
}} data-comment-anchor="9242d6d1ab-div-969-3">
    <span style={{
    width: 44, height: 44, borderRadius: 11, background: "#fff", color: T.blueDeep,
    display: "inline-flex", alignItems: "center", justifyContent: "center"
  }}><Icon name="target" s={24} /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: T.blue, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>I CAN</span>
      <div style={{ fontSize: 19, fontWeight: 700, color: T.blueDeep, letterSpacing: -0.3, lineHeight: 1.25, marginTop: 5 }}>Find three equivalent fractions for a given fraction.</div>
      <div style={{ fontSize: 11.5, color: T.blueDeep, marginTop: 4, fontWeight: 500 }}>
        Standard: <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.B.3</span> &nbsp;|&nbsp; <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.A.1</span>
      </div>
    </div>
  </div>;


// Collapsed-rails variant
const ABTeachCollapsed = () =>
<div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
    <TopBar />
    <SubBar />
    <div style={{
    padding: "6px 14px", background: T.blueTile, color: T.blueDeep,
    fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
    borderBottom: `1px solid ${T.line}`
  }}>
      <span style={{ fontSize: 10, padding: "1px 7px", background: T.blueDeep, color: "#fff", borderRadius: 999, letterSpacing: 0.5, fontWeight: 800 }}>COLLAPSED</span>
      Both side panels are collapsed into 64px icon rails. Tap any icon to expand the rail back into the full panel.
    </div>
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail collapsed />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
        <CanvasToolbar />
        <div style={{ flex: 1, position: "relative", padding: 18, overflow: "auto", background: "#fff" }}>
          <div style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.1fr 1fr",
          gridTemplateRows: "120px 220px 240px",
          gap: 12,
          maxWidth: 1280, margin: "0 auto"
        }}>
            <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
            <TimerWidget />
            <GroupsWidget />
            <ModelWidget />
            <AgendaWidget />
            <ManipulativesWidget />
            <NotesWidget />
          </div>
          <ToolDock />
        </div>
      </div>
      <RightRail />
    </div>
    <Footer />
  </div>;


// ────────────────────────────────────────────────────────────────────
// T14 · Streamlined default — resource-focus IS the default view.
//   • Center = the open resource (T4 style), full-bleed.
//   • Right = Resources panel docked open by default.
//   • Left = a slim 56px hover-rail with Lessons / Widgets / Boards
//     tabs. Hovering (or clicking) a tab slides its panel open, the
//     same way the Resources panel opens. Collapsed by default to keep
//     the canvas maximal + minimal.
// ────────────────────────────────────────────────────────────────────
const HoverRailTab = ({ icon, label, active }) =>
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
    <span style={{
    width: 38, height: 38, borderRadius: 10,
    background: active ? T.blueTile : "transparent",
    color: active ? T.blueDeep : T.ink2,
    display: "inline-flex", alignItems: "center", justifyContent: "center"
  }}><Icon name={icon} s={18} /></span>
    <span style={{ fontSize: 9, fontWeight: 600, color: active ? T.blueDeep : T.ink3 }}>{label}</span>
  </div>;


// Slim hover-expand library rail. Shows the rail; the expanded flyout
// panel is rendered to its right (peeking open to show the behavior).
const LibraryHoverRail = ({ openTab }) =>
<div style={{ display: "flex", flex: "0 0 auto", position: "relative" }}>
    <div style={{
    width: 56, flex: "0 0 auto",
    background: "#fff", borderRight: `1px solid ${T.line}`,
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "14px 0", gap: 16
  }}>
      <HoverRailTab icon="book" label="Lessons" active={openTab === "lessons"} />
      <HoverRailTab icon="grid" label="Widgets" active={openTab === "widgets"} />
      <HoverRailTab icon="boards" label="Boards" active={openTab === "boards"} />
      <div style={{ flex: 1 }} />
      <span style={{ color: T.ink3 }}><Icon name="cog" s={17} /></span>
    </div>
    {/* Flyout panel — opens on hover, like Resources */}
    {openTab === "widgets" &&
  <div style={{
    width: 220, flex: "0 0 auto",
    background: "#fff", borderRight: `1px solid ${T.line}`,
    boxShadow: "8px 0 24px rgba(11,18,32,.06)",
    display: "flex", flexDirection: "column"
  }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Widget Library</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: T.ink3 }}><Icon name="x" s={13} /></span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {[
        { lbl: "Timer", bg: "#FEF3C7", fg: "#92400E", g: "◷" },
        { lbl: "I Can", bg: "#DBEAFE", fg: "#1E3A8A", g: "✓" },
        { lbl: "Groups", bg: "#D1FAE5", fg: "#065F46", g: "▦" },
        { lbl: "Agenda", bg: "#FCE7F3", fg: "#9D174D", g: "☷" },
        { lbl: "Notes", bg: "#FEF3C7", fg: "#92400E", g: "✎" },
        { lbl: "Model It", bg: "#D1FAE5", fg: "#065F46", g: "▭" },
        { lbl: "Slides", bg: "#DBEAFE", fg: "#1E3A8A", g: "▦" },
        { lbl: "YouTube", bg: "#FEE2E2", fg: "#991B1B", g: "▷" },
        { lbl: "Poll", bg: "#EDE9FE", fg: "#5B21B6", g: "✦" },
        { lbl: "Names", bg: "#FED7AA", fg: "#9A3412", g: "★" }].
        map((w, i) =>
        <div key={i} style={{ background: w.bg, borderRadius: 9, padding: "11px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "grab" }}>
                <span style={{ fontSize: 19, color: w.fg, fontWeight: 800, lineHeight: 1 }}>{w.g}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: w.fg }}>{w.lbl}</span>
              </div>
        )}
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: T.ink3, textAlign: "center", lineHeight: 1.5 }}>Drag any widget onto the board, or tap to add.</div>
        </div>
      </div>
  }
  </div>;


// Center resource viewer (reuses the T4 PDF viewer pieces, full-bleed)
const StreamlinedCenter = () =>
<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Fraction Wall Poster (Printable).pdf</span>
      <div style={{ flex: 1 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink }}>1 <span style={{ color: T.ink3 }}>/ 1</span></span>
      <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>−</span>
      <span style={{ padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink }}>100%</span>
      <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>+</span>
      <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="full" s={13} /></span>
    </div>
    <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <PdfPreview />
      <AnnotationToolbar />
    </div>
    <BoardScroller />
  </div>;

// Bottom board scroller — prev / next arrows + board pager + an
// "All boards" text icon that opens the board overview (scroll, select,
// add) without needing the Teaching Boards panel.
const BoardScroller = () =>
<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${T.line}`, background: "#fff" }}>
    <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="chevL" s={14} /></span>
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      {[
    { n: 1, lbl: "Warm-Up", active: true },
    { n: 2, lbl: "Mini Lesson" },
    { n: 3, lbl: "Guided" },
    { n: 4, lbl: "Centers" },
    { n: 5, lbl: "Exit Ticket" }].
    map((b) =>
    <span key={b.n} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 11px", borderRadius: 999,
      background: b.active ? T.blueTile : "transparent",
      color: b.active ? T.blueDeep : T.ink2,
      border: b.active ? `1px solid ${T.blue}55` : `1px solid transparent`,
      fontSize: 11.5, fontWeight: 700, cursor: "pointer"
    }}>
          <span style={{ width: 15, height: 15, borderRadius: 999, background: b.active ? T.blue : T.lineSoft, color: b.active ? "#fff" : T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 800 }}>{b.n}</span>
          {b.lbl}
        </span>
    )}
    </div>
    <span title="Show all boards" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}><Icon name="grid" s={13} /> All boards</span>
    <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="chevR" s={14} /></span>
  </div>;


function ABTeachStreamlined({ openTab = null }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <LibraryHoverRail openTab={openTab} />
        <StreamlinedCenter />
        <ResourcesPanel view="grid" />
        <RightRail />
        <FloatingTeachBar side="right" />
      </div>
      <Footer />
    </div>);

}

// Vertical docked variant of the live-board tool bar — when the bar is
// docked to the left or right edge instead of floating at the bottom.
const DockedTeachBar = ({ side = "left" }) =>
<div style={{
  width: 46, flex: "0 0 auto",
  background: "#fff",
  [side === "left" ? "borderRight" : "borderLeft"]: `1px solid ${T.line}`,
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "10px 0", gap: 6,
}}>
    <span title="Drag to undock / move" style={{ color: T.ink3, cursor: "grab" }}><Icon name="drag" s={12} /></span>
    {[
    { ic: "arrow", active: true },
    { ic: "text" }, { ic: "pen" }, { ic: "sticky" },
    { ic: "timer" }, { ic: "stopw" }, { ic: "dice" },
    { ic: "poll" }, { ic: "groupAdd" }, { ic: "light" }].
    map((t, i) =>
    <span key={i} style={{ width: 32, height: 32, borderRadius: 8, background: t.active ? T.blueTile : "transparent", color: t.active ? T.blueDeep : T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={t.ic} s={16} />
      </span>
    )}
    <div style={{ flex: 1 }} />
    <span title="Customize / reset to default" style={{ width: 30, height: 30, borderRadius: 8, background: T.lineSoft, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="cog" s={14} /></span>
  </div>;

// Floating variant of the live-board tool bar — a rounded vertical pill
// that hovers over the board on the left or right edge (not docked in flow).
const FloatingTeachBar = ({ side = "right" }) =>
<div style={{
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  [side]: 16, zIndex: 5,
  background: "#fff", borderRadius: 14,
  boxShadow: "0 6px 20px rgba(11,18,32,.14), 0 1px 2px rgba(11,18,32,.06)",
  border: `1px solid ${T.line}`,
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "8px 6px", gap: 5,
}}>
    <span title="Drag to move / dock" style={{ color: T.ink3, cursor: "grab" }}><Icon name="drag" s={12} /></span>
    {[
    { ic: "arrow", active: true },
    { ic: "text" }, { ic: "pen" }, { ic: "sticky" },
    { ic: "timer" }, { ic: "stopw" }, { ic: "dice" },
    { ic: "poll" }, { ic: "groupAdd" }, { ic: "light" }].
    map((t, i) =>
    <span key={i} style={{ width: 32, height: 32, borderRadius: 8, background: t.active ? T.blueTile : "transparent", color: t.active ? T.blueDeep : T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={t.ic} s={16} />
      </span>
    )}
    <span style={{ width: 22, height: 1, background: T.line, margin: "2px 0" }} />
    <span title="Customize / reset to default" style={{ width: 30, height: 30, borderRadius: 8, background: T.lineSoft, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="cog" s={14} /></span>
  </div>;

Object.assign(window, {
  ABTeachDefault, ABTeachCollapsed, ABTeachResourceFocus, ABTeachResourceFocusCollapsed,
  ABTeachWidgetPicker, ABTeachPresent, ABTeachFocus, ABTeachDragDrop,
  ABTeachEmpty, ABTeachMiniLesson, ABTeachPopOut,
  ABTeachSimplified, ABTeachInTeachMode, ABTeachStreamlined,
  ABTeachPanelMouseover, ABTeachPanelsTabbed, ABTeachPanelDragged, ABTeachZoneModel,
  ABStartTeaching, ABAutoAdvance, ABCarryTomorrow, ABStudentToggle, ABRecentResources
});

// ────────────────────────────────────────────────────────────────────
// UX power-features (mockups)
// ────────────────────────────────────────────────────────────────────

// U1 · One-tap "Start teaching" from Weekly/Daily — a NOW banner that
// jumps straight into Teach mode for the current time-block lesson.
function ABStartTeaching() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
        {/* NOW banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: T.iCanBg, border: `1px solid ${T.blue}33`, borderRadius: 16, padding: "16px 20px", marginBottom: 16 }}>
          <span style={{ width: 52, height: 52, borderRadius: 13, background: T.blue, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="clock" s={26} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#16A34A", padding: "2px 9px", borderRadius: 999, letterSpacing: 0.5 }}>▶ NOW · 9:10–9:45</span>
              <span style={{ fontSize: 11.5, color: T.blueDeep, fontWeight: 700 }}>Math · Period 2</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, marginTop: 5, letterSpacing: -0.3 }}>Equivalent fractions warm-up</div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>5 boards ready · Warm-Up is up first</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", background: T.ink, color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 800 }}>
            <Icon name="play" s={18} /> Start teaching
          </span>
        </div>
        {/* Up-next strip */}
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink3, letterSpacing: 0.6, marginBottom: 8 }}>UP NEXT TODAY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
          { t: "9:50–10:20", subj: "UFLI", title: "Lesson 84 — closed syllables", c: "#EA580C", bg: "#FED7AA" },
          { t: "10:20–11:00", subj: "READING", title: "Wonder, chs 14–17 — point of view", c: "#065F46", bg: "#D1FAE5" },
          { t: "12:40–1:10", subj: "WRITING", title: "Lead sentences — three rewrites", c: "#5B21B6", bg: "#EDE9FE" }].
          map((l, i) =>
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.ink2, width: 84, flex: "0 0 auto" }}>{l.t}</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: l.c, background: l.bg, padding: "2px 8px", borderRadius: 6, letterSpacing: 0.4, width: 70, flex: "0 0 auto", textAlign: "center" }}>{l.subj}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{l.title}</span>
              <span style={{ padding: "5px 12px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 11.5, fontWeight: 700, color: T.ink2, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="play" s={11} /> Teach</span>
            </div>
          )}
        </div>
      </div>
    </div>);
}

// U2 · Auto-advance boards by agenda timing
function ABAutoAdvance() {
  const boards = [
    { n: 1, lbl: "Warm-Up", min: 8, state: "done" },
    { n: 2, lbl: "Mini Lesson", min: 12, state: "now", elapsed: 9 },
    { n: 3, lbl: "Guided Practice", min: 15, state: "next" },
    { n: 4, lbl: "Centers", min: 20, state: "next" },
    { n: 5, lbl: "Exit Ticket", min: 5, state: "next" },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Auto-advance control */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: T.blueTile, color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="timer" s={19} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Auto-advance by agenda timing</div>
              <div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>When a board's timer ends, nudge me — or move on automatically.</div>
            </div>
            <span style={{ display: "inline-flex", padding: 2, background: T.lineSoft, borderRadius: 999 }}>
              <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: T.ink2 }}>Off</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: "#fff", color: T.ink, boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>Nudge</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: T.ink2 }}>Auto</span>
            </span>
          </div>
          {/* Board timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {boards.map((b, i) => {
              const done = b.state === "done", now = b.state === "now";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: now ? T.iCanBg : "#fff", border: now ? `1.5px solid ${T.blue}` : `1px solid ${T.line}`, borderRadius: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: done ? "#16A34A" : (now ? T.blue : T.lineSoft), color: done || now ? "#fff" : T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{done ? "✓" : b.n}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: now ? 800 : 600, color: T.ink }}>{b.lbl}</span>
                  {now &&
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 120, height: 6, background: "#fff", borderRadius: 999, overflow: "hidden", border: `1px solid ${T.blue}33` }}>
                        <div style={{ width: `${b.elapsed / b.min * 100}%`, height: "100%", background: T.blue }} />
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.blueDeep }}>{b.min - b.elapsed} min left</span>
                    </div>
                  }
                  {!now && <span style={{ fontSize: 11.5, color: T.ink3, fontWeight: 600 }}>{b.min} min</span>}
                </div>);
            })}
          </div>
          {/* Nudge toast */}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, background: T.ink, color: "#fff", borderRadius: 12, padding: "12px 16px" }}>
            <span style={{ fontSize: 18 }}>⏰</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Mini Lesson time is almost up</div>
              <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>Move to Guided Practice?</div>
            </div>
            <span style={{ padding: "6px 14px", background: T.blue, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Next board →</span>
            <span style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff" }}>+2 min</span>
          </div>
        </div>
      </div>
    </div>);
}

// U3 · "Carry to tomorrow" on an unfinished board
function ABCarryTomorrow() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink3, letterSpacing: 0.6, marginBottom: 8 }}>END OF DAY · UNFINISHED BOARDS</div>
          {[
          { lbl: "Centers", subj: "Reading", taught: false },
          { lbl: "Exit Ticket", subj: "Math", taught: false }].
          map((b, i) =>
          <div key={i} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#9A3412", background: "#FED7AA", padding: "2px 8px", borderRadius: 6, letterSpacing: 0.4 }}>NOT TAUGHT</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{b.lbl}</span>
                <span style={{ fontSize: 11.5, color: T.ink3 }}>· {b.subj}</span>
                <div style={{ flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: T.blue, color: "#fff", borderRadius: 9, fontSize: 12.5, fontWeight: 700 }}><Icon name="chevR" s={13} /> Carry to tomorrow</span>
                <span style={{ padding: "8px 14px", border: `1px solid ${T.line}`, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: T.ink }}>Pick a day…</span>
                <span style={{ padding: "8px 14px", border: `1px solid ${T.line}`, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>Mark done</span>
                <span style={{ padding: "8px 14px", border: `1px solid ${T.line}`, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>Skip</span>
              </div>
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.iCanBg, borderRadius: 12 }}>
            <span style={{ fontSize: 18 }}>↪</span>
            <span style={{ fontSize: 12.5, color: T.blueDeep, fontWeight: 600 }}>Carried boards land on tomorrow's plan and appear in the <strong>Catch-up</strong> list automatically.</span>
          </div>
        </div>
      </div>
    </div>);
}

// U4 · Quick student-facing toggle (hide teacher-only chrome)
function ABStudentToggle() {
  const Card = ({ studentMode }) =>
  <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}`, background: studentMode ? "#16A34A" : T.lineSoft }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: studentMode ? "#fff" : T.ink2, letterSpacing: 0.5 }}>{studentMode ? "👁 STUDENT-FACING" : "TEACHER VIEW"}</span>
      </div>
      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: T.iCanBg, borderRadius: 10, padding: "12px 14px" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: T.blue, padding: "2px 7px", borderRadius: 4 }}>I CAN</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.blueDeep, marginTop: 5 }}>Find three equivalent fractions.</div>
        </div>
        {!studentMode &&
        <div style={{ background: T.yel, borderRadius: 10, padding: "10px 12px" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#92400E", letterSpacing: 0.4 }}>🗒 TEACHER NOTES (hidden from students)</span>
            <div style={{ fontSize: 11.5, color: "#92400E", marginTop: 4 }}>Pull Aya, Tariq, Lara if still on array model.</div>
          </div>
        }
        <div style={{ background: "#FAFBFC", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink }}>Bake-sale: 5 cookies ÷ 4 friends</div>
          {!studentMode &&
          <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 700, marginTop: 4 }}>✓ Answer: 5/4 = 1¼ (hidden from students)</div>
          }
        </div>
      </div>
    </div>;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Student-facing toggle</div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>One switch hides notes + answers for projection — lighter than full Present mode.</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", border: `1px solid ${T.line}`, borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: T.ink }}>
            <span style={{ width: 32, height: 18, borderRadius: 999, background: "#16A34A", position: "relative" }}><span style={{ position: "absolute", top: 2, left: 16, width: 14, height: 14, borderRadius: 999, background: "#fff" }} /></span>
            Student view ON
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, height: 360 }}>
          <Card studentMode={false} />
          <Card studentMode={true} />
        </div>
      </div>
    </div>);
}

// U5 · Resource "recently used in this unit"
function ABRecentResources() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, background: "#fff" }} />
        <div style={{ width: 320, flex: "0 0 auto", background: "#fff", borderLeft: `1px solid ${T.line}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 14.5, fontWeight: 800, color: T.ink }}>Resources</div>
          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {/* Recently used in this unit */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Icon name="clock" s={12} c={T.blueDeep} />
              <span style={{ fontSize: 10, fontWeight: 800, color: T.blueDeep, letterSpacing: 0.5 }}>RECENTLY USED IN UNIT 3 · FRACTIONS</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
              { ty: T.rSlides, t: "Bar models deck", used: "Mon" },
              { ty: T.rPdf, t: "Fraction strips", used: "Tue" },
              { ty: T.rVideo, t: "Fraction Basics", used: "Tue" },
              { ty: T.rTools, t: "Fraction tiles", used: "Wed" }].
              map((r, i) =>
              <div key={i} style={{ border: `1px solid ${T.blue}33`, borderRadius: 9, overflow: "hidden", background: T.iCanBg }}>
                  <div style={{ height: 50, background: r.ty.bg, display: "flex", alignItems: "center", justifyContent: "center", color: r.ty.fg, fontSize: 9, fontWeight: 800 }}>{r.ty.lbl}</div>
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink, lineHeight: 1.25 }}>{r.t}</div>
                    <div style={{ fontSize: 9, color: T.blueDeep, fontWeight: 700, marginTop: 2 }}>used {r.used}</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, marginBottom: 8 }}>ALL RESOURCES</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[T.rPdf, T.rSlides, T.rDoc, T.rLink].map((ty, i) =>
              <div key={i} style={{ border: `1px solid ${T.line}`, borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ height: 50, background: ty.bg, display: "flex", alignItems: "center", justifyContent: "center", color: ty.fg, fontSize: 9, fontWeight: 800 }}>{ty.lbl}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>);
}

// ────────────────────────────────────────────────────────────────────
// Panel-behavior artboards (Tim's review)
//   Zone model: left panel + right panel each hold up to 3 stacked
//   widgets/panels; the center holds the live teaching board (with
//   unlimited slides, each carrying its own resources + assessments).
//   Widgets are KINDS that can live on the board OR as a panel.
// ────────────────────────────────────────────────────────────────────

// A reusable docked widget-panel (used in the stacks)
const DockPanel = ({ kicker, accent, children, tall }) =>
<div style={{
  background: "#fff", borderRadius: 10, border: `1px solid ${T.line}`,
  boxShadow: "0 1px 2px rgba(11,18,32,.04)", overflow: "hidden",
  display: "flex", flexDirection: "column", flex: tall ? 1 : "0 0 auto"
}}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: `1px solid ${T.lineSoft}` }}>
      <Icon name="drag" s={11} c={T.ink3} />
      <span style={{ fontSize: 9.5, fontWeight: 800, color: accent || T.ink2, letterSpacing: 0.5 }}>{kicker}</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: T.ink3 }}><Icon name="more" s={12} /></span>
    </div>
    <div style={{ flex: 1, padding: 10, minHeight: 0 }}>{children}</div>
  </div>;

const StackHint = ({ side }) =>
<div style={{ fontSize: 9, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, textTransform: "uppercase", padding: "0 2px 4px" }}>
    {side} · up to 3
  </div>;

// Mini live-board for these artboards
const MiniLiveBoard = ({ dropHot }) =>
<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Live Teaching Board</span>
      <span style={{ fontSize: 10.5, color: T.ink3 }}>Warm-Up · Slide 1 of 3</span>
      <div style={{ flex: 1 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: T.blue, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700 }}><Icon name="play" s={12} /> Teach mode</span>
    </div>
    <div style={{ flex: 1, padding: 16, background: "#fff", display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
      <div style={{ background: T.iCanBg, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: "#fff", color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="target" s={22} /></span>
        <div>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: T.blue, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>I CAN</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.blueDeep, marginTop: 5, letterSpacing: -0.2 }}>Find three equivalent fractions for a given fraction.</div>
        </div>
      </div>
      <div style={{
      flex: 1, borderRadius: 12,
      border: dropHot ? `2px dashed ${T.blue}` : `1.5px dashed ${T.line}`,
      background: dropHot ? `${T.blue}0d` : "#FAFBFC",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      color: dropHot ? T.blueDeep : T.ink3
    }}>
        <Icon name={dropHot ? "plus" : "image"} s={26} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{dropHot ? "Drop here — add to this slide" : "Slide canvas · resources & assessments live here"}</span>
      </div>
      {/* slide pager */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevL" s={12} /></span>
        {[1, 2, 3].map((n) =>
      <span key={n} style={{ width: n === 1 ? 22 : 8, height: 8, borderRadius: 999, background: n === 1 ? T.blue : T.line }} />
      )}
        <span style={{ width: 24, height: 24, borderRadius: 6, border: `1px dashed ${T.ink3}`, color: T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" s={12} /></span>
        <span style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevR" s={12} /></span>
      </div>
    </div>
  </div>;

// Shared shell for these artboards
const PanelShell = ({ left, right, banner, dropHot }) =>
<div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
    <TopBarLesson />
    <SubBar />
    {banner &&
  <div style={{ padding: "6px 14px", background: T.blueTile, color: T.blueDeep, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 10, padding: "1px 7px", background: T.blueDeep, color: "#fff", borderRadius: 999, letterSpacing: 0.5, fontWeight: 800 }}>BEHAVIOR</span>
        {banner}
      </div>
  }
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <LeftRail collapsed />
      {left}
      <MiniLiveBoard dropHot={dropHot} />
      {right}
      <RightRail />
    </div>
    <Footer />
  </div>;

// State A — panel peeking open on mouseover (semi-transparent, dock hint)
function ABTeachPanelMouseover() {
  const left =
  <div style={{ width: 240, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "rgba(255,255,255,0.82)", borderRight: `1px dashed ${T.blue}`, boxShadow: "8px 0 24px rgba(11,18,32,.10)", position: "relative" }}>
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 5 }}>
        <span title="Dock panel" style={{ fontSize: 9.5, fontWeight: 800, color: T.blueDeep, background: T.blueTile, padding: "3px 9px", borderRadius: 999, letterSpacing: 0.3, cursor: "pointer" }}>Release to dock</span>
      </div>
      <StackHint side="Left panel" />
      <DockPanel kicker="◷ TIMER" accent="#92400E" tall><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><div style={{ fontSize: 34, fontWeight: 800, color: T.ink, letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>08:14</div></div></DockPanel>
    </div>;
  return <PanelShell left={left} right={null}
  banner="Panels appear on mouseover and auto-hide when the cursor leaves. Hover a rail icon to peek the panel; release over the dock zone to pin it." />;
}

// State B — two panels tabbed on the same side
function ABTeachPanelsTabbed() {
  const right =
  <div style={{ width: 300, flex: "0 0 auto", display: "flex", flexDirection: "column", background: "#fff", borderLeft: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", gap: 2, padding: "8px 10px 0", borderBottom: `1px solid ${T.line}` }}>
        {[{ l: "Resources", a: true }, { l: "Notes" }, { l: "Timer" }].map((t, i) =>
      <span key={i} style={{ padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: t.a ? T.ink : T.ink3, borderBottom: t.a ? `2px solid ${T.blue}` : "2px solid transparent", marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 5 }}>
            {t.l}{t.a && <Icon name="x" s={11} c={T.ink3} />}
          </span>
      )}
        <div style={{ flex: 1 }} />
        <span style={{ color: T.ink3, padding: "7px 4px" }}><Icon name="plus" s={13} /></span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: T.ink3, letterSpacing: 0.5, marginBottom: 8 }}>RESOURCES · stacked &amp; tabbed</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[T.rPdf, T.rSlides, T.rTools, T.rVideo].map((ty, i) =>
        <div key={i} style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: 56, background: ty.bg, display: "flex", alignItems: "center", justifyContent: "center", color: ty.fg, fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>{ty.lbl}</div>
            </div>
        )}
        </div>
      </div>
    </div>;
  return <PanelShell left={null} right={right}
  banner="Panels can be stacked on top of each other on the same side and switched as tabs (Resources · Notes · Timer here). Each side holds up to 3." />;
}

// State C — a panel dragged from right to left (ghost + drop zone)
function ABTeachPanelDragged() {
  const left =
  <div style={{ width: 240, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#fff", borderRight: `1px solid ${T.line}` }}>
      <StackHint side="Left panel" />
      <DockPanel kicker="✎ LEARNING OBJECTIVE" accent="#1E3A8A"><div style={{ fontSize: 11.5, color: T.ink, lineHeight: 1.4 }}>I can find three equivalent fractions for a given fraction.</div></DockPanel>
      {/* drop zone */}
      <div style={{ border: `2px dashed ${T.blue}`, borderRadius: 10, background: `${T.blue}0d`, padding: "18px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: T.blueDeep }}>
        <Icon name="plus" s={18} />
        <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center" }}>Drop "Notes" here</span>
        <span style={{ fontSize: 9.5, color: T.ink2 }}>moving from right → left</span>
      </div>
    </div>;
  const right =
  <div style={{ width: 300, flex: "0 0 auto", display: "flex", flexDirection: "column", background: "#fff", borderLeft: `1px solid ${T.line}`, position: "relative" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Resources</div>
      <div style={{ flex: 1, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[T.rPdf, T.rSlides].map((ty, i) =>
        <div key={i} style={{ height: 56, borderRadius: 8, background: ty.bg, display: "flex", alignItems: "center", justifyContent: "center", color: ty.fg, fontSize: 9, fontWeight: 800 }}>{ty.lbl}</div>
        )}
        </div>
      </div>
      {/* floating drag-ghost */}
      <div style={{ position: "absolute", top: 70, left: -90, width: 150, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 9, boxShadow: "0 14px 30px rgba(11,18,32,.25)", padding: 9, transform: "rotate(-3deg)", opacity: 0.92 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="drag" s={11} c={T.ink3} />
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#92400E" }}>🗒 NOTES</span>
        </div>
        <div style={{ height: 30, marginTop: 6, background: T.yel, borderRadius: 5 }} />
      </div>
    </div>;
  return <PanelShell left={left} right={right}
  banner="Any panel or icon can be dragged from one side to the other. A ghost follows the cursor; the target side shows a drop zone." />;
}

// Zone model overview — the 7-thing rule
function ABTeachZoneModel() {
  const Zone = ({ title, sub, count, tone, items }) =>
  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: tone, letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 11, color: T.ink2, marginBottom: 2 }}>{sub}</div>
      {items}
    </div>;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif", overflow: "auto" }}>
      <TopBarLesson />
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${T.line}`, background: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Teach view zone model</div>
        <div style={{ fontSize: 12, color: T.ink2, marginTop: 3, textWrap: "pretty" }}>Left panel + right panel each hold up to <strong>3</strong> things (widgets or panels). The center holds the one <strong>live teaching board</strong>, which can have unlimited slides — each slide carrying its own resources + assessments. Widgets are kinds that can live on the board <em>or</em> as a panel.</div>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 14, padding: 18, minHeight: 0 }}>
        {/* Left zone */}
        <div style={{ width: 220, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.blueDeep, letterSpacing: 0.5 }}>LEFT PANEL · max 3</div>
          <DockPanel kicker="✎ LEARNING OBJECTIVE" accent="#1E3A8A"><div style={{ fontSize: 11, color: T.ink, lineHeight: 1.4 }}>I can find three equivalent fractions…</div></DockPanel>
          <DockPanel kicker="◷ TIMER" accent="#92400E"><div style={{ fontSize: 22, fontWeight: 800, color: T.ink, textAlign: "center" }}>08:14</div></DockPanel>
          <div style={{ border: `1.5px dashed ${T.line}`, borderRadius: 10, padding: "14px 10px", textAlign: "center", fontSize: 10.5, fontWeight: 700, color: T.ink3 }}>+ 1 more slot</div>
        </div>
        {/* Center */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", border: `2px solid ${T.blue}`, borderRadius: 12, overflow: "hidden" }}>
          <MiniLiveBoard />
        </div>
        {/* Right zone */}
        <div style={{ width: 220, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#9D174D", letterSpacing: 0.5 }}>RIGHT PANEL · max 3</div>
          <DockPanel kicker="▦ RESOURCES" accent="#9D174D"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{[T.rPdf, T.rSlides].map((ty, i) => <div key={i} style={{ height: 34, borderRadius: 6, background: ty.bg }} />)}</div></DockPanel>
          <DockPanel kicker="🗒 NOTES" accent="#92400E"><div style={{ height: 30, background: T.yel, borderRadius: 5 }} /></DockPanel>
          <DockPanel kicker="✦ POLL" accent="#5B21B6"><div style={{ height: 30, background: "#EDE9FE", borderRadius: 5 }} /></DockPanel>
        </div>
      </div>
    </div>);
}

// ────────────────────────────────────────────────────────────────────
// T12 · Simplified Teach view (UX pass — focuses on the teacher
// mid-lesson, hands-free, board projected)
// ────────────────────────────────────────────────────────────────────
//
// What changed vs T1:
//   • Default widget set is essentials only: I Can + Timer + Notes.
//     Everything else is opt-in via the floating + button.
//   • Widget chrome: a permanent ⋯ button on every widget (most
//     discoverable + touch-friendly). Drag/pin/expand/settings/remove
//     live behind the ⋯ menu instead of always-shown icons.
//   • Floating + button (bottom-center) replaces the three separate
//     +'s (Add Board / Add widget / Add resource). Opens a tabbed
//     picker.
//   • Right panel defaults to Recents + Search. Type-filter chips
//     hide behind a single Filter button to reduce visual noise.
//   • Top bar collapses to lesson-mode chrome (avatar + back arrow
//     + lesson title only). Dashboard/Plan/Assess/Report/Resources
//     surface via a back-out, not the always-visible nav.
//   • Boards strip stays — it's the primary in-lesson nav.
//
function ABTeachSimplified() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBarLesson />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <LeftRail />
        <LeftPanel />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff", position: "relative" }}>
          <FloatingTeachBar side="left" />
          <CanvasToolbar />
          <div style={{ flex: 1, padding: 22, overflow: "auto", background: "#fff" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gridTemplateRows: "180px 1fr",
              gap: 14, maxWidth: 1000, margin: "0 auto"
            }}>
              <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
              <TimerWidget />
              <NotesWidget />
            </div>
          </div>
          <FloatingAdd />
        </div>
        <ResourcesPanelLite />
        <RightRail />
      </div>
      <Footer />
    </div>);

}

// Simplified top bar — when a lesson is open, collapse the global nav
// to "avatar + lesson title + back".
const TopBarLesson = () =>
<div style={{
  display: "flex", alignItems: "center", gap: 12,
  padding: "9px 16px", background: "#fff",
  borderBottom: `1px solid ${T.line}`
}}>
    <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>MyCurricula</span>
    <span style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="side" s={15} /></span>
    <nav style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 4 }}>
      {[
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "yearly", label: "Yearly" },
    { id: "curriculum", label: "Curriculum" },
    { id: "teach", label: "Teach", active: true }].
    map((t) =>
    <span key={t.id} style={{
      padding: "6px 16px", borderRadius: 8,
      fontSize: 13.5, fontWeight: 700,
      background: t.active ? T.ink : "transparent",
      color: t.active ? "#fff" : T.ink2
    }}>{t.label}</span>
    )}
    </nav>
    <span style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Week 12</span>
    <span style={{ fontSize: 12.5, color: T.ink2 }}>Friday · May 29 · 12:56 PM</span>
    <span style={{ fontSize: 11.5, color: T.ink3 }}>All changes saved</span>
    <span style={{ display: "inline-flex", gap: 8, color: T.ink3, marginLeft: 2 }}>
      <Icon name="undo" s={15} /> <Icon name="redo" s={15} />
    </span>
    <div style={{ flex: 1 }} />
    <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 4px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ padding: "3px 11px", borderRadius: 6, background: T.lineSoft, color: T.ink }}>Personal</span>
      <span style={{ padding: "3px 11px", color: T.rose }}>Team Curriculum</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="search" s={17} /></span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="timer" s={17} />
      <span style={{ position: "absolute", top: -5, right: -7, background: "#F97316", color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>29</span>
    </span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="bell" s={17} />
      <span style={{ position: "absolute", top: -5, right: -6, background: T.blue, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>4</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="more" s={17} /></span>
    <span style={{ position: "relative", color: T.ink3 }}>
      <Icon name="notes" s={17} />
      <span style={{ position: "absolute", top: -5, right: -6, background: T.rose, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>3</span>
    </span>
    <span style={{ color: T.ink3 }}><Icon name="help" s={17} /></span>
    <span style={{
    width: 30, height: 30, borderRadius: 999,
    background: "linear-gradient(135deg, #FCD34D, #F472B6)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 800, color: "#fff"
  }}>LH</span>
    <span style={{ color: T.ink3 }}><Icon name="logout" s={16} /></span>
  </div>;


// Widget shell with permanent ⋯ menu (most discoverable + touch-OK)
const SimplifiedWidget = ({ kicker, tone = "#fff", children }) =>
<div style={{
  background: tone, borderRadius: 12,
  border: `1px solid ${T.line}`,
  boxShadow: "0 1px 2px rgba(11,18,32,.04)",
  display: "flex", flexDirection: "column", overflow: "hidden"
}}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>{kicker}</span>
      <div style={{ flex: 1 }} />
      <span style={{
      width: 24, height: 24, borderRadius: 6,
      color: T.ink2, background: T.lineSoft,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer"
    }}><Icon name="more" s={13} /></span>
    </div>
    <div style={{ flex: 1, padding: "0 14px 14px", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>;


// Floating action — bottom-center, splits into Add resource + Add widget
const FloatingAdd = () =>
<div style={{
  position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
  display: "flex", alignItems: "center", gap: 0,
  background: T.ink, color: "#fff", borderRadius: 999,
  boxShadow: "0 8px 24px rgba(11,18,32,.25)", overflow: "hidden"
}}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
      <Icon name="image" s={15} /> Add resource
    </span>
    <span style={{ width: 1, height: 22, background: "rgba(255,255,255,.2)" }} />
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
      <Icon name="grid" s={15} /> Add widget
    </span>
  </div>;


// Right panel — Recents + Search default; filter chips behind a button
const ResourcesPanelLite = () =>
<div style={{
  width: 290, flex: "0 0 auto",
  background: "#fff", borderLeft: `1px solid ${T.line}`,
  display: "flex", flexDirection: "column", overflow: "hidden"
}}>
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Resources</span>
        <div style={{ flex: 1 }} />
        <span style={{ width: 26, height: 26, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="cog" s={13} /></span>
        <span style={{ color: T.ink3 }}><Icon name="x" s={14} /></span>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", background: "#F3F4F6", borderRadius: 8, color: T.ink3, width: "100%" }}>
        <Icon name="search" s={13} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>Search resources…</span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink3, letterSpacing: 0.6, marginTop: 12 }}>RECENTS</div>
    </div>
    <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
      { type: T.rPdf, title: "Fraction Wall Poster" },
      { type: T.rSlides, title: "Equivalent Fractions Deck" },
      { type: T.rTools, title: "Fraction Strips (Interactive)" },
      { type: T.rVideo, title: "Fraction Basics" },
      { type: T.rDoc, title: "Guided Practice Worksheet" },
      { type: T.rLink, title: "Khan Academy" }].
      map((r, i) =>
      <div key={i} style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
        border: `1px solid ${T.line}`, borderRadius: 8, cursor: "pointer"
      }}>
            <span style={{ width: 26, height: 26, borderRadius: 6, background: r.type.bg, color: r.type.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, letterSpacing: 0.4 }}>{r.type.lbl}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.ink }}>{r.title}</span>
            <span style={{ color: T.ink3 }}><Icon name="more" s={13} /></span>
          </div>
      )}
      </div>
      <div style={{ padding: "10px 0", marginTop: 6, fontSize: 12, color: T.blue, fontWeight: 700, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
        <Icon name="plus" s={13} /> Browse all 86 resources
      </div>
    </div>
  </div>;


// ────────────────────────────────────────────────────────────────────
// T13 · Teach mode (focus = teach)
// ────────────────────────────────────────────────────────────────────
//
// Per the user's direction: when a widget OR a resource is enlarged
// mid-screen, the app enters Teach mode. Bigger touch targets, dimmed
// non-essential chrome, kid-readable type, but the side panels stay
// reachable so the teacher can still pull in another resource.
//
// Demonstrated here on the I CAN widget enlarged — the canvas focuses,
// the teacher gets large-print I CAN at center, with a slim top strip
// showing what's enlarged + Esc-to-shrink + the next-board affordance.
//
function ABTeachInTeachMode() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 16px", background: T.ink, color: "#fff"
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 4, background: T.blue, letterSpacing: 0.5 }}>TEACH MODE</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Equivalent fractions warm-up · Warm-Up board · Slide 1 of 3</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}>Side panels hidden — hover the far left/right edge to peek</span>
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}>← prev · next →</span>
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}><span className="cp-mono" style={{ background: "rgba(255,255,255,.18)", padding: "1px 5px", borderRadius: 3 }}>Esc</span> shrink</span>
      </div>
      {/* Live teaching board ONLY — no side rails/panels even if docked */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* Edge peek strips — hidden panels reveal on hover/touch of the very edges */}
        <div title="Hover or touch this edge to reveal the left panel" style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 14, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(90deg, ${T.lineSoft}, transparent)`, cursor: "pointer" }}>
          <span style={{ width: 4, height: 46, borderRadius: 999, background: T.ink3, opacity: 0.4 }} />
        </div>
        <div title="Hover or touch this edge to reveal the right panel" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 14, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(270deg, ${T.lineSoft}, transparent)`, cursor: "pointer" }}>
          <span style={{ width: 4, height: 46, borderRadius: 999, background: T.ink3, opacity: 0.4 }} />
        </div>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff",
          padding: "40px 64px 28px", position: "relative"
        }}>
          <ToolDock />
          {/* Enlarged I Can banner for this slide */}
          <div style={{
            background: `linear-gradient(180deg, ${T.iCanBg} 0%, #fff 100%)`,
            borderRadius: 16, padding: "26px 32px",
            display: "flex", alignItems: "center", gap: 22
          }}>
            <span style={{ width: 60, height: 60, borderRadius: 14, background: "#fff", color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon name="target" s={32} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", background: T.blue, padding: "4px 12px", borderRadius: 6, letterSpacing: 0.8 }}>I CAN</span>
              <div style={{ fontSize: 36, fontWeight: 800, color: T.blueDeep, letterSpacing: -0.6, lineHeight: 1.15, marginTop: 10, textWrap: "pretty" }}>Find three equivalent fractions for a given fraction.</div>
            </div>
          </div>
          {/* The slide's content area (resources + assessments live here) */}
          <div style={{
            flex: 1, marginTop: 18, borderRadius: 16,
            border: `1.5px solid ${T.line}`, background: "#FAFBFC",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14
          }} data-comment-anchor="6ec722e5ec-div-1626-11">
            <div style={{ display: "flex", gap: 14 }}>
              {["2/3", "4/6", "6/9"].map((f, i) => {
                const [n, d] = f.split("/");
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", border: `2px solid #5B21B6`, borderRadius: 8, overflow: "hidden", height: 90, width: 150 }}>
                      {Array.from({ length: [3, 6, 9][i] }).map((_, j) =>
                      <div key={j} style={{ flex: 1, background: j < [2, 4, 6][i] ? "#DDD6FE" : "#fff", borderRight: j < [3, 6, 9][i] - 1 ? `1.5px solid #5B21B6` : "none" }} />
                      )}
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#5B21B6" }}>{n}<span style={{ borderTop: "2px solid #5B21B6", display: "block", lineHeight: 0.9 }} />{d}</span>
                  </div>);

              })}
            </div>
            <div style={{ fontSize: 14, color: T.ink2, fontWeight: 600 }}>2/3 = 4/6 = 6/9</div>
          </div>
          {/* slide pager */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }} data-comment-anchor="40f281f123-div-1649-11">
            <span style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevL" s={15} /></span>
            {[1, 2, 3].map((n) =>
            <span key={n} style={{ width: n === 1 ? 26 : 9, height: 9, borderRadius: 999, background: n === 1 ? T.blue : T.line }} />
            )}
            <span style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevR" s={15} /></span>
            <span style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
            {/* + add page / widget / resource / blank */}
            <span title="Add page, widget, resource, or blank" style={{ width: 32, height: 32, borderRadius: 8, border: `1px dashed ${T.ink3}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="plus" s={15} /></span>
            {/* change background */}
            <span title="Change background" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.line}`, color: T.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Icon name="image" s={13} /> Background</span>
          </div>
        </div>
      </div>
    </div>);

}

// ── Mini-Lesson board widget mix ────────────────────────────────
function MiniLessonBoard() {
  return (
    <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#fff", position: "relative" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr",
        gridTemplateRows: "260px 220px",
        gap: 12, maxWidth: 1080, margin: "0 auto"
      }}>
        {/* Slides anchor — spans col 1, row 1-2 */}
        <div style={{ gridRow: "span 2", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>▦ SLIDES · 3/14</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: T.ink3 }}>Bake-Sale anchor</span>
          </div>
          <div style={{ flex: 1, background: T.blueTile, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.blueDeep }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Slide 3 / 14</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>5 cookies ÷ 4 friends</div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {[1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((on, i) =>
              <span key={i} style={{ width: 14, height: 4, borderRadius: 2, background: on ? T.blueDeep : "rgba(255,255,255,.6)" }} />
              )}
            </div>
          </div>
        </div>

        {/* Model It */}
        <ModelWidget />

        {/* YouTube */}
        <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>▷ VIDEO</span>
          <div style={{ flex: 1, background: "linear-gradient(135deg, #DC2626 0%, #7F1D1D 100%)", borderRadius: 9, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 130 }}>
            <span style={{ width: 40, height: 40, borderRadius: 999, background: "#fff", color: "#DC2626", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" s={18} /></span>
            <span style={{ position: "absolute", bottom: 6, left: 8, fontSize: 10.5, fontWeight: 700, color: "#fff" }}>Fraction Basics · 4:12</span>
          </div>
        </div>

        {/* Name picker */}
        <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6, alignSelf: "flex-start" }}>★ NAME PICKER</span>
          <div style={{ padding: "10px 22px", background: "#FCD0DA", color: "#9D2D5E", borderRadius: 12, fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>Tariq</div>
          <span style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600 }}>Tap to draw another</span>
        </div>

        {/* Poll */}
        <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>✦ POLL · 25 votes</span>
          {[
          { lbl: "I've got this", n: 14, tone: T.green, pct: 56 },
          { lbl: "Almost", n: 8, tone: "#92400E", pct: 32 },
          { lbl: "Slow down", n: 3, tone: T.rose, pct: 12 }].
          map((p, i) =>
          <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 600, color: T.ink, marginBottom: 2 }}>
                <span>{p.lbl}</span><span style={{ color: T.ink3 }}>{p.n}</span>
              </div>
              <div style={{ height: 6, background: T.lineSoft, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${p.pct}%`, height: "100%", background: p.tone, borderRadius: 999 }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <ToolDock />
    </div>);

}

// Shared shell with optional overrides for the new states
function TeachWith({ children, boardActive, tone, hideRails, hideTabs, hideFooter, hideSub, hideTop, leftPanel = "default", rightPanel = "resources" }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {!hideTop && <TopBar />}
      {!hideSub && <SubBar />}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {!hideRails && <LeftRail />}
        {leftPanel === "default" && !hideRails && <LeftPanel />}
        {leftPanel === "widgets" && !hideRails && <LeftPanelWithWidgets />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: tone || "#fff" }}>
          {children}
        </div>
        {rightPanel === "resources" && !hideRails && <ResourcesPanel view="grid" />}
        {rightPanel === "timer" && !hideRails && <RightPanelWithTimer />}
      </div>
      {!hideFooter && <Footer />}
    </div>);

}

// ── T5 Widget picker popover ────────────────────────────────────
function ABTeachWidgetPicker() {
  return (
    <div style={{ height: "100%", position: "relative" }}>
      <ABTeachDefault />
      {/* dim overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(11,18,32,.35)" }} />
      {/* popover */}
      <div style={{
        position: "absolute", top: "26%", left: "50%", transform: "translate(-50%, 0)",
        width: 520, background: "#fff", borderRadius: 16,
        boxShadow: "0 30px 60px rgba(11,18,32,.35)",
        padding: 18, zIndex: 20
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Add a widget</span>
          <div style={{ flex: 1 }} />
          <span style={{ padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 11, fontWeight: 600, color: T.ink2 }}>1×1 empty cell</span>
          <span style={{ color: T.ink3, cursor: "pointer" }}><Icon name="x" s={15} /></span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", background: "#F3F4F6", borderRadius: 8, color: T.ink3, width: "100%", marginBottom: 14 }}>
          <Icon name="search" s={14} />
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Search widgets…</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
          { lbl: "Timer", bg: "#FEF3C7", fg: "#92400E", g: "◷" },
          { lbl: "I Can", bg: "#DBEAFE", fg: "#1E3A8A", g: "✓" },
          { lbl: "Groups", bg: "#D1FAE5", fg: "#065F46", g: "▦" },
          { lbl: "Agenda", bg: "#FCE7F3", fg: "#9D174D", g: "☷" },
          { lbl: "Notes", bg: "#FEF3C7", fg: "#92400E", g: "✎" },
          { lbl: "Model It", bg: "#D1FAE5", fg: "#065F46", g: "▭" },
          { lbl: "Slides", bg: "#DBEAFE", fg: "#1E3A8A", g: "▦" },
          { lbl: "YouTube", bg: "#FEE2E2", fg: "#991B1B", g: "▷" },
          { lbl: "Poll", bg: "#EDE9FE", fg: "#5B21B6", g: "✦" },
          { lbl: "Names", bg: "#FED7AA", fg: "#9A3412", g: "★" },
          { lbl: "Manip.", bg: "#D1FAE5", fg: "#065F46", g: "▢" },
          { lbl: "Embed", bg: "#E0E7FF", fg: "#3730A3", g: "⊗" }].
          map((w, i) =>
          <div key={i} style={{ background: w.bg, borderRadius: 10, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <span style={{ fontSize: 22, color: w.fg, fontWeight: 800, lineHeight: 1 }}>{w.g}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: w.fg, letterSpacing: -0.1 }}>{w.lbl}</span>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ── T6 Present mode ─────────────────────────────────────────────
function ABTeachPresent() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: T.ink, color: "#fff", borderBottom: `1px solid ${T.ink}` }}>
        <span style={{ fontSize: 11, fontWeight: 800, background: T.blue, padding: "3px 9px", borderRadius: 4, letterSpacing: 0.5 }}>PRESENTING</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Equivalent fractions warm-up · Warm-Up board · Math · Period 2</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}>1 / 5</span>
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}>← prev · next →</span>
        <span style={{ fontSize: 11.5, color: "#cbd5e1" }}><span className="cp-mono" style={{ background: "rgba(255,255,255,.18)", padding: "1px 5px", borderRadius: 3 }}>Esc</span> exit</span>
      </div>
      <div style={{ flex: 1, padding: 28, overflow: "auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.1fr 1fr",
          gridTemplateRows: "180px 280px 280px",
          gap: 14, maxWidth: 1280, margin: "0 auto"
        }}>
          <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
          <TimerWidget />
          <GroupsWidget />
          <ModelWidget />
          <AgendaWidget />
          <ManipulativesWidget />
          <NotesWidget />
        </div>
      </div>
    </div>);

}

// ── T7 Focus mode (one widget fullscreen) ───────────────────────
function ABTeachFocus() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail />
        <LeftPanel />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          <CanvasToolbar />
          <div style={{ flex: 1, padding: 24, background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: T.ink, padding: "3px 9px", borderRadius: 4, letterSpacing: 0.5 }}>FOCUS MODE</span>
              <span style={{ fontSize: 12, color: T.ink2 }}>Press <span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>Esc</span> or click outside to return to the board</span>
            </div>
            <div style={{ flex: 1, display: "flex" }}>
              <div style={{ flex: 1, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", boxShadow: "0 6px 20px rgba(11,18,32,.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>◷ VISUAL TIMER · 3:42 remaining</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: T.ink3 }}><Icon name="shrink" s={14} /></span>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
                  <svg width="320" height="320" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r="28" fill="none" stroke="#EDE9FE" strokeWidth="6" />
                    <circle cx="35" cy="35" r="28" fill="none" stroke={T.purple} strokeWidth="6" strokeDasharray="176" strokeDashoffset="54" strokeLinecap="round" transform="rotate(-90 35 35)" />
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ fontSize: 96, fontWeight: 800, color: T.ink, letterSpacing: -3, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>03:42</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ padding: "8px 16px", background: T.ink, color: "#fff", borderRadius: 9, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="pause" s={14} /> Pause</span>
                      <span style={{ padding: "8px 16px", background: T.lineSoft, color: T.ink, borderRadius: 9, fontSize: 13, fontWeight: 600 }}>+1 min</span>
                      <span style={{ padding: "8px 16px", background: T.lineSoft, color: T.ink, borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Reset</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ResourcesPanel view="grid" />
      </div>
      <Footer />
    </div>);

}

// ── T8 Drag-drop ────────────────────────────────────────────────
function ABTeachDragDrop() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail />
        <LeftPanel />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          <CanvasToolbar />
          <div style={{ flex: 1, position: "relative", padding: 18, overflow: "auto", background: "#fff" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1.1fr 1fr",
              gridTemplateRows: "120px 220px 240px",
              gap: 12, maxWidth: 1080, margin: "0 auto"
            }}>
              <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
              <TimerWidget />
              <GroupsWidget />
              <ModelWidget />
              {/* Drop target replacing Agenda */}
              <div style={{
                background: `${T.blue}10`, border: `2px dashed ${T.blue}`, borderRadius: 12,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, color: T.blueDeep
              }}>
                <span style={{ width: 38, height: 38, borderRadius: 999, background: T.blue, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" s={16} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Drop "Fraction Strips" here</div>
                <div style={{ fontSize: 11, color: T.ink2 }}>Adds as Interactive · 1×1 cell</div>
              </div>
              <ManipulativesWidget />
              <NotesWidget />
            </div>
            {/* Floating drag-ghost */}
            <div style={{
              position: "absolute", top: 240, right: 380, width: 180,
              background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10,
              boxShadow: "0 14px 30px rgba(11,18,32,.25)", padding: 8,
              transform: "rotate(-3deg)", opacity: 0.92, pointerEvents: "none"
            }}>
              <div style={{ height: 56, background: T.rTools.bg, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ResArt kind="strips" fg={T.rTools.fg} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, marginTop: 6 }}>Fraction Strips (Interactive)</div>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: T.rTools.fg, letterSpacing: 0.5, marginTop: 2 }}>TOOLS</div>
            </div>
            <ToolDock />
          </div>
        </div>
        <ResourcesPanel view="grid" hoverItem />
      </div>
      <Footer />
    </div>);

}

// ── T9 Empty board state ────────────────────────────────────────
function ABTeachEmpty() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail />
        <LeftPanel />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          <CanvasToolbar />
          <div style={{ flex: 1, position: "relative", padding: 18, overflow: "auto", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              maxWidth: 520, background: "#fff", border: `1.5px dashed ${T.ink3}`, borderRadius: 18,
              padding: "36px 30px", display: "flex", flexDirection: "column", alignItems: "center",
              gap: 14, textAlign: "center"
            }} data-comment-anchor="08652678b4-div-1684-13">
              <span style={{ width: 56, height: 56, borderRadius: 14, background: T.lineSoft, color: T.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" s={26} /></span>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }}>Blank board</div>
              <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.55 }}>Start from empty. Add a resource, a widget, or set a background — or just leave it blank to write on.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                {[
                ["Add Resource", "image", "#DBEAFE", "#1E3A8A"],
                ["Add Widget", "grid", "#D1FAE5", "#065F46"],
                ["Background", "image", "#FEF3C7", "#92400E"],
                ["Blank", "rect", "#F3F4F6", "#4B5563"]].
                map(([lbl, ic, bg, fg], i) =>
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: bg, color: fg, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Icon name={ic} s={14} /> {lbl}</span>
                )}
              </div>
            </div>
            <ToolDock />
          </div>
        </div>
        <ResourcesPanel view="grid" />
        <RightRail />
      </div>
      <Footer />
    </div>);

}

// ── T10 Mini-Lesson board active ─────────────────────────────────
function ABTeachMiniLesson() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      {/* Sub-bar with Mini Lesson active */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "#fff", borderBottom: `1px solid ${T.line}` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: T.ink }}>Week 12 <Icon name="chevD" s={13} /></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: T.ink }}>Math <Icon name="chevD" s={13} /></span>
        <div style={{ flex: "0 0 auto", display: "flex", gap: 5, alignItems: "center", marginLeft: 6 }}>
          {[
          { n: 1, label: "Warm-Up" },
          { n: 2, label: "Mini Lesson", active: true },
          { n: 3, label: "Guided Practice" },
          { n: 4, label: "Centers" },
          { n: 5, label: "Exit Ticket" }].
          map((b) =>
          <span key={b.n} style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 12px", borderRadius: 999,
            background: b.active ? T.blueTile : "transparent",
            color: b.active ? T.blueDeep : T.ink,
            border: b.active ? `1px solid ${T.blue}` : `1px solid ${T.line}`,
            fontSize: 12.5, fontWeight: 600
          }}>
              <span style={{ width: 18, height: 18, borderRadius: 999, background: b.active ? T.blue : T.lineSoft, color: b.active ? "#fff" : T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{b.n}</span>
              {b.label}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, border: `1px dashed ${T.ink3}`, fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>
            <Icon name="plus" s={13} /> Add Board <Icon name="chevD" s={12} />
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 16px", background: T.blue, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
          <Icon name="play" s={13} /> Present
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail />
        <LeftPanel />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          <CanvasToolbar />
          <MiniLessonBoard />
        </div>
        <ResourcesPanel view="grid" />
      </div>
      <Footer />
    </div>);

}

// ── T11 Pop-Out (detached window for second monitor) ─────────────
function ABTeachPopOut() {
  return (
    <div style={{ height: "100%", background: "#0B1220", padding: 16, display: "flex", flexDirection: "column", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Fake browser chrome */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#1F2937", borderRadius: "8px 8px 0 0" }}>
        <span style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#EF4444" }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#F59E0B" }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: "#10B981" }} />
        </span>
        <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>app.mycurricula.com/teach/pop?board=warm-up</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: T.blue, padding: "2px 9px", borderRadius: 4, letterSpacing: 0.5 }}>POP-OUT</span>
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: "0 0 8px 8px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }}>Warm-Up · Equivalent fractions warm-up</span>
          <span style={{ fontSize: 11, color: T.ink3 }}>Math · Period 2</span>
          <div style={{ flex: 1 }} />
          <span style={{ padding: "5px 12px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="full" s={12} /> Full screen</span>
          <span style={{ padding: "5px 12px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink, display: "inline-flex", alignItems: "center", gap: 5 }}>Reattach</span>
        </div>
        <div style={{ flex: 1, padding: 22, overflow: "auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gridTemplateRows: "150px 280px 280px",
            gap: 14
          }}>
            <div style={{ gridColumn: "span 2" }}><ICanWidgetRaw /></div>
            <ModelWidget />
            <TimerWidget />
            <GroupsWidget />
            <ManipulativesWidget />
          </div>
        </div>
      </div>
    </div>);

}

// ── ABTeachResourceFocusCollapsed ────────────────────────────────
// Same resource-focus state as T3, but both side panels are collapsed
// into 64px icon rails. The center canvas takes nearly the full width.
function ABTeachResourceFocusCollapsed() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail collapsed />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          {/* Resource title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Fraction Wall Poster (Printable).pdf</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: T.ink3 }}><Icon name="more" s={15} /></span>
          </div>
          {/* PDF viewer toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: T.blueTile, color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="arrow" s={14} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="sticky" s={14} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="search" s={14} /></span>
            <div style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink }}>1 <span style={{ color: T.ink3 }}>/ 1</span></span>
            <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>−</span>
            <span style={{ padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink }}>100%</span>
            <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>+</span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="full" s={13} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="more" s={14} /></span>
          </div>
          {/* PDF content + annotation toolbar */}
          <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#F9FAFB", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <PdfPreview />
            <AnnotationToolbar />
          </div>
        </div>
        <RightRail />
      </div>
      <FooterPanda />
    </div>);

}

// ── ABTeachResourceFocus ─────────────────────────────────────────
// A resource (Fraction Wall Poster PDF) is opened in the center
// canvas as the main board content. Left panel keeps the Lesson card,
// adds an I CAN widget + Agenda widget. Right panel keeps Resources
// but with a Visual Timer widget pinned at the top.
function ABTeachResourceFocus() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.pageBg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar />
      <SubBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftRail />
        <LeftPanelWithWidgets />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
          {/* Resource title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Fraction Wall Poster (Printable).pdf</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: T.ink3 }}><Icon name="more" s={15} /></span>
          </div>
          {/* PDF viewer toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: T.blueTile, color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="arrow" s={14} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="sticky" s={14} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="search" s={14} /></span>
            <div style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, color: T.ink }}>1 <span style={{ color: T.ink3 }}>/ 1</span></span>
            <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>−</span>
            <span style={{ padding: "4px 10px", border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink }}>100%</span>
            <span style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.line}`, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>+</span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="full" s={13} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="more" s={14} /></span>
          </div>
          {/* PDF content + annotation toolbar */}
          <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#F9FAFB", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <PdfPreview />
            <AnnotationToolbar />
          </div>
        </div>
        <RightPanelWithTimer />
      </div>
      <FooterPanda />
    </div>);

}

// Left panel for the resource-focus view — Lesson card + I Can widget
// + Agenda widget + Teaching Boards.
function LeftPanelWithWidgets() {
  return (
    <div style={{
      width: 268, flex: "0 0 auto",
      background: "#fff", borderRight: `1px solid ${T.line}`,
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      <div style={{ padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Lesson card */}
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: T.blueTile, color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="book" s={14} /></span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>Lesson</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: T.ink3 }}><Icon name="more" s={14} /></span>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink3, letterSpacing: 0.5, marginBottom: 3 }}>LESSON TEXT</div>
          <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.5, marginBottom: 10 }}>I can find three equivalent fractions for a given fraction.</div>
          <button style={{
            width: "100%", padding: "7px 11px", background: "#fff",
            border: `1px solid ${T.line}`, borderRadius: 7,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: T.ink, cursor: "pointer"
          }}>Open full lesson <Icon name="extLink" s={12} /></button>
        </div>

        {/* I CAN widget */}
        <div style={{
          background: T.iCanBg, borderRadius: 10, padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 6, position: "relative"
        }}>
          <span style={{ position: "absolute", top: 8, right: 10, color: T.blueDeep }}><Icon name="more" s={13} /></span>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: "#fff", color: T.blueDeep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="target" s={14} /></span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: T.blue, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.5, alignSelf: "flex-start" }}>SCAN</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.blueDeep, letterSpacing: -0.2, lineHeight: 1.3 }}>Find three equivalent fractions for a given fraction.</div>
          <div style={{ fontSize: 11, color: T.blueDeep, fontWeight: 500 }}>Standard: <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.B.3</span> | <span className="cp-mono" style={{ fontWeight: 700 }}>5.NF.A.1</span></div>
        </div>

        {/* Agenda widget */}
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Icon name="more" s={11} c={T.ink3} />
            <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>AGENDA</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: T.ink3 }}><Icon name="expand" s={12} /></span>
          </div>
          {[
          { lbl: "Warm-Up", time: "8 min", done: true },
          { lbl: "Mini Lesson", time: "12 min" },
          { lbl: "Guided Practice", time: "15 min" },
          { lbl: "Centers", time: "20 min" },
          { lbl: "Exit Ticket", time: "5 min" }].
          map((it, i) =>
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <span style={{
              width: 15, height: 15, borderRadius: 4, flex: "0 0 auto",
              background: it.done ? T.blue : "#fff",
              border: `1.5px solid ${it.done ? T.blue : T.ink3}`,
              display: "inline-flex", alignItems: "center", justifyContent: "center"
            }}>{it.done && <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.ink, textDecoration: it.done ? "line-through" : "none" }}>{it.lbl}</span>
              <span style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600 }}>{it.time}</span>
            </div>
          )}
        </div>
      </div>

      {/* Teaching Boards */}
      <div style={{ borderTop: `1px solid ${T.line}`, padding: "10px 12px", background: "#FAFBFC" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: T.ink2, letterSpacing: 0.6, flex: 1, textTransform: "uppercase" }}>Teaching Boards</span>
          <span style={{ color: T.ink3 }}><Icon name="chevUp" s={13} /></span>
        </div>
        {[
        { n: 1, lbl: "Warm-Up", active: true },
        { n: 2, lbl: "Mini Lesson" },
        { n: 3, lbl: "Guided Practice" },
        { n: 4, lbl: "Centers" },
        { n: 5, lbl: "Exit Ticket" }].
        map((b, i) =>
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "5px 8px", marginBottom: 4,
          border: b.active ? `1.5px solid ${T.ink}` : `1px solid ${T.line}`,
          borderRadius: 7, background: "#fff"
        }}>
            <span style={{ width: 16, height: 16, borderRadius: 999, background: b.active ? T.ink : T.lineSoft, color: b.active ? "#fff" : T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800 }}>{b.n}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: b.active ? 700 : 500, color: T.ink }}>{b.lbl}</span>
            <span style={{ width: 38, height: 22, background: T.lineSoft, borderRadius: 3, display: "flex", padding: 2, gap: 2 }}>
              <span style={{ flex: 1, background: T.blueTile, borderRadius: 1 }} />
              <span style={{ flex: 1, background: T.yel, borderRadius: 1 }} />
            </span>
          </div>
        )}
        <button style={{
          width: "100%", padding: "6px 10px", marginTop: 4,
          background: "#fff", border: `1px dashed ${T.ink3}`, borderRadius: 7,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontSize: 11.5, fontWeight: 600, color: T.ink2, cursor: "pointer"
        }}><Icon name="plus" s={12} /> Add board</button>
      </div>
    </div>);

}

// PDF preview — Equivalent Fractions worksheet
function PdfPreview() {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 6,
      width: "100%", maxWidth: 760, padding: "40px 60px 56px",
      boxShadow: "0 2px 6px rgba(11,18,32,.08)",
      display: "flex", flexDirection: "column", gap: 24
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: T.ink, fontWeight: 600 }}>
        <span>Name <span style={{ display: "inline-block", width: 200, borderBottom: `1.5px solid ${T.ink2}`, marginLeft: 6 }} /></span>
        <span>Date <span style={{ display: "inline-block", width: 130, borderBottom: `1.5px solid ${T.ink2}`, marginLeft: 6 }} /></span>
      </div>
      <div style={{ textAlign: "center", fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: -0.5, fontFamily: "'Caveat', 'Comic Sans MS', cursive" }}>Equivalent Fractions</div>
      <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>Directions: Find three equivalent fractions for each given fraction.</div>
      {[
      { n: 1, num: "2", den: "3" },
      { n: 2, num: "3", den: "4" },
      { n: 3, num: "2", den: "5" },
      { n: 4, num: "3", den: "6" }].
      map((p) =>
      <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>{p.n}.</span>
          <Frac n={p.num} d={p.den} big />
          {[1, 2, 3].map((b) =>
        <React.Fragment key={b}>
              <div style={{ display: "flex", gap: 0 }}>
                {Array.from({ length: 4 }).map((_, i) =>
            <div key={i} style={{ width: 28, height: 28, border: `1.5px solid ${T.ink}`, marginLeft: i ? -1 : 0 }} />
            )}
              </div>
              {b < 3 && <span style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>,</span>}
            </React.Fragment>
        )}
        </div>
      )}
    </div>);

}

// Annotation toolbar — pen / highlighter / eraser / rect / text /
// undo / redo / color swatches / more.
function AnnotationToolbar() {
  const colors = ["#0B1220", "#2563EB", "#DC2626", "#10B981", "#8B5CF6"];
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14,
      boxShadow: "0 6px 20px rgba(11,18,32,.12)",
      padding: "8px 14px", display: "flex", alignItems: "center", gap: 6
    }}>
      {[
      { ic: "arrow", active: true },
      { ic: "pen" },
      { ic: "pen" }, // highlighter — same icon, different color shown below
      { ic: "tools" }, // eraser placeholder
      { ic: "rect" },
      { ic: "text" }].
      map((t, i) =>
      <span key={i} style={{
        width: 30, height: 30, borderRadius: 8,
        background: t.active ? T.blueTile : "transparent",
        color: t.active ? T.blueDeep : T.ink2,
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}>
          <Icon name={t.ic} s={15} />
        </span>
      )}
      <span style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
      <span style={{ color: T.ink3 }}><Icon name="undo" s={15} /></span>
      <span style={{ color: T.ink3 }}><Icon name="redo" s={15} /></span>
      <span style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
      {colors.map((c, i) =>
      <span key={i} style={{
        width: 22, height: 22, borderRadius: 999, background: c, flex: "0 0 auto",
        border: i === 0 ? `2px solid ${T.ink}` : "1px solid transparent",
        boxShadow: i === 0 ? `0 0 0 2px #fff inset` : "none"
      }} />
      )}
      <span style={{ width: 30, height: 30, borderRadius: 8, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="more" s={15} /></span>
    </div>);

}

// Right panel with a pinned Visual Timer above the Resources grid.
function RightPanelWithTimer() {
  const resources = [
  { type: T.rPdf, title: "Fraction Wall Poster", art: "wallposter", active: true },
  { type: T.rSlides, title: "Equivalent Fractions Deck", art: "slidesdeck" },
  { type: T.rVideo, title: "Equivalent Fractions Explained", art: "video" },
  { type: T.rLink, title: "Khan Academy Equivalent Fractions", art: "khan" },
  { type: T.rDoc, title: "Guided Practice Worksheet", art: "doc" },
  { type: T.rImage, title: "Fraction Tiles (Set of 5)", art: "tiles" },
  { type: T.rPdf, title: "Exit Ticket (Printable)", art: "exitticket" },
  { type: T.rTools, title: "Fraction Strips (Interactive)", art: "strips" }];

  return (
    <div style={{
      width: 312, flex: "0 0 auto",
      background: "#fff", borderLeft: `1px solid ${T.line}`,
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, letterSpacing: -0.2 }}>Resources</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: T.ink3 }}><Icon name="x" s={14} /></span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", background: "#F3F4F6", borderRadius: 7, color: T.ink3, flex: 1 }}>
            <Icon name="search" s={13} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Search resources…</span>
          </div>
          <span style={{ width: 28, height: 28, border: `1px solid ${T.line}`, borderRadius: 7, color: T.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="boards" s={13} /></span>
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 10, padding: 2, background: T.lineSoft, borderRadius: 8, width: "fit-content" }}>
          <span style={{ padding: "4px 16px", borderRadius: 6, background: "#fff", color: T.ink, fontSize: 11.5, fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>Grid</span>
          <span style={{ padding: "4px 16px", borderRadius: 6, color: T.ink3, fontSize: 11.5, fontWeight: 700 }}>List</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
          {["All", "Slides", "Handouts", "Tools"].map((c, i) =>
          <span key={c} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: i === 0 ? T.blue : "#fff", color: i === 0 ? "#fff" : T.ink2, border: i === 0 ? `1px solid ${T.blue}` : `1px solid ${T.line}` }}>{c}</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ color: T.ink3 }}><Icon name="chevD" s={13} /></span>
        </div>
      </div>

      {/* Pinned Visual Timer */}
      <div style={{ padding: 12, borderBottom: `1px solid ${T.line}` }}>
        <div style={{
          background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10,
          padding: "10px 14px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.ink2, letterSpacing: 0.6 }}>◷ VISUAL TIMER</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: T.ink3 }}><Icon name="expand" s={12} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>08:14</div>
            <svg width="60" height="60" viewBox="0 0 70 70">
              <circle cx="35" cy="35" r="28" fill="none" stroke="#EDE9FE" strokeWidth="7" />
              <circle cx="35" cy="35" r="28" fill="none" stroke={T.purple} strokeWidth="7" strokeDasharray="176" strokeDashoffset="54" strokeLinecap="round" transform="rotate(-90 35 35)" />
            </svg>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: T.lineSoft, color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pause" s={12} /></span>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: T.lineSoft, color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="rotate" s={12} /></span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {resources.map((r, i) =>
          <ResThumb key={i} r={r} />
          )}
        </div>
        <div style={{ marginTop: 10, padding: "8px 0", textAlign: "center", color: T.blue, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <Icon name="plus" s={13} /> Add resource
        </div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>86 resources</div>
      </div>
    </div>);

}

// Footer with "Panda" group instead of "Panels"
function FooterPanda() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "8px 16px", background: "#fff",
      borderTop: `1px solid ${T.line}`, fontSize: 11.5, color: T.ink2
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
        Panda <Icon name="chevUp" s={12} />
      </span>
      <span style={{ fontWeight: 700, color: T.ink }}>Lessons</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Resources <span style={{ width: 5, height: 5, borderRadius: 999, background: T.green }} /></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="notes" s={12} /> Notes</span>
      <div style={{ flex: 1 }} />
      <span>Board 1 of 5</span>
      <span style={{ color: T.ink3 }}>·</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Saved to MyCurricula <span style={{ width: 14, height: 14, borderRadius: 999, background: T.green, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" s={9} /></span></span>
      <div style={{ flex: 1 }} />
      <span style={{ color: T.ink3 }}>Shortcuts:</span>
      <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘⇧P</span> Present</span>
      <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘/</span> Search</span>
      <span><span className="cp-mono" style={{ background: T.lineSoft, padding: "1px 5px", borderRadius: 3, fontSize: 10.5 }}>⌘?</span> Help</span>
    </div>);

}