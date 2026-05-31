// mock523-v2.jsx — Fresh focused mockups for the 5.23.26 page.
//
// What's new (vs the 4.10.26 reference page):
//   • Subject page rebuilt with a colorful Unit Timeline (months ×
//     periods × subject-tinted unit bars, modeled on the attached
//     unit-timeline image) PLUS unit-health cards (coverage %,
//     skipped count, standards covered, a "Don't miss" callout).
//   • Original Resources-by-type sort kept — moved to the bottom of
//     the Subject page so it's still reachable for hunting assets.
//   • New list-view variants for Weekly, Daily, Subject — all using
//     the highlight palette aesthetic from the Weekly mock. Same row
//     anatomy across the three views so the rhythm carries.
//
// Re-uses chrome (TopBar523, LeftRail523, RightDock523, M523_SUBJ,
// M523_DAYS) from artboards-mock523.jsx so the new pages slot into
// the same shell.

// ───────────────────────────────────────────────────────────────────
// 1 · Subject page — Unit Timeline + Unit health + List + Resources
// ───────────────────────────────────────────────────────────────────

// Curriculum-year unit roster for Math. Roughly aligned with what a
// real 5th-grade scope-and-sequence looks like, so the demo lands in
// a teacher's vocabulary.
const M523V2_UNITS = [
  { id: "u1", name: "Place Value & Powers of 10", start: 0,  end: 17,  color: "ocean",     done: 18, total: 18, skipped: 0, standardsCovered: 6, standardsTotal: 6, dontMiss: "Number-talk routine launched on day 1 — keep it as the warm-up everywhere going forward." },
  { id: "u2", name: "Multi-digit Multiplication",  start: 18, end: 40,  color: "leaf",     done: 21, total: 23, skipped: 2, standardsCovered: 4, standardsTotal: 5, dontMiss: "Standard algorithm intro — slow it down for the bottom group. Partial-products bridge needs a re-teach." },
  { id: "u3", name: "Fractions on a Number Line",  start: 41, end: 70,  color: "blush",    done: 2,  total: 8,  skipped: 0, standardsCovered: 3, standardsTotal: 5, dontMiss: "Bake-sale anchor problem is the through-line — every mini-lesson references it.", current: true },
  { id: "u4", name: "Operations with Fractions",   start: 71, end: 105, color: "writing",  done: 0,  total: 12, skipped: 0, standardsCovered: 0, standardsTotal: 4, dontMiss: "Lead with addition / subtraction before multiplication. Common-denominator intuition gates the rest." },
  { id: "u5", name: "Decimals",                    start: 106, end: 140, color: "amber",   done: 0,  total: 14, skipped: 0, standardsCovered: 0, standardsTotal: 5, dontMiss: "Money + measurement contexts before pure number work. Tenths/hundredths grid is the anchor." },
  { id: "u6", name: "Geometry & Measurement",      start: 141, end: 170, color: "ufli",    done: 0,  total: 10, skipped: 0, standardsCovered: 0, standardsTotal: 4, dontMiss: "Geometry through real-world objects — bring in the volume manipulatives early." },
];

// 36 weeks across the year. We compact the day index for the timeline
// to ~170 grid cells (one per school day).
const M523V2_MONTHS = [
  { name: "AUG", days: 8 },
  { name: "SEP", days: 22 },
  { name: "OCT", days: 22 },
  { name: "NOV", days: 18 },
  { name: "DEC", days: 14 },
  { name: "JAN", days: 22 },
  { name: "FEB", days: 19 },
  { name: "MAR", days: 22 },
  { name: "APR", days: 21 },
  { name: "MAY", days: 22 },
];
const M523V2_TOTAL_DAYS = M523V2_MONTHS.reduce((n, m) => n + m.days, 0);

// Period definitions — used for the second row in the timeline so the
// design reads "two periods on the same plan" like the user's image.
const M523V2_PERIODS = [
  { id: "p1", name: "5th Grade Math · 1st Period" },
  { id: "p2", name: "5th Grade Math · 2nd Period" },
];

