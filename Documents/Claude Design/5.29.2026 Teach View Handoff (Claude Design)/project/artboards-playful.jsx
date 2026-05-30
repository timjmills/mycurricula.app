// artboards-playful.jsx — Toddle-style aesthetic across every surface.
//
// What changed from Vivid:
//   • Pastel "playmat" wrap around every surface — like Toddle's
//     feature cards. Soft mint / lemon / peach / lavender / blush.
//   • Inner content lifts off the mat as a WHITE card with big radius
//     (20-28px) and gentle shadow.
//   • Subjects get friendly rounded-square icon tiles (44px, 12px
//     radius) with a pastel fill + bold deep-colour glyph.
//   • Friendlier typography — heavier headline weight, slightly more
//     generous line-height, less letter-spacing micro-management.
//   • Big rounded buttons (pill or 12px-radius), generous touch
//     targets (28px checkboxes, 44px+ tap zones).
//   • No spreadsheet-feel. Everything reads like a kids' notebook /
//     family planner. Soft shadows replace borders where possible.
//
// Maps to the same Curriculum Planner functionality — this is a skin,
// not a re-spec. Drop into the "Playful" tab to compare against Quiet
// and Vivid on the exact same data.

// ───────────────────────────────────────────────────────────────────
// 1 · Toddle palette
// ───────────────────────────────────────────────────────────────────
const PL = {
  mint:     { tile: "#A8E6E0", bg: "#DCF4F1", deep: "#0F766E" },
  green:    { tile: "#C4ECC1", bg: "#E4F5E1", deep: "#166534" },
  lavender: { tile: "#D9CCFB", bg: "#EBE3FB", deep: "#5B21B6" },
  peach:    { tile: "#FBD0B6", bg: "#FCE5D5", deep: "#9A3412" },
  blush:    { tile: "#F9C4DA", bg: "#FCDFEB", deep: "#9D174D" },
  coral:    { tile: "#FAC0AD", bg: "#FCDFD2", deep: "#9A3412" },
  lemon:    { tile: "#FBE38A", bg: "#FEF3C8", deep: "#854D0E" },
  sky:      { tile: "#B6D9FB", bg: "#DAECFE", deep: "#1E40AF" },
  rose:     { tile: "#FBC4C4", bg: "#FCDDDD", deep: "#9F1239" },
};

// Subject → pastel mapping (same eight subjects as Quiet/Vivid).
// Glyphs are short letter pairs — no illustrative emoji or mascots,
// just clean two-letter abbreviations on a pastel tile.
const PL_SUBJ = {
  math:      { ...PL.mint,     glyph: "Ma",   name: "Math" },
  reading:   { ...PL.green,    glyph: "Re",   name: "Reading" },
  writing:   { ...PL.lavender, glyph: "Wr",   name: "Writing" },
  grammar:   { ...PL.peach,    glyph: "Gr",   name: "Grammar" },
  spelling:  { ...PL.blush,    glyph: "Sp",   name: "Spelling" },
  ufli:      { ...PL.coral,    glyph: "Uf",   name: "UFLI" },
  explorers: { ...PL.lemon,    glyph: "Ex",   name: "Explorers" },
  sel:       { ...PL.sky,      glyph: "Se",   name: "SEL" },
};

// ───────────────────────────────────────────────────────────────────
// 2 · Primitives
// ───────────────────────────────────────────────────────────────────

// The defining Toddle move: a tinted playmat with a white card inside.
// Use `tone` for the mat colour; `nested` to render the white inner
// frame; `noFrame` for when the wrap itself IS the surface (e.g. a
// dashboard where multiple white cards sit on the mat).
const PlaymatWrap = ({ tone = PL.mint.bg, children, padding = 22, noFrame, framePadding = 0 }) => (
  <div style={{
    width: "100%", height: "100%", padding, boxSizing: "border-box",
    background: tone, display: "flex", overflow: "auto",
  }}>
    {noFrame ? children : (
      <div style={{
        background: "#fff", borderRadius: 22, flex: 1,
        boxShadow: "0 12px 28px rgba(11, 24, 30, .06), 0 2px 6px rgba(11, 24, 30, .04)",
        padding: framePadding, overflow: "hidden", minHeight: 0,
        display: "flex", flexDirection: "column",
      }}>{children}</div>
    )}
  </div>
);

// Friendly subject tile — the icon you see top-left on a Toddle feature
// card. 44px default, scales for hero use. The glyph is the subject's
// two-letter abbreviation; sizing is bumped to read as a friendly
// monogram, not a label.
const SubjectTile = ({ subject, size = 44, radius = 12, glyphSize, deepBorder }) => {
  const s = PL_SUBJ[subject];
  const gs = glyphSize || Math.round(size * 0.38);
  return (
    <span style={{
      width: size, height: size, borderRadius: radius,
      background: s.tile, color: s.deep,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: gs, fontWeight: 700, lineHeight: 1, flex: "0 0 auto",
      boxShadow: deepBorder ? `inset 0 0 0 2px ${s.deep}26` : "0 1px 0 rgba(255,255,255,.7) inset",
      letterSpacing: -0.4, fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
    }}>{s.glyph}</span>
  );
};

