// artboards-middle.jsx — Two middle-ground designs between the existing
// themes. The user found Playful too low-contrast; this file shows what
// each existing theme looks like when you push it halfway toward
// Playful's warmth without giving up readability.
//
//   • Mid-Calm  = Quiet (white cards, thin stripes) + Toddle's
//                 rounded subject tiles, friendlier status pills,
//                 soft shadows, generous spacing. Page chrome stays
//                 ink-50. Titles in ink-900 for max readability.
//
//   • Mid-Vivid = Vivid (subject-tinted cards, full-sat stripes)
//                 toned down so titles read in ink-900 (not subject-
//                 deep) and the tint is ~8% instead of ~18%. Adds
//                 the rounded tile + softer corners. Subject still
//                 reads at a glance, but everything else is calmer.
//
// Each variant gets a Lesson Card artboard + a Weekly artboard so the
// readability + scan-ability tradeoffs are visible side-by-side.

// ───────────────────────────────────────────────────────────────────
// Shared pastel palette (lifted from Playful so the look stays
// consistent across variants)
// ───────────────────────────────────────────────────────────────────
const MID_SUBJ = {
  math:      { tile: "#A8E6E0", bg: "#DCF4F1", deep: "#0F766E", glyph: "Ma" },
  reading:   { tile: "#C4ECC1", bg: "#E4F5E1", deep: "#166534", glyph: "Re" },
  writing:   { tile: "#D9CCFB", bg: "#EBE3FB", deep: "#5B21B6", glyph: "Wr" },
  grammar:   { tile: "#FBD0B6", bg: "#FCE5D5", deep: "#9A3412", glyph: "Gr" },
  spelling:  { tile: "#F9C4DA", bg: "#FCDFEB", deep: "#9D174D", glyph: "Sp" },
  ufli:      { tile: "#FAC0AD", bg: "#FCDFD2", deep: "#9A3412", glyph: "Uf" },
  explorers: { tile: "#FBE38A", bg: "#FEF3C8", deep: "#854D0E", glyph: "Ex" },
  sel:       { tile: "#B6D9FB", bg: "#DAECFE", deep: "#1E40AF", glyph: "Se" },
};

const MID_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const MID_TODAY = 1;

// Compact subject tile — used by both variants for column anchoring.
const MidTile = ({ subject, size = 32, radius = 8, glyphSize }) => {
  const s = MID_SUBJ[subject];
  return (
    <span style={{
      width: size, height: size, borderRadius: radius,
      background: s.tile, color: s.deep,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: glyphSize || Math.round(size * 0.38), fontWeight: 700,
      lineHeight: 1, flex: "0 0 auto", letterSpacing: -0.3,
    }}>{s.glyph}</span>
  );
};

// Status pill shared by both variants. High contrast — fixes the
// Playful issue where pastel-on-pastel washed out.
const MidStatusPill = ({ status }) => {
  const map = {
    done:     { lbl: "Done",    bg: "#DCF4E2", fg: "#0F5132" },
    not_done: { lbl: "To do",   bg: "#EEF1F6", fg: "#334155" },
    partial:  { lbl: "Started", bg: "#FDF3C8", fg: "#7A4F08" },
    skipped:  { lbl: "Skipped", bg: "#EEF1F6", fg: "#64748B" },
    carried:  { lbl: "Moved",   bg: "#FCDFD2", fg: "#7C2D12" },
  };
  const m = map[status] || map.not_done;
  return (
    <span style={{
      padding: "2px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: m.bg, color: m.fg, letterSpacing: 0.1,
    }}>{m.lbl}</span>
  );
};

// Big-target check used by both variants.
const MidCheck = ({ status, subject = "math", size = 22, onCycle }) => {
  const s = MID_SUBJ[subject];
  const done = status === "done";
  return (
    <button onClick={(e) => { e.stopPropagation(); onCycle && onCycle(); }}
      style={{
        width: size, height: size, borderRadius: size * 0.32,
        background: done ? s.deep : "#fff",
        border: `1.8px solid ${done ? s.deep : "#CBD5E1"}`,
        padding: 0, flex: "0 0 auto",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "background .12s, border-color .12s",
      }}>
      {done && <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>}
    </button>
  );
};

