// mock523-roadmap.jsx — Curriculum Roadmap (replaces UnitTimeline).
//
// Two view modes:
//   1. ZOOMED OUT  ("Curriculum Roadmap" / "Quarter 1" picker)
//      Months across the top, class/lane rows down the left, each unit
//      shown as a highlighter brush-stroke spanning its month(s).
//      Inside each brush: title + date range + weeks + lesson count.
//      Bottom stat strip: Total Units / Total Lessons / Weeks in View /
//      Curriculum Lanes.
//
//   2. ZOOMED IN  ("Roadmap" / "Board" toggle)
//      Weekly columns across the top. Each lane row shows the unit
//      brush + status pill + lesson count + a per-lesson dot row
//      (filled = done, half = in-progress, empty = upcoming). Mini
//      checkpoint flags between units.
//      Left class summary card includes a % Complete bar.
//      Bottom: status legend + roadmap summary.
//
// Highlighter effect: CSS-only. Color fill + asymmetric border-radius +
// subtle rotation + dual inset box-shadows to fake marker bleed. SVG
// turbulence filter `#brushFilter` applied for the ragged edge.

// ───────────────────────────────────────────────────────────────────
// SVG filter definitions — drop into the page once
// ───────────────────────────────────────────────────────────────────
const BrushDefs = () => (
  <svg width="0" height="0" style={{ position: "absolute" }}>
    <defs>
      <filter id="brushFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.04" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="3.5" />
      </filter>
      <filter id="brushFilterLite">
        <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="2" seed="5" />
        <feDisplacementMap in="SourceGraphic" scale="2" />
      </filter>
    </defs>
  </svg>
);

// Highlighter colors — bright marker-pen tones, no muted versions.
// Each carries: stroke (the highlight fill), deep (text/dot), soft
// (subtle bg if we need it), check (the completion-dot green).
const ROAD_TONES = [
  { id: "yellow",   stroke: "#FFE56B", deep: "#7A4F08", soft: "#FFF4C2", text: "#3A2A05", lane: "#FEF6D8", check: "#D9A41A" },
  { id: "green",    stroke: "#A0F0B8", deep: "#107D3A", soft: "#D6F7E1", text: "#0B4A23", lane: "#E5F8EB", check: "#10A050" },
  { id: "cyan",     stroke: "#9CECE2", deep: "#0F7D70", soft: "#D2F4EE", text: "#08443C", lane: "#E7F7F4", check: "#10A290" },
  { id: "purple",   stroke: "#CBB3F7", deep: "#5328AD", soft: "#E2D5FB", text: "#2C1467", lane: "#EFE8FB", check: "#6E40D2" },
  { id: "pink",     stroke: "#FBB9D5", deep: "#9D2D5E", soft: "#FCD7E5", text: "#5A1535", lane: "#FCE5ED", check: "#D63D80" },
  { id: "orange",   stroke: "#FFC392", deep: "#A4480A", soft: "#FCDCBE", text: "#4F2104", lane: "#FCE6D2", check: "#D86B16" },
];

// ───────────────────────────────────────────────────────────────────
// Bar element — clean rectangle in the weekly-card style. Solid
// highlight-color fill, subject tile on the left, clean 6px corners.
// No marker-bleed, no rotation. Just a colored block.
// ───────────────────────────────────────────────────────────────────
const Brush = ({ tone, children, height = 56, minWidth = 120, full, padded = true }) => (
  <div style={{
    position: "relative", minWidth, height,
    width: full ? "100%" : undefined,
    display: "flex", alignItems: "center",
    background: tone.stroke,
    borderRadius: 6,
    border: `1px solid color-mix(in oklch, ${tone.deep} 30%, transparent)`,
  }}>
    <div style={{
      position: "relative", padding: padded ? "0 14px" : 0,
      width: "100%", display: "flex", alignItems: "center", gap: 10,
    }}>
      {children}
    </div>
  </div>
);

// ───────────────────────────────────────────────────────────────────
// MarkerBrush — flat bright-highlighter color rectangle (clean edges).
// Bright marker fill, slightly rounded corners, subtle inner shading.
// No turbulence / rough edge — just the marker color.
// ───────────────────────────────────────────────────────────────────
const MarkerBrush = ({ tone, children, height = 52, padded = true }) => (
  <div style={{
    position: "relative", width: "100%", height,
    background: tone.stroke,
    borderRadius: 8,
    border: `1px solid color-mix(in oklch, ${tone.deep} 25%, transparent)`,
    boxShadow: "inset 0 -2px 0 rgba(0,0,0,.04), inset 0 2px 0 rgba(255,255,255,.4)",
    display: "flex", alignItems: "center",
    padding: padded ? "0 14px" : 0,
    gap: 10,
  }}>
    {children}
  </div>
);