// Big friendly checkbox. 28px target by default — meets iPad touch
// guidance. White with subject-deep border at rest, fills with the
// subject's deep colour when done.
const PlayfulCheck = ({ status, subject = "math", size = 28, onCycle }) => {
  const s = PL_SUBJ[subject];
  const done = status === "done";
  const partial = status === "partial";
  return (
    <button onClick={(e) => { e.stopPropagation(); onCycle && onCycle(); }}
      aria-label={done ? "Done" : "Not done"}
      style={{
        width: size, height: size, borderRadius: size * 0.32,
        background: done ? s.deep : (partial ? `linear-gradient(135deg, ${s.deep} 50%, #fff 50%)` : "#fff"),
        border: `2px solid ${done || partial ? s.deep : s.tile}`,
        padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        flex: "0 0 auto", cursor: "pointer", transition: "background .15s, border-color .15s, transform .08s",
      }}>
      {(done || partial) && (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>
      )}
    </button>
  );
};

// Status pill — plain-English label in a soft tone.
const PlayfulStatusPill = ({ status, subject }) => {
  const s = PL_SUBJ[subject || "math"];
  const map = {
    done:     { lbl: "Done",     bg: "#DCF4E2", fg: "#166534" },
    not_done: { lbl: "To do",    bg: "#F2F4F8", fg: "#475569" },
    partial:  { lbl: "Started",  bg: "#FEF3C8", fg: "#854D0E" },
    skipped:  { lbl: "Skipped",  bg: "#F2F4F8", fg: "#94a3b8" },
    carried:  { lbl: "Moved",    bg: "#FCDFD2", fg: "#9A3412" },
  };
  const m = map[status] || map.not_done;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
      background: m.bg, color: m.fg, lineHeight: 1.4,
    }}>{m.lbl}</span>
  );
};

// Soft pill button — for actions on cards
const PlayfulPill = ({ children, kind = "ghost", size = "md", icon, onClick }) => {
  const styles = {
    primary: { bg: "#1A1F2C", fg: "#fff", border: "#1A1F2C" },
    accent:  { bg: PL.mint.deep, fg: "#fff", border: PL.mint.deep },
    ghost:   { bg: "#fff", fg: "#1A1F2C", border: "#E2E8F0" },
    soft:    { bg: "#F2F4F8", fg: "#475569", border: "transparent" },
  }[kind];
  const sz = size === "lg" ? { p: "10px 18px", fs: 13.5 } : { p: "7px 14px", fs: 12.5 };
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: sz.p, borderRadius: 999,
      background: styles.bg, color: styles.fg,
      border: `1px solid ${styles.border}`,
      fontSize: sz.fs, fontWeight: 600, lineHeight: 1.3,
      cursor: "pointer",
    }}>
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
    </button>
  );
};