// Highlight-palette per-color hex (saturated + soft) — bumped to read
// like Stabilo/Mildliner markers as the user asked.
const M523V2_COLOR = {
  ocean:    { soft: "#BFD9FE", mid: "#7FB6FF", deep: "#1A4ED9", name: "Place Value & Powers of 10" },
  leaf:     { soft: "#CCF4BB", mid: "#9CF488", deep: "#188542" },
  blush:    { soft: "#FCD0DA", mid: "#FFA1C9", deep: "#B22368" },
  writing:  { soft: "#DFD0FB", mid: "#C7A8FF", deep: "#5E2EE0" },
  amber:    { soft: "#FDE7A2", mid: "#FFD86B", deep: "#A66A0E" },
  ufli:     { soft: "#FCD3BB", mid: "#FFA984", deep: "#C7401E" },
};

// Build a continuous day-spec list so the timeline can render columns
// alongside month group headers.
const dayOffsetForUnit = (start) => {
  let counter = 0;
  for (const m of M523V2_MONTHS) {
    if (counter + m.days > start) return { month: m, dayIn: start - counter };
    counter += m.days;
  }
  return null;
};

// ── Subject Page V2 ─────────────────────────────────────────────────
const ABSubjectV2 = () => (
  <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
    <window.TopBar523 active="subject" />
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <window.LeftRail523 active="subject" />

      {/* Subjects sidebar */}
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
          const subj = window.M523_SUBJ[s.id];
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 7,
              background: s.active ? "#F1F5F9" : "transparent",
              color: "#0B181E",
            }}>
              <span style={{ width: 3, height: 16, background: subj.deep, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: s.active ? 700 : 500, flex: 1 }}>{s.label}</span>
              {s.count && <span style={{ fontSize: 10.5, fontWeight: 600, color: "#64748B" }}>{s.count}</span>}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 26px 28px", background: "#fff" }}>
        {/* Header */}
        <div style={{ fontSize: 10.5, color: "#3B82F6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: "#3B82F6", borderRadius: 2 }} /> SUBJECT
        </div>
        <h1 style={{ margin: "4px 0 4px", fontSize: 30, fontWeight: 700, color: "#0B181E", letterSpacing: -0.6 }}>Math</h1>
        <div style={{ fontSize: 13, color: "#475569" }}>Grade 5 · 36-week scope</div>

        {/* Big stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, marginTop: 16, paddingBottom: 16, borderBottom: "1px solid #F2F4F8" }}>
          <Stat2 label="DONE"           value="41 / 85"  caption="lessons taught" />
          <Stat2 label="COMPLETE"       value="48%"      caption="of the year" />
          <Stat2 label="STANDARDS"      value="13 / 29"  caption="taught at least once" />
          <Stat2 label="SKIPPED"        value="2"        caption="lessons" tone="#C7401E" />
          <Stat2 label="RESOURCES"      value="62"       caption="across all units" />
        </div>

        {/* Unit Timeline removed — calendar/roadmap lives on the Year view (see R1 above). */}

        {/* Unit health cards */}
        <SectionHeader kicker="Unit health" title="Each unit at a glance" hint="What's done, what got skipped, which standards are covered, and the one move a teacher really doesn't want to forget." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {M523V2_UNITS.map(u => <UnitHealthCard key={u.id} unit={u} />)}
        </div>

        {/* Current-unit lesson list */}
        <SectionHeader kicker="Current unit · Unit 3" title="Fractions on a Number Line — lesson list" hint="The familiar by-unit lesson list from the original Subject page, kept here for triage and quick drill-in." />
        <UnitLessonList />

        {/* Resources at bottom */}
        <SectionHeader kicker="Resources" title="All Math resources" hint="Same all-resources sort as the original Subject page — moved to the bottom so it's there when you need it without taking the top of the screen." />
        <ResourcesSort />
      </div>
    </div>
  </div>
);

// ── Subhelpers ──────────────────────────────────────────────────────
const SectionHeader = ({ kicker, title, hint }) => (
  <div style={{ marginTop: 24, marginBottom: 12 }}>
    <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: "#0B181E", marginTop: 2, letterSpacing: -0.3 }}>{title}</div>
    {hint && <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>{hint}</div>}
  </div>
);

const Stat2 = ({ label, value, caption, tone = "#3B82F6" }) => (
  <div>
    <div style={{ fontSize: 10, color: tone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4, marginTop: 1 }}>{value}</div>
    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{caption}</div>
  </div>
);