// ───────────────────────────────────────────────────────────────────
// StatusGlyph — used in the LESSONS row of both Roadmap and
// Progression views. Four states:
//   done       — filled subject-color circle with a check mark
//   skipped    — hollow gray ring
//   current    — soft fill in subject color with a dark ring
//   upcoming   — small gray dot
// ───────────────────────────────────────────────────────────────────
const StatusGlyph = ({ state, tone, size = 14 }) => {
  const t = tone || { check: "#107D3A", stroke: "#A0F0B8" };
  if (state === "done") {
    return (
      <span style={{
        width: size, height: size, borderRadius: 999,
        background: t.check, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width={size - 5} height={size - 5} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7"/></svg>
      </span>
    );
  }
  if (state === "skipped") {
    return <span style={{ width: size, height: size, borderRadius: 999, background: "#fff", border: "1.8px solid #94A3B8" }} />;
  }
  if (state === "current") {
    return <span style={{ width: size, height: size, borderRadius: 999, background: t.stroke, border: `2px solid ${t.check}` }} />;
  }
  return <span style={{ width: size, height: size, borderRadius: 999, background: "#E6E9F4", border: "1px solid #CFD4E2" }} />;
};

// Mini legend below the LESSONS row.
const StatusLegendCompact = () => (
  <div style={{ display: "flex", gap: 14, padding: "10px 16px", alignItems: "center", borderTop: "1px solid #F5F6FA", background: "#FAFBFC", flexWrap: "wrap" }}>
    <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>LESSON STATUS</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}><StatusGlyph state="done" size={12} tone={ROAD_TONES[1]} /> Completed</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}><StatusGlyph state="current" size={12} tone={ROAD_TONES[0]} /> In progress</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}><StatusGlyph state="skipped" size={12} /> Skipped</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}><StatusGlyph state="upcoming" size={12} /> Not yet encountered</span>
    <span style={{ width: 1, height: 16, background: "#E2E5F0" }} />
    <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>CHECKPOINTS & MILESTONES</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}>
      <span style={{ color: "#5B61F4" }}><IconFlag width="12" height="12" /></span> Unit Checkpoint
    </span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}>
      <span style={{ color: "#0F7E72" }}><IconFlag width="12" height="12" /></span> Mid-Unit Checkpoint
    </span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}>
      <span style={{ color: "#D9A41A" }}><IconStar width="12" height="12" /></span> Major Milestone
    </span>
    <div style={{ flex: 1 }} />
    <button style={{ fontSize: 11.5, color: "#5B6580", fontWeight: 600, background: "transparent", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>Collapse all <IconChev width="11" height="11" /></button>
  </div>
);

// Small icon helpers — kept inline so we don't pull from shared.jsx
const IconCal  = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
const IconBook = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V5z"/><path d="M4 21a2 2 0 0 1 2-2h13"/></svg>;
const IconLayers = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
const IconFlag = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>;
const IconStar = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z"/></svg>;
const IconChev = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>;
const IconArr = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
const IconUsers = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8"/></svg>;
const IconExport = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
const IconFilter = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16l-6 8v6l-4 2v-8z"/></svg>;
const IconPlus = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
const IconCheck = (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12l4 4 10-10"/></svg>;

// ───────────────────────────────────────────────────────────────────
// Header bar — used by both modes
// ───────────────────────────────────────────────────────────────────
const RoadHeader = ({ subtitle, modeRight }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 28px 14px" }}>
    <div style={{ flex: 1 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1F2A4E", letterSpacing: -0.5 }}>Curriculum Roadmap</h1>
      <div style={{ fontSize: 13, color: "#6E78A0", marginTop: 4 }}>{subtitle}</div>
    </div>
    {modeRight}
  </div>
);

const RoadButton = ({ children, icon: I, primary, active }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "8px 14px", borderRadius: 10,
    background: primary ? "#5B61F4" : (active ? "#EEF0FF" : "#fff"),
    color: primary ? "#fff" : (active ? "#5B61F4" : "#1F2A4E"),
    border: primary ? "0" : "1px solid #E2E5F0",
    fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
  }}>
    {I && <I width="15" height="15" />}
    {children}
  </span>
);

// ───────────────────────────────────────────────────────────────────
// ZOOMED OUT — months × lanes (first attached image)
// ───────────────────────────────────────────────────────────────────
const ROAD_LANES_ZOOM_OUT = [
  { id: "g5p1",  name: "5th Grade Math",  sub: "First Period",  meta: "Curriculum Lane", lane: "yellow",
    units: [
      { id: "u1", name: "Fractions",                         tone: "yellow",  month: 0, dates: "Sep 1 – Sep 27",   weeks: 4, lessons: 18 },
      { id: "u2", name: "Decimals",                          tone: "yellow",  month: 1, dates: "Sep 29 – Oct 24",  weeks: 4, lessons: 16 },
      { id: "u3", name: "Geometry",                          tone: "yellow",  month: 2, dates: "Nov 3 – Nov 28",   weeks: 4, lessons: 14 },
  ]},
  { id: "g5p2",  name: "5th Grade Math",  sub: "Second Period", meta: "Curriculum Lane", lane: "green",
    units: [
      { id: "u1", name: "Fractions Practice",                tone: "green",   month: 0, dates: "Sep 1 – Sep 26",   weeks: 4, lessons: 20 },
      { id: "u2", name: "Long Multiplication and Division Practice", tone: "green", month: 1, dates: "Sep 29 – Oct 31", weeks: 5, lessons: 22 },
      { id: "u3", name: "Proofs",                            tone: "green",   month: 2, dates: "Nov 3 – Nov 21",   weeks: 3, lessons: 12 },
  ]},
  { id: "mfacts", name: "Math Facts",     sub: "",            meta: "Curriculum Lane", lane: "cyan",
    units: [
      { id: "u1", name: "Ratio & Proportions",               tone: "cyan",    month: 0, dates: "Sep 1 – Sep 26",   weeks: 4, lessons: 16 },
      { id: "u2", name: "Expressions & Equations",           tone: "cyan",    month: 1, dates: "Sep 29 – Oct 31",  weeks: 5, lessons: 18 },
      { id: "u3", name: "Geometry Foundations",              tone: "cyan",    month: 2, dates: "Nov 3 – Nov 28",   weeks: 4, lessons: 14 },
  ]},
  { id: "g6p1",  name: "6th Grade Math",  sub: "First Period", meta: "Curriculum Lane", lane: "purple",
    units: [
      { id: "u1", name: "Ratio & Proportions",               tone: "purple",  month: 0, dates: "Sep 1 – Sep 26",   weeks: 4, lessons: 16 },
      { id: "u2", name: "Expressions & Equations",           tone: "purple",  month: 1, dates: "Sep 29 – Oct 31",  weeks: 5, lessons: 18 },
      { id: "u3", name: "Geometry Foundations",              tone: "purple",  month: 2, dates: "Nov 3 – Nov 28",   weeks: 4, lessons: 14 },
  ]},
];

const RoadmapZoomedOut = () => {
  // School days per month (Sep–Nov approx). Each day is one column.
  // Using actual school days only (no weekends), labeled F M T W R F M T...
  // to match the attached reference image.
  const monthDays = [
    { name: "SEPTEMBER", days: [
      { wkd: "F", n: 1 }, { wkd: "M", n: 4 }, { wkd: "T", n: 5 }, { wkd: "W", n: 6 }, { wkd: "R", n: 7 }, { wkd: "F", n: 8 },
      { wkd: "M", n: 11 }, { wkd: "T", n: 12 }, { wkd: "W", n: 13 }, { wkd: "R", n: 14 }, { wkd: "F", n: 15 },
      { wkd: "M", n: 18 }, { wkd: "T", n: 19 }, { wkd: "W", n: 20 }, { wkd: "R", n: 21 }, { wkd: "F", n: 22 },
      { wkd: "M", n: 25 }, { wkd: "T", n: 26 }, { wkd: "W", n: 27 }, { wkd: "R", n: 28 }, { wkd: "F", n: 29 },
    ]},
    { name: "OCTOBER", days: [
      { wkd: "M", n: 2 }, { wkd: "T", n: 3 }, { wkd: "W", n: 4 }, { wkd: "R", n: 5 }, { wkd: "F", n: 6 },
      { wkd: "M", n: 9 }, { wkd: "T", n: 10 }, { wkd: "W", n: 11 }, { wkd: "R", n: 12 }, { wkd: "F", n: 13 },
      { wkd: "M", n: 16 }, { wkd: "T", n: 17 }, { wkd: "W", n: 18 }, { wkd: "R", n: 19 }, { wkd: "F", n: 20 },
      { wkd: "M", n: 23 }, { wkd: "T", n: 24 }, { wkd: "W", n: 25 }, { wkd: "R", n: 26 }, { wkd: "F", n: 27 },
      { wkd: "M", n: 30 }, { wkd: "T", n: 31 },
    ]},
    { name: "NOVEMBER", days: [
      { wkd: "W", n: 1 }, { wkd: "R", n: 2 }, { wkd: "F", n: 3 },
      { wkd: "M", n: 6 }, { wkd: "T", n: 7 }, { wkd: "W", n: 8 }, { wkd: "R", n: 9 },
    ]},
  ];
  const totalDays = monthDays.reduce((n, m) => n + m.days.length, 0);
  const COL = 30; // each day column width in px

  // Build a flat day index → month boundary helper
  const dayCols = [];
  monthDays.forEach((m, mi) => {
    m.days.forEach((d, di) => dayCols.push({ ...d, monthIdx: mi, firstOfMonth: di === 0 }));
  });

  // Convert (monthIdx, dayN) → flat index in dayCols
  const findDayIdx = (monthIdx, dayN) => dayCols.findIndex(d => d.monthIdx === monthIdx && d.n === dayN);

  // Lane definitions with concrete start/end day ranges per unit.
  const LANES = [
    { id: "g5p1", name: "5th Grade Math - First Period", tone: "yellow", textTone: "rose",
      units: [
        { name: "Fractions",  startMonth: 0, startDay: 1,  endMonth: 0, endDay: 27, tone: "yellow", lessons: 18 },
        { name: "Decimals",   startMonth: 0, startDay: 29, endMonth: 1, endDay: 24, tone: "green",  lessons: 16 },
        { name: "Geometry",   startMonth: 1, startDay: 30, endMonth: 2, endDay: 9,  tone: "cyan",   lessons: 14 },
      ]
    },
    { id: "g5p2", name: "5th Grade Math - Second Period", tone: "yellow", textTone: "rose",
      units: [
        { name: "Fractions",  startMonth: 0, startDay: 1,  endMonth: 0, endDay: 26, tone: "yellow", lessons: 18 },
        { name: "Decimals",   startMonth: 0, startDay: 29, endMonth: 1, endDay: 31, tone: "green",  lessons: 16 },
        { name: "Geometry",   startMonth: 2, startDay: 1,  endMonth: 2, endDay: 9,  tone: "cyan",   lessons: 14 },
      ]
    },
    { id: "mfacts", name: "Math Facts", tone: "purple", textTone: "purple",
      units: [
        { name: "Fractions Practice", startMonth: 0, startDay: 1, endMonth: 0, endDay: 26, tone: "purple", lessons: 20 },
        { name: "Long Multiplication and Division Practice", startMonth: 0, startDay: 29, endMonth: 1, endDay: 31, tone: "purple", lessons: 22 },
        { name: "Proofs", startMonth: 2, startDay: 1, endMonth: 2, endDay: 9, tone: "purple", lessons: 12 },
      ]
    },
  ];

  // Class-header text colors — distinct per lane like the reference image
  const HEADER_COLORS = { rose: "#DC2D5E", purple: "#A04AC4", teal: "#0F7E72" };

  return (
    <div style={{ padding: "0 0 0", background: "#fff" }}>
      <RoadHeader subtitle="Day-by-day timeline of every unit across your curriculum."
        modeRight={
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 28px" }}>
            <RoadButton icon={IconCal}>Today</RoadButton>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, background: "#fff", color: "#1F2A4E", border: "1px solid #E2E5F0", fontSize: 13, fontWeight: 600 }}>Quarter 1 <IconChev width="13" height="13" /></span>
            <RoadButton icon={IconFilter}>Filters</RoadButton>
            <RoadButton icon={IconExport}>Export</RoadButton>
            <span style={{ width: 32, height: 32, borderRadius: 999, background: "#E0E7FF", color: "#3A4A95", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>MS</span>
          </div>
        }
      />

      {/* Status filter pill bar */}
      <div style={{ margin: "0 28px 14px", padding: "10px 16px", background: "#fff", border: "1px solid #E6E9F4", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: "#5B6580", fontWeight: 600 }}>Status filter</span>
        <button style={{ padding: "5px 14px", borderRadius: 999, background: "#EEF0FF", color: "#5B61F4", border: "1px solid #D8DAFB", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>All</button>
        {[
          { label: "Completed",          glyph: "done"     },
          { label: "In progress",        glyph: "current"  },
          { label: "Skipped",            glyph: "skipped"  },
          { label: "Not yet encountered",glyph: "upcoming" },
        ].map((s, i) => (
          <button key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 999, background: "#fff", color: "#1F2A4E", border: "1px solid #E2E5F0", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <StatusGlyph state={s.glyph} size={12} tone={ROAD_TONES[1]} /> {s.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "transparent", color: "#5B6580", border: 0, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear filters
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div style={{
        background: "#fff", border: "1px solid #E6E9F4", borderRadius: 14,
        boxShadow: "0 1px 2px rgba(20,22,32,.03)",
        margin: "0 28px", overflow: "hidden",
      }}>
        {/* Gradient month-header strip */}
        <div style={{ display: "flex", height: 28,
          background: "linear-gradient(90deg, #6FD7C5 0%, #B6E4A3 40%, #FFE780 75%, #5BC7B5 100%)",
        }}>
          <div style={{ width: 200, flex: "0 0 auto" }} />
          <div style={{ display: "flex", flex: 1 }}>
            {monthDays.map((m, i) => (
              <div key={i} style={{
                width: m.days.length * COL,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
                letterSpacing: 1.2, textShadow: "0 1px 2px rgba(0,0,0,.15)",
                borderRight: i < monthDays.length - 1 ? "1px solid rgba(255,255,255,.4)" : "none",
              }}>{m.name}</div>
            ))}
          </div>
        </div>

        {/* Day-column header (F M T W R F M T...) */}
        <div style={{ display: "flex", borderBottom: "1px solid #ECEEF7", background: "#fff" }}>
          <div style={{ width: 200, flex: "0 0 auto", padding: "8px 14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, borderRight: "1px solid #ECEEF7" }}>
            <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>DATE</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#5B6580", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>CURRICULUM LANES <IconChev width="9" height="9" /></span>
          </div>
          <div style={{ display: "flex", flex: 1, position: "relative" }}>
            {dayCols.map((d, i) => {
              const isToday = d.monthIdx === 1 && d.n === 9; // Today = Oct 9
              return (
                <div key={i} style={{
                  width: COL, flex: "0 0 auto", position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "4px 0 3px", borderLeft: d.firstOfMonth && i > 0 ? "2px solid #ECEEF7" : "1px solid #F5F6FA",
                  fontSize: 9, color: "#94A3B8",
                  background: isToday ? "rgba(91,97,244,.08)" : "transparent",
                }}>
                  <span style={{ fontSize: 9.5, fontWeight: 600 }}>{d.wkd}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#5B6580" }}>{d.n}</span>
                  {isToday && (
                    <span style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", background: "#5B61F4", color: "#fff", fontSize: 8.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4 }}>TODAY</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Lane sections */}
        {LANES.map((lane, li) => {
          // Lane-level progress: count "done" across all units (demo: 60% of first, etc.)
          const totalLessons = lane.units.reduce((n, u) => n + u.lessons, 0);
          const doneLessons  = Math.round(totalLessons * 0.62);
          const pct = Math.round((doneLessons / totalLessons) * 100);
          const laneTone = ROAD_TONES.find(t => t.id === lane.tone) || ROAD_TONES[0];
          return (
          <div key={lane.id} style={{ display: "flex", borderTop: li > 0 ? "1px solid #ECEEF7" : "none", position: "relative" }}>
            {/* Lane card — name, students, % complete + progress bar */}
            <div style={{
              width: 200, flex: "0 0 auto",
              borderRight: "1px solid #ECEEF7",
              background: laneTone.lane,
              padding: "14px 14px",
              display: "flex", flexDirection: "column", justifyContent: "center", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1F2A4E", letterSpacing: -0.1, lineHeight: 1.2, flex: 1 }}>{lane.name}</div>
                <span style={{ color: "#94A3B8", cursor: "pointer" }}><IconChev width="13" height="13" /></span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5B6580", fontWeight: 500 }}>
                <IconUsers width="12" height="12" /> 24 students
              </div>
              <div>
                <div style={{ height: 6, background: "rgba(255,255,255,.6)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: laneTone.check, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 11, color: "#1F2A4E", fontWeight: 700, marginTop: 4 }}>{pct}%</div>
              </div>
            </div>

            {/* Day grid: LESSONS row + UNITS row stacked */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* LESSONS row — per-day status glyphs */}
              <div style={{ position: "relative", height: 32, display: "flex", borderBottom: "1px solid #F5F6FA" }}>
                {dayCols.map((d, i) => {
                  const ownerUnit = lane.units.find(u => {
                    const s = findDayIdx(u.startMonth, u.startDay);
                    const e = findDayIdx(u.endMonth, u.endDay);
                    return i >= s && i <= e;
                  });
                  let state = null, glyphTone = null;
                  if (ownerUnit) {
                    const s = findDayIdx(ownerUnit.startMonth, ownerUnit.startDay);
                    const e = findDayIdx(ownerUnit.endMonth, ownerUnit.endDay);
                    const ratio = (i - s) / Math.max(1, (e - s));
                    if (ratio < 0.45) state = "done";
                    else if (ratio < 0.5) state = "skipped";
                    else if (ratio < 0.55) state = "current";
                    else state = "upcoming";
                    glyphTone = ROAD_TONES.find(t => t.id === ownerUnit.tone) || ROAD_TONES[0];
                  }
                  return (
                    <div key={i} style={{
                      width: COL, height: "100%",
                      borderLeft: d.firstOfMonth && i > 0 ? "2px solid #ECEEF7" : "1px solid #F5F6FA",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {state && <StatusGlyph state={state} tone={glyphTone} size={14} />}
                    </div>
                  );
                })}
              </div>

              {/* UNITS row — highlighter bars */}
              <div style={{ position: "relative", minHeight: 76, display: "flex" }}>
                {dayCols.map((d, i) => (
                  <div key={i} style={{
                    width: COL, height: "100%",
                    borderLeft: d.firstOfMonth && i > 0 ? "2px solid #ECEEF7" : "1px solid #F5F6FA",
                  }} />
                ))}
                {lane.units.map((u, ui) => {
                  const s = findDayIdx(u.startMonth, u.startDay);
                  const e = findDayIdx(u.endMonth, u.endDay);
                  if (s < 0 || e < 0) return null;
                  const tone = ROAD_TONES.find(t => t.id === u.tone) || ROAD_TONES[0];
                  return (
                    <div key={ui} style={{
                      position: "absolute",
                      left: s * COL + 4,
                      width: (e - s + 1) * COL - 8,
                      top: 8, height: 60,
                    }}>
                      <MarkerBrush tone={tone} height={60}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: "rgba(255,255,255,.55)", color: tone.text,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, flex: "0 0 auto",
                        }}>U{ui + 1}</span>
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: tone.text, letterSpacing: -0.2, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: tone.text, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
                            <IconBook width="10" height="10" /> {u.lessons} lessons
                          </div>
                        </div>
                      </MarkerBrush>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right kebab */}
            <button style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              width: 24, height: 24, borderRadius: 6, background: "transparent",
              border: 0, color: "#94A3B8", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
            </button>
          </div>
          );
        })}
        <StatusLegendCompact />
      </div>

      {/* Bottom stat strip */}
      <div style={{
        margin: "18px 28px 0",
        background: "#fff", border: "1px solid #E6E9F4", borderRadius: 14,
        boxShadow: "0 1px 2px rgba(20,22,32,.03)",
        padding: "16px 22px",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
      }}>
        <BottomStat tone="purple" icon={IconBook} label="Total Units"      value="9" />
        <BottomStat tone="yellow" icon={IconBook} label="Total Lessons"    value="150" />
        <BottomStat tone="green"  icon={IconCal}  label="Weeks in View"    value="10 weeks" caption="Sep 1 – Nov 9" />
        <BottomStat tone="purple" icon={IconUsers} label="Curriculum Lanes" value="3" />
      </div>
    </div>
  );
};

const Pillule = ({ icon: I, text }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 8px 3px 7px", background: "rgba(255,255,255,.55)",
    borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: "#1F2A4E",
    border: "1px solid rgba(0,0,0,.06)",
  }}>
    <I width="11" height="11" /> {text}
  </span>
);

const BottomStat = ({ tone, icon: I, label, value, caption }) => {
  const t = ROAD_TONES.find(x => x.id === tone);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 44, height: 44, borderRadius: 12,
        background: t.lane, color: t.deep,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}><I width="20" height="20" /></span>
      <div>
        <div style={{ fontSize: 12, color: "#6E78A0", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1F2A4E", letterSpacing: -0.3 }}>{value}</div>
        {caption && <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 1 }}>{caption}</div>}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// ZOOMED IN — weeks × lanes (second attached image)
// ───────────────────────────────────────────────────────────────────
const ROAD_LANES_ZOOM_IN = [
  { id: "g5p1", name: "5th Grade Math", sub: "First Period",  students: 24, complete: 72, tone: "yellow",
    units: [
      { name: "Fractions",   status: "IN PROGRESS", lessons: 18, weeks: [0, 1, 2, 3],   doneIdx: 12 },
      { name: "Decimals",    status: "IN PROGRESS", lessons: 16, weeks: [4, 5, 6, 7],   doneIdx: 11 },
      { name: "Geometry",    status: "UPCOMING",    lessons: 14, weeks: [9, 10, 11],     doneIdx: 0 },
    ],
    checkpoints: [{ weekIdx: 8, label: "Unit Checkpoint", date: "Oct 10" }],
  },
  { id: "g5p2", name: "5th Grade Math", sub: "Second Period", students: 24, complete: 68, tone: "green",
    units: [
      { name: "Fractions",   status: "COMPLETE",    lessons: 18, weeks: [0, 1, 2, 3],   doneIdx: 18 },
      { name: "Decimals",    status: "IN PROGRESS", lessons: 16, weeks: [4, 5, 6, 7],   doneIdx: 10 },
      { name: "Geometry",    status: "UPCOMING",    lessons: 14, weeks: [9, 10, 11],     doneIdx: 0 },
    ],
    checkpoints: [{ weekIdx: 8, label: "Unit Checkpoint", date: "Oct 15" }],
  },
  { id: "mfacts", name: "Math Facts", sub: "",                students: 24, complete: 85, tone: "cyan",
    units: [
      { name: "Fractions Practice",                            status: "COMPLETE",    lessons: 20, weeks: [0, 1, 2, 3],  doneIdx: 20 },
      { name: "Long Multiplication & Division Practice",       status: "IN PROGRESS", lessons: 22, weeks: [4, 5, 6, 7],  doneIdx: 15 },
      { name: "Proofs",                                        status: "UPCOMING",    lessons: 12, weeks: [9, 10, 11],   doneIdx: 0 },
    ],
    checkpoints: [{ weekIdx: 8, label: "Mastery Check", date: "Oct 24" }],
  },
  { id: "g6p1", name: "6th Grade Math", sub: "First Period",  students: 22, complete: 55, tone: "purple",
    units: [
      { name: "Ratio & Proportions",                           status: "COMPLETE",    lessons: 16, weeks: [0, 1, 2, 3],  doneIdx: 16 },
      { name: "Expressions & Equations",                       status: "MODIFIED",    lessons: 18, weeks: [4, 5, 6, 7],  doneIdx: 8 },
      { name: "Geometry Foundations",                          status: "UPCOMING",    lessons: 14, weeks: [9, 10, 11],   doneIdx: 0 },
    ],
    checkpoints: [{ weekIdx: 8, label: "Assessment", date: "Oct 17" }],
  },
];

const ROAD_WEEKS = [
  "Aug 25 – 31", "Sep 1 – 7", "Sep 8 – 14", "Sep 15 – 21",
  "Sep 22 – 28", "Sep 29 – Oct 5", "Oct 6 – 12", "Oct 13 – 19",
  "Oct 20 – 26", "Oct 27 – Nov 2", "Nov 3 – 9", "Nov 10 – 16", "Nov 17 – 23",
];

const StatusPill = ({ status }) => {
  const map = {
    "IN PROGRESS": { bg: "#FFE7A8", fg: "#7A4F08" },
    "COMPLETE":    { bg: "#CFF0D8", fg: "#107D3A" },
    "MODIFIED":    { bg: "#FFDDC2", fg: "#A4480A" },
    "UPCOMING":    { bg: "#E2E5F0", fg: "#5B6580" },
    "NOT STARTED": { bg: "#E2E5F0", fg: "#5B6580" },
  };
  const m = map[status] || map.UPCOMING;
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
      padding: "2px 8px", borderRadius: 4,
      background: m.bg, color: m.fg,
    }}>{status}</span>
  );
};

const LessonDot = ({ tone, state }) => {
  const t = ROAD_TONES.find(x => x.id === tone) || ROAD_TONES[0];
  let fill = "#fff", bd = "#CBD5E1";
  if (state === "done") { fill = t.check; bd = t.check; }
  else if (state === "current") { fill = t.stroke; bd = t.check; }
  return (
    <span style={{
      width: 9, height: 9, borderRadius: 999, background: fill,
      border: `1.5px solid ${bd}`, flex: "0 0 auto",
    }} />
  );
};

const RoadmapZoomedIn = () => (
  <div>
    <RoadHeader subtitle="Plan units, track progress, and stay aligned across your curriculum."
      modeRight={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            display: "inline-flex", padding: 4, background: "#fff",
            border: "1px solid #E2E5F0", borderRadius: 10,
          }}>
            <span style={{ padding: "6px 14px", borderRadius: 7, background: "#EEF0FF", color: "#5B61F4", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h6l3-8 3 16 3-8h3"/></svg>
              Roadmap
            </span>
            <span style={{ padding: "6px 14px", color: "#6E78A0", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
              Board
            </span>
          </div>
          <RoadButton icon={IconFilter}>Filters</RoadButton>
          <RoadButton icon={IconUsers}>Share</RoadButton>
          <RoadButton icon={IconPlus} primary>Add Unit</RoadButton>
          <span style={{ width: 32, height: 32, borderRadius: 999, background: "#E0E7FF", color: "#3A4A95", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>MS</span>
        </div>
      }
    />

    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #E6E9F4",
      boxShadow: "0 1px 2px rgba(20,22,32,.03)",
      margin: "0 28px", overflow: "hidden",
    }}>
      {/* Top scrub bar + week header */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", borderBottom: "1px solid #ECEEF7" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E2E5F0", color: "#5B6580", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6"/></svg>
          </span>
          <span style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E2E5F0", color: "#5B6580", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <IconCal width="14" height="14" />
          </span>
          <span style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E2E5F0", color: "#5B6580", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
          </span>
          <span style={{ padding: "5px 13px", border: "1px solid #E2E5F0", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "#1F2A4E" }}>Today</span>
        </div>
        <div style={{ overflowX: "auto", padding: "10px 4px 8px" }}>
          {/* month strip */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROAD_WEEKS.length}, minmax(108px, 1fr))`, fontSize: 11, fontWeight: 700, color: "#1F2A4E", letterSpacing: 0.5, padding: "0 0 5px" }}>
            <div style={{ gridColumn: "2 / span 5", textAlign: "center" }}>SEPTEMBER</div>
            <div style={{ gridColumn: "7 / span 4", textAlign: "center" }}>OCTOBER</div>
            <div style={{ gridColumn: "11 / span 3", textAlign: "center" }}>NOVEMBER</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROAD_WEEKS.length}, minmax(108px, 1fr))`, fontSize: 10.5, color: "#94A3B8", padding: "0 4px" }}>
            {ROAD_WEEKS.map((w, i) => (
              <div key={i} style={{ textAlign: "center", borderLeft: i > 0 ? "1px dashed #ECEEF7" : "none" }}>{w}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Lane rows */}
      {ROAD_LANES_ZOOM_IN.map((lane, li) => {
        const tone = ROAD_TONES.find(t => t.id === lane.tone);
        return (
          <div key={lane.id} style={{
            display: "grid", gridTemplateColumns: "220px 1fr",
            borderTop: li > 0 ? "1px solid #ECEEF7" : "none",
          }}>
            {/* Class summary */}
            <div style={{
              padding: "16px 16px", background: tone.lane,
              display: "flex", flexDirection: "column", gap: 8, justifyContent: "center",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2A4E", letterSpacing: -0.2, lineHeight: 1.2 }}>{lane.name}</div>
                {lane.sub && <div style={{ fontSize: 12, color: "#5B6580", marginTop: 1 }}>{lane.sub}</div>}
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5B6580", fontWeight: 500 }}>
                <IconUsers width="12" height="12" /> {lane.students} Students
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#5B6580", fontWeight: 600 }}>{lane.complete}% Complete</div>
                <div style={{ height: 6, background: "rgba(255,255,255,.6)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${lane.complete}%`, height: "100%", background: tone.check, borderRadius: 999 }} />
                </div>
              </div>
              <span style={{ display: "inline-flex", alignSelf: "flex-end", width: 26, height: 26, borderRadius: 7, background: "#fff", border: "1px solid #E2E5F0", color: tone.deep, alignItems: "center", justifyContent: "center" }}>
                <IconChev width="14" height="14" />
              </span>
            </div>

            {/* Timeline column */}
            <div style={{ position: "relative", padding: "16px 4px", overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${ROAD_WEEKS.length}, minmax(108px, 1fr))`, gap: 0, alignItems: "center" }}>
                {/* Background week lines */}
                {ROAD_WEEKS.map((_, i) => (
                  <div key={i} style={{ gridColumn: `${i + 1} / span 1`, gridRow: 1, height: 90, borderLeft: i > 0 ? "1px dashed #F1F3F9" : "none" }} />
                ))}
                {/* Unit brushes */}
                {lane.units.map((u, ui) => {
                  const first = u.weeks[0] + 1;
                  const span = u.weeks.length;
                  return (
                    <div key={ui} style={{
                      gridColumn: `${first} / span ${span}`, gridRow: 1,
                      padding: "0 6px", display: "flex", alignItems: "center",
                    }}>
                      <Brush tone={tone} full height={44}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: "rgba(255,255,255,.6)", color: tone.deep,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, letterSpacing: 0.3, flex: "0 0 auto",
                        }}>U{ui + 1}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", overflow: "hidden", minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: tone.text, letterSpacing: -0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{u.name}</span>
                          <StatusPill status={u.status} />
                        </div>
                      </Brush>
                    </div>
                  );
                })}
                {/* Star button (right edge) */}
                <div style={{ position: "absolute", top: 14, right: 8, color: "#CBD5E1" }}>
                  <IconStar width="16" height="16" />
                </div>
              </div>

              {/* Lesson count + dots row, per unit */}
              <div style={{
                display: "grid", gridTemplateColumns: `repeat(${ROAD_WEEKS.length}, minmax(108px, 1fr))`,
                gap: 0, marginTop: 6, alignItems: "center",
              }}>
                {lane.units.map((u, ui) => {
                  const first = u.weeks[0] + 1;
                  const span = u.weeks.length;
                  // 5 school days per week — each dot represents a real day.
                  // Position dots evenly across the unit's date range.
                  const totalDays = span * 5;
                  return (
                    <div key={ui} style={{
                      gridColumn: `${first} / span ${span}`,
                      padding: "0 6px",
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <span style={{ fontSize: 10.5, color: "#5B6580", fontWeight: 500 }}>{u.lessons} Lessons · {totalDays} school days</span>
                      <div style={{
                        position: "relative", height: 14, width: "100%",
                      }}>
                        {/* Spread dots evenly so each maps to a date slot */}
                        {Array.from({ length: u.lessons }).map((_, i) => {
                          const state = i < u.doneIdx ? "done" : (i === u.doneIdx ? "current" : "upcoming");
                          // Map dot i (out of u.lessons) onto its day in totalDays
                          // by stretching the lessons evenly across the date range.
                          const dayIdx = u.lessons === 1 ? 0 : Math.round((i / Math.max(1, u.lessons - 1)) * (totalDays - 1));
                          const left = `calc(${(dayIdx / Math.max(1, totalDays - 1)) * 100}% - 5px)`;
                          return (
                            <span key={i} style={{
                              position: "absolute", left, top: 2,
                              width: 9, height: 9, borderRadius: 999,
                              background: state === "done" ? tone.check : (state === "current" ? tone.stroke : "#fff"),
                              border: `1.5px solid ${state === "done" ? tone.check : (state === "current" ? tone.check : "#CBD5E1")}`,
                            }} />
                          );
                        })}
                        {u.status === "COMPLETE" && (
                          <span style={{
                            position: "absolute", right: -22, top: -1,
                            width: 16, height: 16, borderRadius: 999,
                            background: tone.check, color: "#fff",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <IconCheck width="10" height="10" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Checkpoints overlay — sit between units */}
              {lane.checkpoints.map((cp, ci) => (
                <div key={ci} style={{
                  position: "absolute",
                  left: `calc(${(cp.weekIdx / ROAD_WEEKS.length) * 100}% + 6px)`,
                  top: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 999,
                    background: "#fff", border: `2px solid ${tone.check}`,
                    color: tone.check, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <IconFlag width="15" height="15" />
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#5B6580", letterSpacing: -0.1, textAlign: "center", lineHeight: 1.2 }}>
                    {cp.label}<br/><span style={{ color: "#94A3B8" }}>{cp.date}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>

    {/* Status legend + summary */}
    <div style={{
      margin: "18px 28px 0",
      background: "#fff", border: "1px solid #E6E9F4", borderRadius: 14,
      boxShadow: "0 1px 2px rgba(20,22,32,.03)",
      padding: "16px 22px",
      display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 24, alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>STATUS LEGEND</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <StatusPill status="COMPLETE" />
          <StatusPill status="IN PROGRESS" />
          <StatusPill status="MODIFIED" />
          <StatusPill status="UPCOMING" />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>LESSON PROGRESS</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#1F2A4E" }}><LessonDot tone="green" state="done" />Complete</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#1F2A4E" }}><LessonDot tone="green" state="current" />In Progress</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#1F2A4E" }}><LessonDot tone="green" state="upcoming" />Not Started</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>ROADMAP SUMMARY</div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <SmallStat tone="purple" icon={IconBook} value="12" label="Units" />
          <SmallStat tone="yellow" icon={IconBook} value="188" label="Lessons" />
          <SmallStat tone="green"  icon={IconLayers} value="67%" label="Avg. Progress" />
        </div>
      </div>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "9px 14px", border: "1px solid #E2E5F0", borderRadius: 10,
        fontSize: 12.5, fontWeight: 600, color: "#1F2A4E",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 7-7"/><path d="M14 7h7v7"/></svg>
        View Analytics
      </span>
    </div>
  </div>
);

const SmallStat = ({ tone, icon: I, value, label }) => {
  const t = ROAD_TONES.find(x => x.id === tone);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: t.lane, color: t.deep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <I width="14" height="14" />
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2A4E", letterSpacing: -0.2, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Wrapper artboard — full subject page with both modes + a toggle
// ───────────────────────────────────────────────────────────────────
const ABRoadmap = () => {
  const [mode, setMode] = React.useState("zoomedout");
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#F4F6FB", overflow: "auto",
    }}>
      <BrushDefs />

      {/* Top tab toggle */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "18px 28px 0",
      }}>
        <div style={{ display: "inline-flex", padding: 4, background: "#fff", border: "1px solid #E2E5F0", borderRadius: 10 }}>
          {[
            { id: "zoomedout", label: "Roadmap",     sub: "Monthly overview" },
            { id: "zoomedin",  label: "Progression", sub: "Day-by-day calendar" },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "7px 14px", borderRadius: 7, border: 0, cursor: "pointer",
              background: mode === m.id ? "#EEF0FF" : "transparent",
              color: mode === m.id ? "#5B61F4" : "#6E78A0",
              fontSize: 12.5, fontWeight: 700, letterSpacing: -0.1,
              display: "flex", flexDirection: "column", alignItems: "flex-start",
            }}>
              <span>{m.label}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: mode === m.id ? "#5B61F4" : "#94A3B8" }}>{m.sub}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ paddingTop: 20, paddingBottom: 28 }}>
        {mode === "zoomedout" ? <RoadmapZoomedIn /> : <RoadmapZoomedOut />}
      </div>
    </div>
  );
};

Object.assign(window, { ABRoadmap });