// The lesson card itself, Toddle-styled. White card on whichever mat
// it sits on. Subject icon tile + title + meta + check.
const PlayfulLessonCard = ({ lesson, onClick, dense, selected, narrow }) => {
  const subj = PL_SUBJ[lesson.subject];
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [status, setStatus] = React.useState(lesson.status);
  const [hovered, setHovered] = React.useState(false);
  const done = status === "done";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        border: selected ? `2px solid ${subj.deep}` : `1px solid #ECEFF4`,
        borderRadius: 16, padding: dense ? 12 : 16,
        boxShadow: hovered ? "0 6px 18px rgba(11, 24, 30, .08)" : "0 1px 2px rgba(11, 24, 30, .04)",
        transition: "box-shadow .15s, border-color .15s, transform .08s",
        cursor: onClick ? "pointer" : "default",
        display: "flex", gap: dense ? 10 : 14, alignItems: "flex-start",
      }}>
      <SubjectTile subject={lesson.subject} size={dense ? 38 : 44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: subj.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
          {lesson.modified && (
            <span style={{ fontSize: 10, fontWeight: 700, color: PL.lavender.deep, background: PL.lavender.bg, padding: "1px 8px", borderRadius: 999, letterSpacing: 0.3 }}>My version</span>
          )}
          {lesson.moved && (
            <span style={{ fontSize: 10, fontWeight: 700, color: PL.peach.deep, background: PL.peach.bg, padding: "1px 8px", borderRadius: 999, letterSpacing: 0.3 }}>Moved</span>
          )}
        </div>
        <div style={{
          fontSize: dense ? 14 : 15.5, fontWeight: 600, color: "#1A1F2C", marginTop: 2,
          lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1,
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: "#94a3b8",
        }}>{lesson.title}</div>
        {!narrow && !dense && lesson.preview && (
          <div style={{
            fontSize: 12.5, color: "#64748B", marginTop: 6, lineHeight: 1.5, textWrap: "pretty",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{lesson.preview}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: dense ? 7 : 10, flexWrap: "wrap" }}>
          <PlayfulStatusPill status={status} subject={lesson.subject} />
          {lesson.resources.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#64748B", fontWeight: 500 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
              {lesson.resources.length}
            </span>
          )}
          {lesson.standards.length > 0 && (
            <span className="cp-mono" style={{ fontSize: 10.5, fontWeight: 600, color: "#475569", background: "#F2F4F8", padding: "2px 7px", borderRadius: 6 }}>{lesson.standards.length} standard{lesson.standards.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
      <PlayfulCheck status={status} subject={lesson.subject} size={dense ? 24 : 28} onCycle={() => setStatus(done ? "not_done" : "done")} />
    </div>
  );
};

// Page-hero header — used at the top of a surface where appropriate.
// Big subject tile + bold dark title + soft subtitle. Toddle marketing-
// page feel.
const PlayfulHero = ({ icon, title, subtitle, tone, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "24px 28px 22px" }}>
    {icon}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0B181E", letterSpacing: -0.5, lineHeight: 1.1 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 14, color: "#64748B", marginTop: 5, lineHeight: 1.5, textWrap: "pretty" }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

// Day strip — used in Weekly + Today. Big, friendly, washi-tape feel.
const PlayfulDayStrip = ({ label, count, today, tone }) => (
  <div style={{
    background: today ? tone : "#fff",
    border: `2px solid ${today ? tone : "#ECEFF4"}`,
    borderRadius: 12, padding: "8px 14px",
    display: "flex", alignItems: "center", gap: 10,
  }}>
    <span style={{ fontSize: 13, fontWeight: 700, color: today ? "#0B181E" : "#475569", letterSpacing: -0.1 }}>{label}</span>
    {today && <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#0B181E", color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>Today</span>}
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "#94A3B8" }}>{count} {count === 1 ? "lesson" : "lessons"}</span>
  </div>
);

// ───────────────────────────────────────────────────────────────────
// 3 · Helpers for grouping
// ───────────────────────────────────────────────────────────────────
const PL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const PL_TODAY = 1;
const plLessonsByDay = () => {
  const out = PL_DAYS.map(() => []);
  LESSONS.forEach(l => { if (l.day != null) out[l.day].push(l); });
  return out;
};
const plLessonsBySubjectDay = () => {
  const out = {};
  SUBJECTS.forEach(s => { out[s.id] = PL_DAYS.map(() => []); });
  LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l); });
  return out;
};

// ───────────────────────────────────────────────────────────────────
// 4 · P0 — Atomic lesson card
// ───────────────────────────────────────────────────────────────────
const ABPlayfulLessonCard = () => {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");
  const ufli = LESSONS.find(l => l.id === "uf-12-2");
  const e = LESSONS.find(l => l.id === "e-12-1");
  const g = LESSONS.find(l => l.id === "g-12-1");

  return (
    <PlaymatWrap tone={PL.mint.bg}>
      <div style={{ padding: "26px 28px 28px", overflow: "auto" }}>
        <PlayfulHero
          icon={<SubjectTile subject="math" size={64} radius={18} glyphSize={32} />}
          title="Lesson card"
          subtitle="The atomic piece every other surface is built from. White card on a coloured mat, with the subject as a friendly icon tile."
        />

        <div style={{ padding: "0 28px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Section kicker="Across all eight subjects" hint="Each subject has its own pastel + icon. Math = mint, Reading = leaf, Writing = lavender, Grammar = peach, Spelling = blush, UFLI = coral, Explorers = lemon, SEL = sky.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PlayfulLessonCard lesson={m} />
              <PlayfulLessonCard lesson={r} />
              <PlayfulLessonCard lesson={w} />
              <PlayfulLessonCard lesson={ufli} />
              <PlayfulLessonCard lesson={e} />
              <PlayfulLessonCard lesson={g} />
            </div>
          </Section>

          <Section kicker="Personalized states" hint="Same data, friendlier labels. ‘My version’ replaces the Advanced dashed stripe; ‘Moved’ replaces the ↔/⤴ arrow.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PlayfulLessonCard lesson={{ ...m, modified: true }} />
              <PlayfulLessonCard lesson={{ ...r, moved: "same-week" }} />
              <PlayfulLessonCard lesson={{ ...w, modified: true, moved: "across-weeks" }} />
              <PlayfulLessonCard lesson={{ ...ufli, status: "done" }} />
            </div>
          </Section>

          <Section kicker="States" hint="Selected · hover · done · carried.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PlayfulLessonCard lesson={m} selected />
              <PlayfulLessonCard lesson={{ ...w, status: "carried" }} />
            </div>
          </Section>
        </div>
      </div>
    </PlaymatWrap>
  );
};

const Section = ({ kicker, hint, children }) => (
  <div>
    <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>
    {hint && <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.5, marginBottom: 10, textWrap: "pretty" }}>{hint}</div>}
    {children}
  </div>
);