// ───────────────────────────────────────────────────────────────────
// Modified-state stripe — DASHED (alternating colored segments).
// Per latest user direction: always stripes, never dots.
// ───────────────────────────────────────────────────────────────────
const dottedStripe = (color) => ({
  position: "absolute", inset: "0 auto 0 0", width: 6,
  backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0 6px, transparent 6px 11px)`,
});
const solidStripe = (color, width = 4) => ({
  position: "absolute", inset: "0 auto 0 0", width, background: color,
});

// ───────────────────────────────────────────────────────────────────
// MID-CALM CARD v2 — soft pastel fill, dotted stripe when modified
// ───────────────────────────────────────────────────────────────────
//
// Refinements over v1 (the all-white original) per user feedback:
//   • Card background is now the subject's LIGHT pastel (the `bg`
//     swatch), not white — adds the warmth the user asked for while
//     still preserving body-text contrast.
//   • Soft drop shadow lifts the card off the page.
//   • Subject monogram tile sits on a white circle for that
//     persona-card-style anchor weight.
//   • Modified cards get a DOTTED stripe on the left edge + a
//     "My version" pill.
//
const MidCalmCard = ({ lesson, dense, selected, onClick }) => {
  const subj = MID_SUBJ[lesson.subject];
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [hovered, setHovered] = React.useState(false);
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: subj.bg,
        border: selected ? `1.5px solid ${subj.deep}` : "1px solid transparent",
        borderRadius: 14, paddingLeft: 0, overflow: "hidden",
        boxShadow: hovered
          ? "0 10px 22px rgba(11,24,30,.10), 0 2px 4px rgba(11,24,30,.04)"
          : "0 4px 10px rgba(11,24,30,.06), 0 1px 2px rgba(11,24,30,.04)",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, border-color .15s, transform .08s",
      }}>
      <div style={lesson.modified ? dottedStripe(subj.deep) : solidStripe(subj.deep, 5)} />

      {lesson.modified && (
        <span style={{
          position: "absolute", top: 9, right: 11,
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          padding: "2px 8px", borderRadius: 999,
          background: "#fff", color: subj.deep, border: `1px solid ${subj.deep}33`,
        }}>My version</span>
      )}

      <div style={{ display: "flex", gap: dense ? 10 : 12, padding: dense ? "11px 12px 11px 16px" : "13px 14px 13px 18px", alignItems: "flex-start" }}>
        {/* Anchor tile — white circle + monogram, persona-card style */}
        <span style={{
          width: dense ? 32 : 36, height: dense ? 32 : 36, borderRadius: 999,
          background: "#fff", color: subj.deep,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: dense ? 11.5 : 13, fontWeight: 700, lineHeight: 1, flex: "0 0 auto",
          letterSpacing: -0.3, boxShadow: "0 1px 2px rgba(11,24,30,.06)",
        }}>{subj.glyph}</span>

        <div style={{ flex: 1, minWidth: 0, paddingRight: lesson.modified ? 80 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: subj.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
            {lesson.moved && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#7C2D12", background: "#FCDFD2", padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3 }}>Moved</span>}
          </div>
          <div style={{
            fontSize: dense ? 13.5 : 15, fontWeight: 700, color: "#0B181E", marginTop: 2,
            lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.15,
            textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
          }}>{lesson.title}</div>
          {!dense && lesson.preview && (
            <div style={{
              fontSize: 12, color: "#475569", marginTop: 5, lineHeight: 1.5, textWrap: "pretty",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{lesson.preview}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: dense ? 6 : 9, flexWrap: "wrap" }}>
            <MidStatusPill status={status} />
            {lesson.resources.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: subj.deep, fontWeight: 600 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
                {lesson.resources.length}
              </span>
            )}
            {lesson.standards.length > 0 && (
              <span className="cp-mono" style={{ fontSize: 10, fontWeight: 600, color: subj.deep, background: "#fff", padding: "1px 7px", borderRadius: 4 }}>CCSS·{lesson.standards.length}</span>
            )}
          </div>
        </div>
        <MidCheck status={status} subject={lesson.subject} size={dense ? 22 : 24} onCycle={() => setStatus(done ? "not_done" : "done")} />
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// MID-VIVID CARD v2 — stronger pastel + dotted modified stripe
// ───────────────────────────────────────────────────────────────────
//
// Refinements over v1 (7% tint):
//   • Card background is now the subject's TILE pastel — the more
//     saturated of the two swatches. Reads loudly at one-meter scan.
//   • Soft drop shadow.
//   • Title still ink-900 (the readability fix we kept from v1).
//   • Modified cards get a DOTTED stripe + a deep-toned "Modified" pill.
//
const MidVividCard = ({ lesson, dense, selected, onClick }) => {
  const subj = MID_SUBJ[lesson.subject];
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [hovered, setHovered] = React.useState(false);
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: subj.tile,
        border: selected ? `1.5px solid ${subj.deep}` : "1px solid transparent",
        borderRadius: 14, overflow: "hidden",
        boxShadow: hovered
          ? `0 12px 24px ${subj.deep}26, 0 2px 4px rgba(11,24,30,.06)`
          : "0 4px 10px rgba(11,24,30,.08), 0 1px 2px rgba(11,24,30,.04)",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, border-color .15s, transform .08s",
      }}>
      <div style={lesson.modified ? dottedStripe(subj.deep) : solidStripe(subj.deep, 5)} />

      {lesson.modified && (
        <span style={{
          position: "absolute", top: 9, right: 11,
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          padding: "2px 9px", borderRadius: 999,
          background: subj.deep, color: "#fff",
        }}>Modified</span>
      )}

      <div style={{ display: "flex", gap: dense ? 10 : 12, padding: dense ? "11px 12px 11px 16px" : "13px 14px 13px 18px", alignItems: "flex-start" }}>
        {/* White circular tile with monogram — persona-card anchor */}
        <span style={{
          width: dense ? 32 : 36, height: dense ? 32 : 36, borderRadius: 999,
          background: "#fff", color: subj.deep,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: dense ? 11.5 : 13, fontWeight: 700, lineHeight: 1, flex: "0 0 auto",
          letterSpacing: -0.3, boxShadow: "0 1px 2px rgba(11,24,30,.08)",
        }}>{subj.glyph}</span>

        <div style={{ flex: 1, minWidth: 0, paddingRight: lesson.modified ? 75 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: subj.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
            {lesson.moved && <span style={{ fontSize: 9.5, fontWeight: 700, color: subj.deep, background: "#fff", border: `1px solid ${subj.deep}33`, padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3 }}>Moved</span>}
          </div>
          <div style={{
            fontSize: dense ? 13.5 : 15, fontWeight: 700, color: "#0B181E", marginTop: 2,
            lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.15,
            textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
          }}>{lesson.title}</div>
          {!dense && lesson.preview && (
            <div style={{
              fontSize: 12, color: "#334155", marginTop: 5, lineHeight: 1.5, textWrap: "pretty",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{lesson.preview}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: dense ? 6 : 9, flexWrap: "wrap" }}>
            <MidStatusPill status={status} />
            {lesson.resources.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: subj.deep, fontWeight: 600 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
                {lesson.resources.length}
              </span>
            )}
            {lesson.standards.length > 0 && (
              <span className="cp-mono" style={{ fontSize: 10, fontWeight: 600, color: subj.deep, background: "#fff", padding: "1px 7px", borderRadius: 4, border: `1px solid ${subj.deep}26` }}>CCSS·{lesson.standards.length}</span>
            )}
          </div>
        </div>
        <MidCheck status={status} subject={lesson.subject} size={dense ? 22 : 24} onCycle={() => setStatus(done ? "not_done" : "done")} />
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Top bar (shared chrome)
// ───────────────────────────────────────────────────────────────────
const MidTopBar = ({ title, subtitle, right, accent }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 14,
    padding: "14px 22px", background: "#fff", borderBottom: "1px solid #ECEFF4",
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

// ───────────────────────────────────────────────────────────────────
// Lesson card artboards — show each variant's card across all states
// ───────────────────────────────────────────────────────────────────
function MidSamplePair({ Card }) {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");
  const ufli = LESSONS.find(l => l.id === "uf-12-2");
  const e = LESSONS.find(l => l.id === "e-12-1");
  const g = LESSONS.find(l => l.id === "g-12-1");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MidSection kicker="Across all eight subjects">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card lesson={m} />
          <Card lesson={r} />
          <Card lesson={w} />
          <Card lesson={ufli} />
          <Card lesson={e} />
          <Card lesson={g} />
        </div>
      </MidSection>
      <MidSection kicker="Personalized states">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card lesson={{ ...m, modified: true }} />
          <Card lesson={{ ...r, moved: "same-week" }} />
          <Card lesson={{ ...w, modified: true, moved: "across-weeks" }} />
          <Card lesson={{ ...ufli, status: "done" }} />
        </div>
      </MidSection>
    </div>
  );
}

const MidSection = ({ kicker, children }) => (
  <div>
    <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{kicker}</div>
    {children}
  </div>
);

const ABMidCalmCard = () => (
  <div style={{ height: "100%", background: "#F6F7F9", padding: "22px 26px", overflow: "auto" }}>
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Middle ground · Calm</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Mid-Calm lesson card</h2>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
          White card with a friendly rounded subject tile + monogram, 12px radius, soft shadow, plain-English status pill. Title stays in ink-900 for maximum readability. Page chrome stays neutral so cards pop without fighting.
        </div>
      </div>
      <MidSamplePair Card={MidCalmCard} />
    </div>
  </div>
);

const ABMidVividCard = () => (
  <div style={{ height: "100%", background: "#FAFBFD", padding: "22px 26px", overflow: "auto" }}>
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Middle ground · Vivid</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Mid-Vivid lesson card</h2>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
          Subject tint as background (gentle 7% mix) + 5px full-saturation stripe. <strong>Title in ink-900</strong>, not subject-deep — the readability fix that Playful was missing. Color still carries the row, but body text breathes.
        </div>
      </div>
      <MidSamplePair Card={MidVividCard} />
    </div>
  </div>
);

// ───────────────────────────────────────────────────────────────────
// Weekly grids — shows each variant at room temperature
// ───────────────────────────────────────────────────────────────────
const midLessonsBySubjectDay = () => {
  const out = {};
  SUBJECTS.forEach(s => { out[s.id] = MID_DAYS.map(() => []); });
  LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l); });
  return out;
};

function MidWeekly({ Card, pageBg = "#F6F7F9" }) {
  const bySD = React.useMemo(midLessonsBySubjectDay, []);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: pageBg }}>
      <MidTopBar title="This week · Week 12" subtitle="Monday January 13 is today"
        right={<button style={{ padding: "8px 16px", borderRadius: 999, background: "#0B181E", color: "#fff", fontSize: 12.5, fontWeight: 600, border: 0, cursor: "pointer" }}>+ Add lesson</button>}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${MID_DAYS.length}, 1fr)`, gap: 8, minWidth: 1100 }}>
          <div />
          {MID_DAYS.map((d, i) => (
            <div key={d} style={{
              fontSize: 12.5, fontWeight: 700, color: i === MID_TODAY ? "#0B181E" : "#64748B",
              padding: "4px 6px 8px", letterSpacing: -0.1,
            }}>
              {d}
              {i === MID_TODAY && <span style={{ marginLeft: 7, padding: "2px 7px", borderRadius: 999, background: "#0B181E", color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Today</span>}
            </div>
          ))}
          {SUBJECTS.map(s => {
            const sp = MID_SUBJ[s.id];
            return (
              <React.Fragment key={s.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 0" }}>
                  <MidTile subject={s.id} size={28} radius={7} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: sp.deep, letterSpacing: -0.1 }}>{s.name}</span>
                </div>
                {MID_DAYS.map((_, d) => {
                  const items = bySD[s.id][d];
                  if (!items || items.length === 0) {
                    return (
                      <div key={d} style={{
                        background: "#fff", border: "1px dashed #DDE3EC", borderRadius: 10,
                        minHeight: 72, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11.5, color: "#94A3B8", fontWeight: 500,
                      }}>+</div>
                    );
                  }
                  return (
                    <div key={d} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.map(l => <Card key={l.id} lesson={l} dense />)}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ABMidCalmWeekly = () => <MidWeekly Card={MidCalmCard} pageBg="#F6F7F9" />;
const ABMidVividWeekly = () => <MidWeekly Card={MidVividCard} pageBg="#FAFBFD" />;

// ───────────────────────────────────────────────────────────────────
// Modified-state showcase — Mid-Calm + Mid-Vivid side-by-side
// ───────────────────────────────────────────────────────────────────
//
// Per user request: dotted side stripe + "Modified" / "My version" pill,
// shown across multiple states (unedited / modified / moved / both) on
// both middle-ground variants, on the same dataset.
//
const ABMidModified = () => {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");
  const ufli = LESSONS.find(l => l.id === "uf-12-2");

  const Pair = ({ Card, label, tone }) => (
    <div style={{
      background: tone, borderRadius: 16, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#0B181E", padding: "2px 9px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>Unedited from team plan</div>
      <div style={{ marginTop: 6 }}><Card lesson={{ ...m, modified: false, moved: null }} /></div>

      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14 }}>Modified by you</div>
      <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3, marginBottom: 6, lineHeight: 1.5, textWrap: "pretty" }}>Dotted side stripe + a pill. Same dataset, just the badge swapped.</div>
      <div><Card lesson={{ ...r, modified: true, moved: null }} /></div>

      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14 }}>Modified + moved to another day</div>
      <div style={{ marginTop: 6 }}><Card lesson={{ ...w, modified: true, moved: "across-weeks" }} /></div>

      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14 }}>Done</div>
      <div style={{ marginTop: 6 }}><Card lesson={{ ...ufli, status: "done" }} /></div>
    </div>
  );

  return (
    <div style={{ height: "100%", background: "#F6F7F9", padding: 22, overflow: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Personalized states</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Modified lessons in both middle themes</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Two refinements applied: card backgrounds are now soft pastels (no more clinical white), drop shadows lift the cards off the page, and modified lessons get a clearly <strong>dotted</strong> stripe down the left edge plus a “My version” or “Modified” pill in the top-right. The same three lessons are shown across both variants so you can compare exactly.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Pair Card={MidCalmCard}  label="Mid-Calm"  tone="#fff" />
          <Pair Card={MidVividCard} label="Mid-Vivid" tone="#FAFBFD" />
        </div>

        <div style={{ marginTop: 18, padding: "14px 16px", background: "#fff", border: "1px solid #ECEFF4", borderRadius: 12, fontSize: 12.5, color: "#475569", lineHeight: 1.6, textWrap: "pretty" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>How the dotted stripe works</div>
          <strong style={{ color: "#0B181E" }}>Solid stripe</strong> = lesson is straight from the team's Core curriculum. <strong style={{ color: "#0B181E" }}>Dotted stripe</strong> = you've personalised this lesson; your changes only show up in your own planner. Pair that with the corner pill (“My version” / “Modified”) and the move chip (“Moved”), and a teacher knows the state of any card without opening it.
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Decision panel — surface the recommendation + asks the user
// ───────────────────────────────────────────────────────────────────
const ABMidDecision = () => {
  return (
    <div style={{ height: "100%", background: "#F6F7F9", padding: 22, overflow: "auto" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Pick one</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Which middle theme should we build out?</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Once you pick, I'll roll the chosen variant across every surface (Weekly · Daily · Schedule · Subject · Task · Catch-up · Core · Standards · To-do · Today) so the whole product matches.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            {
              id: "calm", label: "Mid-Calm", subj: "math",
              kicker: "The conservative pick",
              desc: "Soft pastel cards on a neutral page. Subject colour reads from the stripe + monogram + name pill. Best if you want the least visual noise and the most text-friendly feel for a six-hour day.",
              good: ["Maximum readability", "Calmer at scale (40+ cards on one screen)", "Closest to Phase-1 Quiet"],
              tradeoff: "Slightly slower at-a-glance subject scan."
            },
            {
              id: "vivid", label: "Mid-Vivid", subj: "explorers",
              kicker: "The energetic pick",
              desc: "Stronger pastel fills + persona-card anchor tile. Subject reads at one-meter scan from the colour alone. Best if you want the planner to feel like a colourful workbook, not a spreadsheet.",
              good: ["At-a-glance subject scan", "Warmest feel", "Closest to the Toddle reference"],
              tradeoff: "More visual energy on dense days."
            },
          ].map((opt) => {
            const sp = MID_SUBJ[opt.subj];
            return (
              <div key={opt.id} style={{
                background: opt.id === "calm" ? "#fff" : sp.tile,
                borderRadius: 16, padding: "18px 20px",
                border: opt.id === "calm" ? "1px solid #ECEFF4" : "1px solid transparent",
                boxShadow: "0 8px 22px rgba(11,24,30,.08)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: 999,
                    background: opt.id === "calm" ? sp.bg : "#fff", color: sp.deep,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, letterSpacing: -0.3,
                  }}>{sp.glyph}</span>
                  <span style={{ fontSize: 10.5, color: sp.deep, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{opt.kicker}</span>
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: "#334155", marginTop: 7, lineHeight: 1.55, textWrap: "pretty" }}>{opt.desc}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12 }}>What's good</div>
                <ul style={{ margin: "5px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                  {opt.good.map((g, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "#0B181E", display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <span style={{ color: sp.deep, fontWeight: 700 }}>✓</span>{g}
                    </li>
                  ))}
                </ul>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12 }}>Trade-off</div>
                <div style={{ fontSize: 12.5, color: "#475569", marginTop: 4, lineHeight: 1.5, textWrap: "pretty" }}>{opt.tradeoff}</div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 18, padding: "14px 16px",
          background: "#0B181E", color: "#fff",
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Next step</div>
          <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>
            Reply with <strong>“Build out Mid-Calm”</strong> or <strong>“Build out Mid-Vivid”</strong> (or both, if you want to keep deciding by seeing the full app first) and I'll roll the chosen card style across every surface in the planner.
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Side-by-side artboard — the heart of this tab
// ───────────────────────────────────────────────────────────────────
const ABMidComparison = () => {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");

  const Col = ({ tag, kicker, title, hint, accent, Card, bg }) => (
    <div style={{ background: bg, borderRadius: 14, padding: "16px 16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: accent, padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{tag}</span>
        <span style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{kicker}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 1.5, textWrap: "pretty" }}>{hint}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Card lesson={m} />
        <Card lesson={r} />
        <Card lesson={{ ...w, modified: true }} />
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", background: "#F6F7F9", padding: 22, overflow: "auto" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>The spectrum</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Five points on the readability ↔ warmth slider</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            The same three lessons rendered five ways. Quiet on the far left (most readable, least warm) through Playful on the far right (most warm, least readable). The two new middle options sit between — keeping Playful's pastel warmth while pushing titles back to ink-900 for legibility.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
          {/* Quiet (existing) */}
          <Col tag="A" kicker="Existing" title="Quiet" hint="White cards. Thin subject stripe. Ink-only typography. Most readable." accent="#475569" bg="#fff"
            Card={({ lesson }) => <CPLessonCard lesson={lesson} narrow />} />

          {/* Mid-Calm (new) */}
          <Col tag="B" kicker="New" title="Mid-Calm" hint="Quiet + rounded subject tile + pastel status pill + soft shadow. Warmer." accent="#0F766E" bg="#fff"
            Card={({ lesson }) => <MidCalmCard lesson={lesson} dense />} />

          {/* Mid-Vivid (new) */}
          <Col tag="C" kicker="New" title="Mid-Vivid" hint="Subject tint at 7%. Title stays ink-900. Color reads, text breathes." accent="#1E40AF" bg="#FAFBFD"
            Card={({ lesson }) => <MidVividCard lesson={lesson} dense />} />

          {/* Vivid (existing) */}
          <Col tag="D" kicker="Existing" title="Vivid" hint="Subject tint at 18%. Title in subject-deep. Strong colour scan." accent="#854D0E" bg="#FEF3C8"
            Card={({ lesson }) => <window.VividLessonCard lesson={lesson} narrow />} />

          {/* Playful (existing) */}
          <Col tag="E" kicker="Existing" title="Playful" hint="Pastel playmat + white card + big radius. Warmest, lowest contrast." accent="#9D174D" bg="#FCDFEB"
            Card={({ lesson }) => <window.PlayfulLessonCard lesson={lesson} dense narrow />} />
        </div>

        <div style={{ marginTop: 18, padding: "12px 14px", background: "#fff", border: "1px solid #ECEFF4", borderRadius: 10, fontSize: 12.5, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
          <strong style={{ color: "#0B181E" }}>Recommendation.</strong> <strong>Mid-Vivid (C)</strong> keeps the subject-color scanability that made Vivid useful, but pushes the body text contrast back up where Playful was hurting. <strong>Mid-Calm (B)</strong> is the conservative pick — start from Quiet (which already ships in Phase 1) and add only the friendly pieces.
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  MID_SUBJ, MidStatusPill, MidCheck,
  MidCalmCard, MidVividCard,
  ABMidCalmCard, ABMidVividCard, ABMidCalmWeekly, ABMidVividWeekly, ABMidComparison,
  ABMidModified, ABMidDecision,
});