// Unit Timeline — months row, then periods. Each period has a dotted
// lessons row and a unit-bar row.
const UnitTimeline = () => {
  const cellWidth = 6;
  const totalWidth = M523V2_TOTAL_DAYS * cellWidth;
  return (
    <div style={{
      border: "1px solid #ECEFF4", borderRadius: 12, overflow: "hidden",
      background: "linear-gradient(180deg, #CFEAFE 0%, #DBF7E8 25%, #FFF8C8 60%, #FCDCE6 100%)",
      padding: 14, marginBottom: 12,
    }}>
      <div style={{ overflowX: "auto", overflowY: "hidden", background: "#fff", borderRadius: 8 }}>
        <div style={{ minWidth: totalWidth + 200, padding: "12px 0 14px" }}>
          {/* Month row */}
          <div style={{ display: "flex" }}>
            <div style={{ width: 200, flex: "0 0 auto" }} />
            {M523V2_MONTHS.map((m, i) => (
              <div key={i} style={{
                width: m.days * cellWidth, flex: "0 0 auto",
                fontSize: 11, fontWeight: 700, color: "#475569",
                letterSpacing: 0.6, textAlign: "center",
                borderRight: i < M523V2_MONTHS.length - 1 ? "1px solid #F2F4F8" : "none",
                padding: "0 0 6px",
              }}>{m.name}</div>
            ))}
          </div>
          {/* Per-day vertical guideline strip (subtle) */}
          <div style={{ display: "flex", height: 6, marginBottom: 4 }}>
            <div style={{ width: 200, flex: "0 0 auto" }} />
            {M523V2_MONTHS.map((m, i) => (
              <div key={i} style={{
                width: m.days * cellWidth, height: "100%",
                backgroundImage: `linear-gradient(to right, #EEF2F6 1px, transparent 1px)`,
                backgroundSize: `${cellWidth}px 100%`,
                borderRight: i < M523V2_MONTHS.length - 1 ? "1px solid #E2E8F0" : "none",
              }} />
            ))}
          </div>

          {/* Period rows */}
          {M523V2_PERIODS.map(p => (
            <div key={p.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", padding: "8px 12px 4px", fontSize: 12, fontWeight: 700, color: "#1A4ED9", borderTop: "1px solid #F2F4F8" }}>
                {p.name}
              </div>
              {/* Lessons row (dotted) */}
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #F8FAFC" }}>
                <div style={{ width: 200, flex: "0 0 auto", padding: "0 12px", fontSize: 10, color: "#94A3B8", fontWeight: 700, letterSpacing: 0.6 }}>LESSONS</div>
                <div style={{ position: "relative", height: 18, flex: "0 0 auto", width: totalWidth }}>
                  {Array.from({ length: M523V2_TOTAL_DAYS }).map((_, d) => {
                    // Show a dot if any unit covers this day
                    const unit = M523V2_UNITS.find(u => d >= u.start && d < u.end);
                    if (!unit) return null;
                    const taught = unit.done > (d - unit.start);
                    return (
                      <span key={d} style={{
                        position: "absolute", left: d * cellWidth + cellWidth / 2 - 2, top: 6,
                        width: 4, height: 4, borderRadius: 999,
                        background: taught ? "#3B82F6" : "#fff",
                        border: `1px solid ${taught ? "#3B82F6" : "#CBD5E1"}`,
                      }} />
                    );
                  })}
                </div>
              </div>
              {/* Units row */}
              <div style={{ display: "flex", alignItems: "center", padding: "8px 0 6px" }}>
                <div style={{ width: 200, flex: "0 0 auto", padding: "0 12px", fontSize: 10, color: "#94A3B8", fontWeight: 700, letterSpacing: 0.6 }}>UNITS</div>
                <div style={{ position: "relative", height: 36, flex: "0 0 auto", width: totalWidth }}>
                  {M523V2_UNITS.map(u => {
                    const c = M523V2_COLOR[u.color];
                    const left = u.start * cellWidth;
                    const width = (u.end - u.start) * cellWidth - 2;
                    const isCurrent = u.current;
                    const isPast = u.done === u.total;
                    return (
                      <div key={u.id} style={{
                        position: "absolute", left, top: 0, width, height: 32,
                        background: isPast ? c.mid : isCurrent ? c.soft : `color-mix(in oklch, ${c.soft} 55%, #fff)`,
                        border: isCurrent ? `2px solid ${c.deep}` : `1px solid ${c.deep}33`,
                        borderRadius: 6, padding: "0 9px",
                        display: "flex", alignItems: "center",
                        opacity: u.start > 105 ? 0.7 : 1,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.deep, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Unit health card — colorful, dense, scannable
const UnitHealthCard = ({ unit }) => {
  const c = M523V2_COLOR[unit.color];
  const pct = Math.round((unit.done / unit.total) * 100);
  return (
    <div style={{
      position: "relative", background: "#fff",
      border: unit.current ? `2px solid ${c.deep}` : "1px solid #ECEFF4",
      borderRadius: 12, padding: "14px 16px",
      boxShadow: "0 1px 2px rgba(11,24,30,.03)",
    }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: c.mid, borderRadius: "12px 12px 0 0" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 4, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: c.soft, color: c.deep, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>U{unit.id.replace("u", "")}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2, lineHeight: 1.25 }}>{unit.name}</div>
        </div>
        {unit.current && <span style={{ fontSize: 10, fontWeight: 700, color: "#7A4F08", background: "#FDE68A", padding: "2px 9px", borderRadius: 999, letterSpacing: 0.5 }}>NOW</span>}
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", flex: "0 0 auto" }}>COVERED</span>
        <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: c.deep, borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.deep, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>{pct}%</span>
        <span style={{ fontSize: 11, color: "#94A3B8", flex: "0 0 auto" }}>{unit.done}/{unit.total}</span>
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6 }}>STANDARDS</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0B181E", marginTop: 1 }}>{unit.standardsCovered} <span style={{ color: "#94A3B8", fontWeight: 500 }}>/ {unit.standardsTotal}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6 }}>SKIPPED</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: unit.skipped > 0 ? "#C7401E" : "#0B181E", marginTop: 1 }}>{unit.skipped}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6 }}>WHEN</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 1 }}>{monthRange(unit)}</div>
        </div>
      </div>

      {/* Don't miss callout */}
      {unit.dontMiss && (
        <div style={{
          marginTop: 12, padding: "9px 12px",
          background: c.soft, borderRadius: 8,
          display: "flex", gap: 9, alignItems: "flex-start",
        }}>
          <span style={{
            fontSize: 9, fontWeight: 800, color: c.deep,
            background: "#fff", padding: "2px 7px", borderRadius: 999,
            letterSpacing: 0.6, marginTop: 1, flex: "0 0 auto",
          }}>DON'T MISS</span>
          <span style={{ fontSize: 12, color: c.deep, lineHeight: 1.5, textWrap: "pretty", flex: 1 }}>{unit.dontMiss}</span>
        </div>
      )}
    </div>
  );
};

const monthRange = (unit) => {
  const a = dayOffsetForUnit(unit.start);
  const b = dayOffsetForUnit(unit.end - 1);
  if (!a || !b) return "—";
  if (a.month.name === b.month.name) return a.month.name;
  return `${a.month.name} → ${b.month.name}`;
};

// Reuse the original by-unit lesson list (the same one the live build shows)
const UnitLessonList = () => {
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
  return (
    <div style={{ border: "1px solid #ECEFF4", borderRadius: 10 }}>
      {M523_SUBJECT_LESSONS.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < M523_SUBJECT_LESSONS.length - 1 ? "1px solid #F8FAFC" : "none" }}>
          <span style={{ color: "#94A3B8" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg></span>
          <span style={{
            width: 14, height: 14, borderRadius: 4, flex: "0 0 auto",
            background: l.done ? "#10B981" : "#fff",
            border: l.done ? "1.5px solid #10B981" : "1.5px solid #CBD5E1",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{l.done && <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7"/></svg>}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, textDecoration: l.strike ? "line-through" : "none", color: l.strike ? "#94A3B8" : "#0B181E" }}>{l.title}</span>
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
  );
};

// Resources sort — the original all-resources table from the live build
const ResourcesSort = () => {
  const RESOURCES = [
    { kind: "tools",  title: "Area model deck",          ctx: "Equivalent fractions — area models", unit: "Unit 1" },
    { kind: "video",  title: "Fraction Basics",          ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "link",   title: "What is a Fraction?",      ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "tools",  title: "Fractions Overview",       ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "link",   title: "Khan Academy",             ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "tools",  title: "Fraction Wall Poster",     ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "tools",  title: "Anchor Chart Template",    ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "tools",  title: "Fraction Examples Sheet",  ctx: "Equivalent fractions warm-up",       unit: "Unit 3" },
    { kind: "video",  title: "Bar Models (4 min)",       ctx: "Fractions as division",              unit: "Unit 3" },
    { kind: "tools",  title: "Lesson 23 deck",           ctx: "Fractions as division",              unit: "Unit 3" },
  ];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, fontSize: 12 }}>
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
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "#64748B" }}>62 total · 10 shown</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {RESOURCES.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", borderRadius: 7,
            background: i % 2 === 0 ? "#FAFBFD" : "transparent",
          }}>
            <span style={{ color: "#94A3B8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg></span>
            <span style={{ flex: 1, fontSize: 13, color: "#0B181E", fontWeight: 500 }}>{r.title}</span>
            <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>{r.unit}</span>
            <span style={{ fontSize: 12, color: "#64748B" }}>{r.ctx}</span>
          </div>
        ))}
      </div>
    </>
  );
};

// ───────────────────────────────────────────────────────────────────
// 2 · List views — Weekly, Daily, Subject (highlight palette)
// ───────────────────────────────────────────────────────────────────
//
// Row anatomy:
//   • Subject monogram tile (uses M523_SUBJ for colors)
//   • Time / week-day chip
//   • Title + 1-line preview
//   • CCSS chip · resource count
//   • Modified rows: 4px dashed left edge in subject deep
//
const ListRow = ({ lesson, time, weekday, dense }) => {
  const subj = window.M523_SUBJ[lesson.subject];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 8,
      background: "#fff",
      border: `1px solid ${subj.tile}`,
      backgroundImage: lesson.modified
        ? `linear-gradient(to bottom, ${subj.deep} 0, ${subj.deep} 4px, transparent 4px, transparent 8px), linear-gradient(#fff, #fff)`
        : `linear-gradient(${subj.tile} 0, ${subj.tile} 100%), linear-gradient(#fff, #fff)`,
      backgroundRepeat: "repeat-y, no-repeat",
      backgroundSize: "3px 8px, auto",
      backgroundPosition: "left top, 3px top",
      position: "relative", overflow: "hidden",
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 7,
        background: subj.tile, color: subj.deep,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700,
        flex: "0 0 auto",
      }}>{subj.short}</span>
      <div style={{ width: 64, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: subj.deep, letterSpacing: 0.4 }}>{subj.label}</span>
        <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{time || weekday || ""}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0B181E", lineHeight: 1.3, letterSpacing: -0.1, textWrap: "pretty" }}>{lesson.title}</span>
          {lesson.modified && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8.5, fontWeight: 700, color: "#fff", background: "#0F172A", padding: "1px 7px", borderRadius: 4, letterSpacing: 0.5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "#10B981" }} /> MODIFIED
            </span>
          )}
          {lesson.carryOver && <span style={{ fontSize: 9, color: "#9A3412", fontWeight: 600 }}>carry-over ⚠</span>}
          {lesson.core && <span style={{ fontSize: 9, fontWeight: 700, color: "#7A4F08", background: "#FDE68A", padding: "1px 6px", borderRadius: 4 }}>CORE ↑</span>}
        </div>
        {!dense && lesson.preview && (
          <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, lineHeight: 1.45, textWrap: "pretty",
            display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{lesson.preview}</div>
        )}
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: "#475569", background: "#F1F5F9", padding: "1px 7px", borderRadius: 4 }}>CCSS·{lesson.standards}</span>
      {lesson.resources > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#475569", fontWeight: 500, width: 32, justifyContent: "flex-end" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3"/></svg>
          {lesson.resources}
        </span>
      )}
      <span style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid #CBD5E1", flex: "0 0 auto" }} />
    </div>
  );
};