// ───────────────────────────────────────────────────────────────────
// 5 · P1 — Weekly grid
// ───────────────────────────────────────────────────────────────────
const ABPlayfulWeekly = () => {
  const bySD = React.useMemo(plLessonsBySubjectDay, []);
  return (
    <PlaymatWrap tone={PL.lemon.bg}>
      <PlayfulHero
        icon={<SubjectTile subject="explorers" size={56} radius={16} glyphSize={26} />}
        title="This week"
        subtitle="Week of January 12 to 16 · drag any card to move it, drop two in one day to stack"
        right={<PlayfulPill kind="primary" size="lg">+ Add a lesson</PlayfulPill>}
      />

      <div style={{ padding: "4px 22px 22px", overflow: "auto" }}>
        {/* Day headers as washi-tape strips */}
        <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${PL_DAYS.length}, 1fr)`, gap: 10, marginBottom: 10 }}>
          <div />
          {PL_DAYS.map((d, i) => (
            <PlayfulDayStrip key={d} label={d} count={Object.values(bySD).reduce((acc, byD) => acc + byD[i].length, 0)} today={i === PL_TODAY} tone={PL.mint.tile} />
          ))}
        </div>

        {/* Subject rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SUBJECTS.map(s => {
            const sp = PL_SUBJ[s.id];
            return (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: `140px repeat(${PL_DAYS.length}, 1fr)`, gap: 10,
                background: sp.bg, borderRadius: 16, padding: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 }}>
                  <SubjectTile subject={s.id} size={40} radius={10} glyphSize={18} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: sp.deep, letterSpacing: -0.1 }}>{s.name}</span>
                </div>
                {PL_DAYS.map((_, d) => {
                  const items = bySD[s.id][d];
                  if (!items || items.length === 0) {
                    return (
                      <button key={d} style={{
                        background: "#fff", border: `1.5px dashed ${sp.tile}`, borderRadius: 12,
                        color: sp.deep, fontSize: 12.5, fontWeight: 600,
                        opacity: 0.7, minHeight: 80, padding: 8, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      }}>
                        <span style={{ width: 28, height: 28, borderRadius: 999, background: sp.tile, color: sp.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>+</span>
                        <span style={{ opacity: 0.65 }}>Add</span>
                      </button>
                    );
                  }
                  return (
                    <div key={d} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.map(l => <PlayfulLessonCard key={l.id} lesson={l} dense narrow />)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 6 · P2 — Daily two-pane
// ───────────────────────────────────────────────────────────────────
const ABPlayfulDaily = () => {
  const byDay = React.useMemo(plLessonsByDay, []);
  const todays = byDay[PL_TODAY];
  const [sel, setSel] = React.useState("m-12-1");
  const lesson = todays.find(l => l.id === sel) || todays[0];
  const subj = PL_SUBJ[lesson.subject];
  const subjMeta = SUBJECT_BY_ID[lesson.subject];

  return (
    <PlaymatWrap tone={PL.sky.bg} padding={20}>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: day list */}
        <div style={{
          width: 340, padding: "18px 16px 18px 18px",
          background: "#FAFBFD", borderRight: "1px solid #ECEFF4",
          overflow: "auto",
        }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Monday</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>January 13</div>
          <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{todays.length} lessons · 1 in progress</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {todays.map(l => {
              const sj = PL_SUBJ[l.subject];
              const meta = SUBJECT_BY_ID[l.subject];
              const active = l.id === lesson.id;
              const done = l.status === "done";
              return (
                <div key={l.id} onClick={() => setSel(l.id)}
                  role="button" tabIndex={0}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: 10, borderRadius: 14,
                    background: active ? sj.bg : "#fff",
                    border: active ? `2px solid ${sj.deep}` : "1px solid #ECEFF4",
                    cursor: "pointer", boxShadow: active ? "0 4px 14px rgba(11,24,30,.08)" : "none",
                    transition: "box-shadow .12s, border-color .12s",
                  }}>
                  <SubjectTile subject={l.subject} size={38} radius={10} glyphSize={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: sj.deep, textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.name}</div>
                    <div style={{
                      fontSize: 13.5, fontWeight: 600, color: "#0B181E", marginTop: 1,
                      lineHeight: 1.3, textWrap: "pretty", textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
                    }}>{l.title}</div>
                  </div>
                  <PlayfulCheck status={l.status} subject={l.subject} size={22} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: lesson detail */}
        <div style={{ flex: 1, overflow: "auto", background: "#fff" }}>
          <div style={{ background: subj.bg, padding: "26px 30px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <SubjectTile subject={lesson.subject} size={56} radius={16} glyphSize={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: subj.deep, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name} · Unit 3</div>
                <h1 style={{ margin: "5px 0 0", fontSize: 24, fontWeight: 700, color: "#0B181E", letterSpacing: -0.5, textWrap: "pretty", lineHeight: 1.2 }}>{lesson.title}</h1>
              </div>
              <PlayfulStatusPill status={lesson.status} subject={lesson.subject} />
            </div>
            {lesson.objective && (
              <div style={{
                background: "#fff", marginTop: 16, padding: "12px 14px",
                borderRadius: 12, fontSize: 13, color: subj.deep, lineHeight: 1.5,
                display: "flex", gap: 8, alignItems: "flex-start", textWrap: "pretty",
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#fff", background: subj.deep, padding: "2px 7px", borderRadius: 6, marginTop: 1, flex: "0 0 auto" }}>I can</span>
                <span style={{ fontStyle: "italic", color: "#0B181E" }}>{lesson.objective.replace(/^I can\s+/i, "")}</span>
              </div>
            )}
          </div>

          <div style={{ padding: "20px 30px 28px" }}>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>What to do</div>
            <div style={{ fontSize: 14, color: "#334155", marginTop: 8, lineHeight: 1.65, textWrap: "pretty" }}>{lesson.directions}</div>

            {lesson.resources.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22 }}>Resources</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  {lesson.resources.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 11,
                      padding: "10px 12px", background: "#FAFBFD",
                      border: "1px solid #ECEFF4", borderRadius: 12,
                    }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: subj.bg, color: subj.deep, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <CPIcon name={CP_RES_ICON[r.type] || "link"} size={16} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B181E" }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{r.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}>
              <PlayfulPill kind="primary" size="lg">✓ Mark as done</PlayfulPill>
              <PlayfulPill size="lg">More options</PlayfulPill>
            </div>

            {lesson.standards.length > 0 && (
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #ECEFF4" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Standards</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {lesson.standards.map(c => (
                    <span key={c} className="cp-mono" style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 8, background: subj.bg, color: subj.deep }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 7 · P3 — Schedule
// ───────────────────────────────────────────────────────────────────
const ABPlayfulSchedule = () => {
  const blocks = SCHEDULE;
  const fmt = (t) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1; return `${h12}${m === 0 ? "" : ":" + String(m).padStart(2, "0")} ${ap}`; };
  return (
    <PlaymatWrap tone={PL.peach.bg}>
      <PlayfulHero
        icon={<SubjectTile subject="grammar" size={56} radius={16} glyphSize={22} />}
        title="Today's schedule"
        subtitle="Monday, January 13 · 7 things on your day"
        right={<PlayfulPill kind="primary" size="lg">+ Add block</PlayfulPill>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {blocks.map((b, i) => {
            const subjMeta = b.subject && SUBJECT_BY_ID[b.subject];
            const subj = b.subject && PL_SUBJ[b.subject];
            const lesson = b.lesson && LESSONS.find(l => l.id === b.lesson);
            const isNow = i === 2;
            return (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                <div style={{ width: 96, flex: "0 0 auto", paddingTop: 14, textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>{fmt(b.start)}</div>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>to {fmt(b.end)}</div>
                </div>

                {subj ? (
                  <div style={{
                    flex: 1, background: isNow ? subj.tile : subj.bg,
                    border: isNow ? `2px solid ${subj.deep}` : "1px solid transparent",
                    borderRadius: 18, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 14,
                    boxShadow: isNow ? "0 8px 24px rgba(11,24,30,.10)" : "none",
                  }}>
                    <SubjectTile subject={b.subject} size={48} radius={12} glyphSize={22} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: subj.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
                        {isNow && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: subj.deep, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>▶ Right now</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#0B181E", marginTop: 3, lineHeight: 1.3, textWrap: "pretty" }}>{lesson?.title || "—"}</div>
                    </div>
                    {lesson && <PlayfulCheck status={lesson.status} subject={b.subject} size={26} />}
                  </div>
                ) : (
                  <div style={{
                    flex: 1, background: "#FAFBFD", borderRadius: 18,
                    padding: "14px 18px", display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#475569" }}>{b.label}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 8 · P4 — Subject / Unit
// ───────────────────────────────────────────────────────────────────
const ABPlayfulSubject = () => {
  const subj = PL_SUBJ.math;
  const subjMeta = SUBJECT_BY_ID.math;
  const unit = UNITS.math;
  const lessons = LESSONS.filter(l => l.subject === "math");
  const weeks = [9, 10, 11, 12, 13, 14].map(wk => ({
    wk, label: ["Two weeks ago", "Last week", "Last week", "This week", "Next week", "In two weeks"][wk - 9] || `Week ${wk}`,
    lessons: wk === 12 ? lessons : [
      { id: `m-${wk}-stub`, subject: "math", title: ["Number sense warm-ups", "Equivalent fractions", "Adding fractions", "Mid-unit check", "Multiplying fractions", "Unit review"][wk - 9], status: "not_done", resources: [{type:"slides"}], standards: ["5.NF.A.1"], preview: "Plan for this week — placeholder content for the prototype." },
    ],
  }));
  return (
    <PlaymatWrap tone={subj.bg}>
      <PlayfulHero
        icon={<SubjectTile subject="math" size={72} radius={20} glyphSize={34} />}
        title={subjMeta.name}
        subtitle={`${unit.name.split(" · ")[1]} · weeks 9 to 14`}
        right={<PlayfulPill kind="primary" size="lg">+ Add a lesson</PlayfulPill>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {weeks.map(w => {
            const here = w.wk === 12;
            const doneCount = w.lessons.filter(l => l.status === "done").length;
            return (
              <div key={w.wk} style={{
                background: "#fff", borderRadius: 20,
                border: here ? `2px solid ${subj.deep}` : "1px solid #ECEFF4",
                padding: "16px 18px",
                boxShadow: "0 4px 14px rgba(11,24,30,.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: here ? subj.deep : subj.bg, color: here ? "#fff" : subj.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>{w.wk}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: subj.deep, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Week {w.wk}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0B181E", marginTop: 1, letterSpacing: -0.2 }}>
                      {w.label} {here && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: subj.deep, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>Now</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#64748B" }}>{doneCount} of {w.lessons.length} done</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {w.lessons.map(l => <PlayfulLessonCard key={l.id} lesson={l} dense />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 9 · P5 — Task list
// ───────────────────────────────────────────────────────────────────
const ABPlayfulTasks = () => {
  const byDay = plLessonsByDay();
  return (
    <PlaymatWrap tone={PL.lavender.bg}>
      <PlayfulHero
        icon={<SubjectTile subject="writing" size={56} radius={16} glyphSize={24} />}
        title="Things to do"
        subtitle="Tick lessons off as you teach them. Tap a row to open the lesson."
        right={<PlayfulPill kind="primary" size="lg">+ Quick add</PlayfulPill>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {PL_DAYS.map((d, i) => (
            <div key={d}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  padding: "5px 12px", borderRadius: 999,
                  background: i === PL_TODAY ? "#0B181E" : "#fff",
                  color: i === PL_TODAY ? "#fff" : "#475569",
                  border: i === PL_TODAY ? "1px solid #0B181E" : "1px solid #ECEFF4",
                  fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
                }}>{d}{i === PL_TODAY ? " · Today" : ""}</span>
                <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{byDay[i].length} lessons</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {byDay[i].map(l => <PlayfulTaskRow key={l.id} lesson={l} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PlaymatWrap>
  );
};

const PlayfulTaskRow = ({ lesson }) => {
  const subj = PL_SUBJ[lesson.subject];
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px 10px 12px",
      background: "#fff", borderRadius: 14,
      border: "1px solid #ECEFF4",
    }}>
      <PlayfulCheck status={status} subject={lesson.subject} size={24} onCycle={() => setStatus(done ? "not_done" : "done")} />
      <SubjectTile subject={lesson.subject} size={32} radius={9} glyphSize={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: "#0B181E", lineHeight: 1.3, textWrap: "pretty",
          textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
        }}>{lesson.title}</div>
        <div style={{ fontSize: 11.5, color: subj.deep, marginTop: 2, fontWeight: 600 }}>{subjMeta.name}{lesson.resources.length > 0 && <span style={{ color: "#94A3B8", fontWeight: 500 }}> · {lesson.resources.length} resource{lesson.resources.length === 1 ? "" : "s"}</span>}</div>
      </div>
      {done && <span style={{ fontSize: 11.5, fontWeight: 700, color: PL.green.deep }}>Done</span>}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 10 · P6 — Catch-up
// ───────────────────────────────────────────────────────────────────
const ABPlayfulCatchup = () => {
  const missed = LESSONS.filter(l => l.status === "carried" || l.reasonNotDone || l.id === "w-12-1");
  const padded = [...missed, ...LESSONS.filter(l => l.status === "not_done").slice(0, 5)].slice(0, 6);

  return (
    <PlaymatWrap tone={PL.coral.bg}>
      <PlayfulHero
        icon={<span style={{ width: 64, height: 64, borderRadius: 18, background: PL.coral.tile, color: PL.coral.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700 }}>!</span>}
        title="Let's catch up"
        subtitle={`${padded.length} lessons need a decision — move them, mark them done, or skip for now.`}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {padded.map(l => {
            const subjMeta = SUBJECT_BY_ID[l.subject];
            return (
              <div key={l.id} style={{
                background: "#fff", borderRadius: 18, padding: "16px 18px",
                border: "1px solid #ECEFF4",
                boxShadow: "0 4px 12px rgba(11,24,30,.04)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <SubjectTile subject={l.subject} size={48} radius={14} glyphSize={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: PL_SUBJ[l.subject].deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: PL.coral.deep, background: PL.coral.bg, padding: "2px 9px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>5 days late</span>
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: "#0B181E", marginTop: 3, lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1 }}>{l.title}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <PlayfulPill kind="primary">↻ Move to this week</PlayfulPill>
                  <PlayfulPill>✓ Mark done</PlayfulPill>
                  <PlayfulPill>✎ Add a note</PlayfulPill>
                  <PlayfulPill kind="soft">— Skip for now</PlayfulPill>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 11 · P7 — Today dashboard
// ───────────────────────────────────────────────────────────────────
const ABPlayfulDashboard = () => {
  const byDay = plLessonsByDay();
  const todays = byDay[PL_TODAY];

  return (
    <PlaymatWrap tone={PL.green.bg} padding={22} noFrame>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Hero */}
        <div style={{ background: "#fff", borderRadius: 22, padding: "22px 24px", boxShadow: "0 4px 18px rgba(11,24,30,.05)" }}>
          <PlayfulHero
            icon={<span style={{ width: 64, height: 64, borderRadius: 18, background: PL.green.tile, color: PL.green.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Hi</span>}
            title="Good morning, Lena"
            subtitle="Today is Monday, January 13 · you have 6 lessons planned"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>
          {/* Today's lessons */}
          <div style={{ background: "#fff", borderRadius: 22, padding: "18px 20px", overflow: "auto", boxShadow: "0 4px 18px rgba(11,24,30,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>Today's lessons</span>
              <div style={{ flex: 1 }} />
              <PlayfulPill size="md">See all</PlayfulPill>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todays.slice(0, 4).map(l => <PlayfulLessonCard key={l.id} lesson={l} dense narrow />)}
            </div>
          </div>

          {/* Stats — pastel sticky-note feel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { id: "math",      lbl: "Done today",                val: "1 of 6", glyph: "✓" },
              { id: "ufli",      lbl: "Carry-overs from last week", val: "3",      caption: "Tap to catch up →", glyph: "!" },
              { id: "writing",   lbl: "Pinned resources",           val: "8",      glyph: "¶" },
              { id: "explorers", lbl: "Open comments",              val: "5",      glyph: "“\u201d".slice(0, 1) },
            ].map((s, i) => (
              <div key={i} style={{
                background: PL_SUBJ[s.id].tile, borderRadius: 18,
                padding: "16px 18px", boxShadow: "0 4px 14px rgba(11,24,30,.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, background: "#fff", color: PL_SUBJ[s.id].deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{s.glyph}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: PL_SUBJ[s.id].deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#0B181E", marginTop: 2, letterSpacing: -0.4, lineHeight: 1.1 }}>{s.val}</div>
                  </div>
                </div>
                {s.caption && <div style={{ fontSize: 12, color: PL_SUBJ[s.id].deep, marginTop: 8, fontWeight: 600 }}>{s.caption}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 12 · P8 — Core / Personalized
// ───────────────────────────────────────────────────────────────────
const ABPlayfulCore = () => {
  const [mode, setMode] = React.useState("personal");
  const tone = mode === "core" ? PL.rose.bg : PL.mint.bg;
  return (
    <PlaymatWrap tone={tone}>
      <PlayfulHero
        icon={<span style={{ width: 64, height: 64, borderRadius: 18, background: mode === "core" ? PL.rose.tile : PL.mint.tile, color: mode === "core" ? PL.rose.deep : PL.mint.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700 }}>{mode === "core" ? "!" : "✓"}</span>}
        title="Where you're working"
        subtitle="Pick which version of the lesson plan your edits will change."
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <ModeCardP active={mode === "personal"} onClick={() => setMode("personal")} subject="math" kicker="Just for me" title="My version" desc="Edits stay in your own planner. Teammates still see the team's plan." />
            <ModeCardP active={mode === "core"} onClick={() => setMode("core")} subject="spelling" kicker="For the team" title="Core curriculum" desc="Edits go to every Grade 5 teacher. Use when the plan has actually shifted." />
          </div>

          <div style={{
            marginTop: 18, padding: "16px 18px",
            background: mode === "core" ? PL.rose.bg : PL.green.bg,
            border: `2px solid ${mode === "core" ? PL.rose.deep : PL.green.deep}`,
            borderRadius: 16,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span style={{ width: 32, height: 32, borderRadius: 999, background: mode === "core" ? PL.rose.deep : PL.green.deep, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flex: "0 0 auto" }}>{mode === "core" ? "!" : "✓"}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: mode === "core" ? PL.rose.deep : PL.green.deep, letterSpacing: -0.2 }}>
                {mode === "core" ? "You're editing the team plan" : "You're editing your own copy"}
              </div>
              <div style={{ fontSize: 13, color: "#334155", marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>
                {mode === "core"
                  ? "Anything you change here will show up for every teacher. The team gets a notification when you save."
                  : "Edit freely. Your teammates won't see your changes. Switch to Core curriculum if you want to share what you've changed."}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, padding: 16, background: "#FAFBFD", border: "1px solid #ECEFF4", borderRadius: 16 }}>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Preview</div>
            <PlayfulLessonCard lesson={mode === "personal" ? { ...LESSONS.find(l => l.id === "m-12-1"), modified: true } : LESSONS.find(l => l.id === "m-12-1")} />
          </div>
        </div>
      </div>
    </PlaymatWrap>
  );
};

const ModeCardP = ({ active, onClick, subject, kicker, title, desc }) => {
  const sp = PL_SUBJ[subject];
  return (
    <button onClick={onClick} role="radio" aria-checked={active} style={{
      textAlign: "left", padding: "18px 20px", borderRadius: 18,
      background: active ? "#fff" : "#FAFBFD",
      border: active ? `2px solid ${sp.deep}` : "1.5px solid #ECEFF4",
      cursor: "pointer", boxShadow: active ? `0 8px 20px rgba(11,24,30,.08)` : "none",
      display: "flex", flexDirection: "column", gap: 8, position: "relative",
    }}>
      <SubjectTile subject={subject} size={44} radius={12} glyphSize={20} />
      <div style={{ fontSize: 10.5, color: sp.deep, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 }}>{kicker}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.5, textWrap: "pretty" }}>{desc}</div>
      <span style={{
        position: "absolute", top: 16, right: 16,
        width: 22, height: 22, borderRadius: 999,
        background: active ? sp.deep : "#fff",
        border: `2px solid ${active ? sp.deep : "#CBD5E1"}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{active && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#fff" }} />}</span>
    </button>
  );
};

// ───────────────────────────────────────────────────────────────────
// 13 · P9 — Standards drill
// ───────────────────────────────────────────────────────────────────
const ABPlayfulStandards = () => {
  const code = "5.NF.B.3";
  const desc = STANDARDS[code];
  const matching = LESSONS.filter(l => l.standards.includes(code));
  return (
    <PlaymatWrap tone={PL.mint.bg}>
      <div style={{ padding: "26px 28px 0" }}>
        <PlayfulPill kind="ghost" size="md">← Back</PlayfulPill>
      </div>
      <PlayfulHero
        icon={<span style={{ width: 64, height: 64, borderRadius: 18, background: PL.mint.tile, color: PL.mint.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700 }}>CCSS</span>}
        title={code}
        subtitle={desc}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 12.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            {matching.length} lesson{matching.length === 1 ? "" : "s"} cover this
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matching.map(l => <PlayfulLessonCard key={l.id} lesson={l} />)}
          </div>
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 14 · P10 — To-do panel
// ───────────────────────────────────────────────────────────────────
const ABPlayfulTodo = () => {
  const todos = window.TODOS || [];
  // Map tag IDs to friendly pastels
  const tagPastel = { prep: PL.lemon, copies: PL.peach, parents: PL.blush, supplies: PL.green, team: PL.lavender };

  return (
    <PlaymatWrap tone={PL.blush.bg}>
      <PlayfulHero
        icon={<span style={{ width: 56, height: 56, borderRadius: 16, background: PL.blush.tile, color: PL.blush.deep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>✓</span>}
        title="To-do list"
        subtitle="Six open · two due today"
        right={<PlayfulPill kind="primary" size="lg">+ Quick add</PlayfulPill>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 30px 26px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {todos.slice(0, 8).map(t => {
            const tagId = (t.tags || [])[0];
            const tone = tagPastel[tagId] || PL.mint;
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "#fff", borderRadius: 16, padding: "12px 14px",
                border: "1px solid #ECEFF4", boxShadow: "0 1px 2px rgba(11,24,30,.04)",
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: t.done ? tone.deep : "#fff",
                  border: `2px solid ${tone.deep}`, flex: "0 0 auto",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>{t.done && <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0B181E", lineHeight: 1.3, textWrap: "pretty", textDecoration: t.done ? "line-through" : "none", textDecorationColor: "#94A3B8" }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {(t.tags || []).map(tg => {
                      const p = tagPastel[tg] || PL.mint;
                      return <span key={tg} style={{ padding: "2px 9px", fontSize: 10.5, fontWeight: 600, borderRadius: 999, background: p.bg, color: p.deep }}>{tg}</span>;
                    })}
                  </div>
                </div>
                {t.due && <span style={{ fontSize: 11.5, color: tone.deep, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: tone.bg }}>{t.due}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </PlaymatWrap>
  );
};

// ───────────────────────────────────────────────────────────────────
// 15 · Exports
// ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  PL, PL_SUBJ, PlaymatWrap, SubjectTile, PlayfulCheck, PlayfulStatusPill,
  PlayfulPill, PlayfulLessonCard, PlayfulHero, PlayfulDayStrip, PlayfulTaskRow,
  ABPlayfulLessonCard, ABPlayfulWeekly, ABPlayfulDaily, ABPlayfulSchedule,
  ABPlayfulSubject, ABPlayfulTasks, ABPlayfulCatchup, ABPlayfulDashboard,
  ABPlayfulCore, ABPlayfulStandards, ABPlayfulTodo,
});