// Flat week data — reuse the shape from the original mock but flatten
// to per-day groupings for the list view.
const M523V2_FLAT_WEEK = (() => {
  const all = [];
  const W = window.M523_WEEK || {};
  ["math","reading","writing","grammar","spelling","ufli","explorers","sel"].forEach(sid => {
    const days = W[sid] || [];
    days.forEach((l, day) => {
      if (l && l.title) all.push({ ...l, subject: sid, day });
    });
  });
  return all;
})();

const ABWeeklyList = () => {
  // Group by day; M523_DAYS is window-scoped from artboards-mock523.jsx
  const days = window.M523_DAYS || [
    { id: 0, full: "Sunday" }, { id: 1, full: "Monday" }, { id: 2, full: "Tuesday" }, { id: 3, full: "Wednesday" }, { id: 4, full: "Thursday" },
  ];
  // Build week from same data the weekly card uses
  const W = window.M523_WEEK || {};
  const grouped = days.map(d => ({
    day: d, items: [],
  }));
  ["math","reading","writing","grammar","spelling","ufli","explorers","sel"].forEach(sid => {
    const subjDays = W[sid] || [];
    subjDays.forEach((l, di) => {
      if (l && l.title) grouped[di].items.push({ ...l, subject: sid });
    });
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
      <window.TopBar523 active="weekly" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <window.LeftRail523 active="weekly" />
        <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 28px", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>WEEKLY PLAN · LIST VIEW</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Week 12</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#3B82F6", padding: "2px 9px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>This Week</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: "#64748B" }}>Same data as the grid view, listed by day.</span>
          </div>
          {grouped.map(g => (
            <div key={g.day.id} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>{g.day.full}</span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{g.items.length} {g.items.length === 1 ? "lesson" : "lessons"}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((l, i) => <ListRow key={i} lesson={l} time={l.time} />)}
              </div>
            </div>
          ))}
        </div>
        <window.RightDock523 contextLabel="Week 12" contextCount={34} />
      </div>
    </div>
  );
};

const ABDailyList = () => {
  const W = window.M523_WEEK || {};
  const items = [];
  ["math","reading","writing","grammar","spelling","ufli","explorers","sel"].forEach(sid => {
    const subjDays = W[sid] || [];
    const l = subjDays[0];
    if (l && l.title) items.push({ ...l, subject: sid });
  });
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
      <window.TopBar523 active="daily" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <window.LeftRail523 active="daily" />
        <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 28px", background: "#fff" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>DAILY PLAN · LIST VIEW</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Sunday · Jan 18</div>
              <span style={{ fontSize: 11.5, color: "#64748B" }}>{items.length} lessons planned · 0 done</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((l, i) => <ListRow key={i} lesson={l} time={l.time} />)}
          </div>
        </div>
        <window.RightDock523 contextLabel="Sunday" contextCount={12} />
      </div>
    </div>
  );
};

const ABSubjectList = () => {
  // Map the Subject page's lesson list to ListRow shape.
  const SOURCE = [
    { title: "Equivalent fractions — area models",        week: "W11", day: "Mon", standards: 1, resources: 1, preview: "Area-model intro to equivalence. Anchor with paper-folding before symbolic work." },
    { title: "Equivalent fractions warm-up",              week: "W12", day: "Sun", standards: 2, resources: 7, preview: "Number-talk routine: pairs find three equivalent fractions for 3/4." },
    { title: "Fractions as division — bake sale problem", week: "W12", day: "Mon", standards: 1, resources: 3, modified: true, preview: "Anchor problem: 5 cookies shared by 4 friends. Bar models → long division." },
    { title: "Math centers (last 20 min)",                week: "W12", day: "Mon", standards: 3, resources: 2, preview: "Three rotations — fact fluency, fraction tiles, word problems." },
    { title: "Multiplying a fraction by a whole number",  week: "W12", day: "Tue", standards: 1, resources: 2, preview: "Concrete-pictorial-abstract sequence. Tiles → area models → algorithm." },
    { title: "Mid-unit check — fractions",                week: "W12", day: "Wed", standards: 2, resources: 1, core: true, preview: "20-minute independent check; equivalence, division, multiplication." },
    { title: "Re-engagement: error analysis",             week: "W12", day: "Thu", standards: 1, resources: 1, preview: "Three flawed student solutions. Identify the misconception, then write a rule." },
    { title: "Adding fractions with unlike denominators", week: "W13", day: "Mon", standards: 1, resources: 1, preview: "Common-denominator strategy through area models. Anchor-chart day." },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#FAF5F7" }}>
      <window.TopBar523 active="subject" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <window.LeftRail523 active="subject" />
        <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 28px", background: "#fff" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>MATH · LIST VIEW</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Unit 3 · Fractions on a Number Line</div>
              <span style={{ fontSize: 11.5, color: "#64748B" }}>8 lessons · 2/8 done</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SOURCE.map((l, i) => <ListRow key={i} lesson={{ ...l, subject: "math" }} weekday={`${l.week} · ${l.day}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  ABSubjectV2, ABWeeklyList, ABDailyList, ABSubjectList,
});
