// artboards-middle-v1.jsx — Preserves the FIRST attempt at the middle-
// ground designs (white-card Mid-Calm + 7%-tint Mid-Vivid) so the team
// can compare against the pastel v2 designs on the Middle ground tab.
//
// The cards here are deliberately quieter than v2:
//   • Mid-Calm v1 = white card, thin subject stripe, rounded subject
//     tile inside the card header. Most reserved.
//   • Mid-Vivid v1 = card bg mixes subject color at 7% (gentle warmth).
//     Title in ink-900.
//
// The v2 file (artboards-middle.jsx) replaced these with stronger
// pastel fills + persona-card anchor tiles + dotted modified stripes.
// We keep both so you can compare side-by-side.

const MIDV1_SUBJ = window.MID_SUBJ; // share the palette
const MIDV1_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const MIDV1_TODAY = 1;

// Glyph monograms — these stay constant regardless of palette type.
// Color tokens come from useSubjectColor() instead.
const SUBJECT_GLYPH = {
  math: "Ma", reading: "Re", writing: "Wr", grammar: "Gr",
  spelling: "Sp", ufli: "Uf", explorers: "Ex", sel: "Se",
};

// Small rounded subject tile (square, not circle) — v1's anchor.
// Reads colors from the active palette context.
const MidTileV1 = ({ subject, size = 32, radius = 8, glyphSize }) => {
  const s = window.useSubjectColor(subject);
  return (
    <span style={{
      width: size, height: size, borderRadius: radius,
      background: s.tile, color: s.deep,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: glyphSize || Math.round(size * 0.38), fontWeight: 700,
      lineHeight: 1, flex: "0 0 auto", letterSpacing: -0.3,
    }}>{SUBJECT_GLYPH[subject]}</span>
  );
};

// ───────────────────────────────────────────────────────────────────
// Modified-state stripe — DASHED (alternating colored segments).
// We tried dotted in v2; per latest user direction we're back to
// dashed stripes across the board.
// ───────────────────────────────────────────────────────────────────
const dashedStripeV1 = (color, width = 4) => ({
  position: "absolute", inset: "0 auto 0 0", width,
  backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0 6px, transparent 6px 11px)`,
});
const solidStripeV1 = (color, width = 4) => ({
  position: "absolute", inset: "0 auto 0 0", width, background: color,
});

// ───────────────────────────────────────────────────────────────────
// V1 Mid-Calm — white card, thin stripe, square tile
// ───────────────────────────────────────────────────────────────────
const MidCalmCardV1 = ({ lesson, dense, selected, onClick }) => {
  const swatch = window.useSubjectColor(lesson.subject);
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [hovered, setHovered] = React.useState(false);
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: "#fff",
        border: selected ? `1.5px solid ${swatch.deep}` : "1px solid #ECEFF4",
        borderRadius: 12, paddingLeft: 0, overflow: "hidden",
        boxShadow: hovered ? "0 6px 16px rgba(11,24,30,.07)" : "0 1px 2px rgba(11,24,30,.03)",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, border-color .15s",
      }}>
      <div style={lesson.modified ? dashedStripeV1(swatch.stripe, 4) : solidStripeV1(swatch.stripe, 4)} />
      <div style={{ display: "flex", gap: dense ? 10 : 12, padding: dense ? "10px 12px 10px 14px" : "12px 14px 12px 16px", alignItems: "flex-start" }}>
        <MidTileV1 subject={lesson.subject} size={dense ? 30 : 34} radius={9} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: swatch.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
            {lesson.modified && <span style={{ fontSize: 9.5, fontWeight: 700, color: swatch.deep, background: swatch.bg, padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3, border: `1px solid ${swatch.deep}26` }}>My version</span>}
            {lesson.moved && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#9A3412", background: "#FCE5D5", padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3 }}>Moved</span>}
          </div>
          <div style={{
            fontSize: dense ? 13.5 : 14.5, fontWeight: 600, color: "#0B181E", marginTop: 2,
            lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1,
            textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
          }}>{lesson.title}</div>
          {!dense && lesson.preview && (
            <div style={{
              fontSize: 12, color: "#475569", marginTop: 5, lineHeight: 1.5, textWrap: "pretty",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{lesson.preview}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: dense ? 6 : 9, flexWrap: "wrap" }}>
            <window.MidStatusPill status={status} />
            {lesson.resources.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B", fontWeight: 500 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
                {lesson.resources.length}
              </span>
            )}
            {lesson.standards.length > 0 && (
              <span className="cp-mono" style={{ fontSize: 10, fontWeight: 600, color: "#475569", background: "#F2F4F8", padding: "1px 7px", borderRadius: 4 }}>CCSS·{lesson.standards.length}</span>
            )}
          </div>
        </div>
        <window.MidCheck status={status} subject={lesson.subject} size={dense ? 22 : 24} onCycle={() => setStatus(done ? "not_done" : "done")} />
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// V1 Mid-Vivid — subject-tint background, dashed-when-modified stripe
// ───────────────────────────────────────────────────────────────────
const MidVividCardV1 = ({ lesson, dense, selected, onClick }) => {
  const swatch = window.useSubjectColor(lesson.subject);
  const subjMeta = SUBJECT_BY_ID[lesson.subject];
  const [hovered, setHovered] = React.useState(false);
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: swatch.bg,
        border: selected ? `1.5px solid ${swatch.deep}` : `1px solid color-mix(in oklch, ${swatch.deep} 14%, transparent)`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: hovered ? `0 6px 16px color-mix(in oklch, ${swatch.deep} 16%, transparent)` : "none",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, border-color .15s",
      }}>
      <div style={lesson.modified ? dashedStripeV1(swatch.stripe, 5) : solidStripeV1(swatch.stripe, 5)} />
      <div style={{ display: "flex", gap: dense ? 10 : 12, padding: dense ? "10px 12px 10px 15px" : "12px 14px 12px 17px", alignItems: "flex-start" }}>
        <MidTileV1 subject={lesson.subject} size={dense ? 30 : 34} radius={9} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: swatch.deep, textTransform: "uppercase", letterSpacing: 0.6 }}>{subjMeta.name}</span>
            {lesson.modified && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: swatch.deep, padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3 }}>Modified</span>}
            {lesson.moved && <span style={{ fontSize: 9.5, fontWeight: 700, color: swatch.deep, background: "#fff", border: `1px solid ${swatch.deep}33`, padding: "1px 7px", borderRadius: 999, letterSpacing: 0.3 }}>Moved</span>}
          </div>
          <div style={{
            fontSize: dense ? 13.5 : 14.5, fontWeight: 600, color: "#0B181E", marginTop: 2,
            lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1,
            textDecoration: done ? "line-through" : "none", textDecorationColor: "#94A3B8",
          }}>{lesson.title}</div>
          {!dense && lesson.preview && (
            <div style={{
              fontSize: 12, color: "#475569", marginTop: 5, lineHeight: 1.5, textWrap: "pretty",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{lesson.preview}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: dense ? 6 : 9, flexWrap: "wrap" }}>
            <window.MidStatusPill status={status} />
            {lesson.resources.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: swatch.deep, fontWeight: 600 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
                {lesson.resources.length}
              </span>
            )}
            {lesson.standards.length > 0 && (
              <span className="cp-mono" style={{ fontSize: 10, fontWeight: 600, color: swatch.deep, background: "#fff", padding: "1px 7px", borderRadius: 4, border: `1px solid ${swatch.deep}26` }}>CCSS·{lesson.standards.length}</span>
            )}
          </div>
        </div>
        <window.MidCheck status={status} subject={lesson.subject} size={dense ? 22 : 24} onCycle={() => setStatus(done ? "not_done" : "done")} />
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// Sample grid helper
// ───────────────────────────────────────────────────────────────────
function MidV1Sample({ Card }) {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");
  const ufli = LESSONS.find(l => l.id === "uf-12-2");
  const e = LESSONS.find(l => l.id === "e-12-1");
  const g = LESSONS.find(l => l.id === "g-12-1");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Across all eight subjects</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card lesson={m} />
          <Card lesson={r} />
          <Card lesson={w} />
          <Card lesson={ufli} />
          <Card lesson={e} />
          <Card lesson={g} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Personalized states</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card lesson={{ ...m, modified: true }} />
          <Card lesson={{ ...r, moved: "same-week" }} />
          <Card lesson={{ ...w, modified: true, moved: "across-weeks" }} />
          <Card lesson={{ ...ufli, status: "done" }} />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Artboards
// ───────────────────────────────────────────────────────────────────
const ABMidCalmCardV1 = () => (
  <div style={{ height: "100%", background: "#F6F7F9", padding: "22px 26px", overflow: "auto" }}>
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Middle ground · Calm · v1</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Mid-Calm v1 — white card</h2>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
          The first attempt. White card + thin 4px subject stripe + rounded square subject tile inside the card. Subtle soft shadow. Closest to Phase-1 Quiet, just warmed up a touch.
        </div>
      </div>
      <MidV1Sample Card={MidCalmCardV1} />
    </div>
  </div>
);

const ABMidVividCardV1 = () => (
  <div style={{ height: "100%", background: "#FAFBFD", padding: "22px 26px", overflow: "auto" }}>
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Middle ground · Vivid · v1</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Mid-Vivid v1 — 7% subject tint</h2>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
          The first attempt. Card background = subject color mixed with white at 7%. 5px solid stripe. Title still ink-900 for readability. Subtle — most of the colour comes from the stripe + tile, not the fill.
        </div>
      </div>
      <MidV1Sample Card={MidVividCardV1} />
    </div>
  </div>
);

const midV1BySubjectDay = () => {
  const out = {};
  SUBJECTS.forEach(s => { out[s.id] = MIDV1_DAYS.map(() => []); });
  LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l); });
  return out;
};

function MidV1Weekly({ Card, pageBg }) {
  const bySD = React.useMemo(midV1BySubjectDay, []);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: pageBg }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 22px", background: "#fff", borderBottom: "1px solid #ECEFF4",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>This week · Week 12</div>
          <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>Monday January 13 is today</div>
        </div>
        <button style={{ padding: "8px 16px", borderRadius: 999, background: "#0B181E", color: "#fff", fontSize: 12.5, fontWeight: 600, border: 0, cursor: "pointer" }}>+ Add lesson</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${MIDV1_DAYS.length}, 1fr)`, gap: 8, minWidth: 1100 }}>
          <div />
          {MIDV1_DAYS.map((d, i) => (
            <div key={d} style={{
              fontSize: 12.5, fontWeight: 700, color: i === MIDV1_TODAY ? "#0B181E" : "#64748B",
              padding: "4px 6px 8px", letterSpacing: -0.1,
            }}>
              {d}
              {i === MIDV1_TODAY && <span style={{ marginLeft: 7, padding: "2px 7px", borderRadius: 999, background: "#0B181E", color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Today</span>}
            </div>
          ))}
          {SUBJECTS.map(s => {
            const sp = MIDV1_SUBJ[s.id];
            return (
              <React.Fragment key={s.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 0" }}>
                  <MidTileV1 subject={s.id} size={28} radius={7} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: sp.deep, letterSpacing: -0.1 }}>{s.name}</span>
                </div>
                {MIDV1_DAYS.map((_, d) => {
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

const ABMidCalmWeeklyV1 = () => <MidV1Weekly Card={MidCalmCardV1} pageBg="#F6F7F9" />;
const ABMidVividWeeklyV1 = () => <MidV1Weekly Card={MidVividCardV1} pageBg="#FAFBFD" />;

// ───────────────────────────────────────────────────────────────────
// v1-vs-v2 side-by-side artboard — the comparison the user asked for
// ───────────────────────────────────────────────────────────────────
const ABMidV1VsV2 = () => {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");

  const Col = ({ tag, title, hint, Card, dim, bg = "#fff" }) => (
    <div style={{ background: bg, border: "1px solid #ECEFF4", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: "#0B181E", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{tag}</span>
        {dim && <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{dim}</span>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4, lineHeight: 1.5, textWrap: "pretty" }}>{hint}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Card lesson={m} />
        <Card lesson={r} />
        <Card lesson={{ ...w, modified: true }} />
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", background: "#F6F7F9", padding: 22, overflow: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>v1 vs v2</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Compare the two iterations</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            v1 is the original middle-ground attempt (white Mid-Calm, 7% tint Mid-Vivid). v2 added more pastel, a persona-card anchor tile, and a dotted stripe for modified lessons. The same three lessons across all four variants.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <Col tag="v1" dim="Calm" title="Mid-Calm v1" hint="White card · thin stripe · square tile. The original." Card={({ lesson }) => <MidCalmCardV1 lesson={lesson} dense />} />
          <Col tag="v2" dim="Calm" title="Mid-Calm v2" hint="Pastel fill · drop shadow · white circle tile + dotted stripe." Card={({ lesson }) => <window.MidCalmCard lesson={lesson} dense />} />
          <Col tag="v1" dim="Vivid" title="Mid-Vivid v1" hint="7% subject tint · 5px stripe · square tile. Subtle." Card={({ lesson }) => <MidVividCardV1 lesson={lesson} dense />} bg="#FAFBFD" />
          <Col tag="v2" dim="Vivid" title="Mid-Vivid v2" hint="Stronger pastel · drop shadow · white circle tile + dotted stripe." Card={({ lesson }) => <window.MidVividCard lesson={lesson} dense />} bg="#FAFBFD" />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  MidCalmCardV1, MidVividCardV1,
  ABMidCalmCardV1, ABMidVividCardV1, ABMidCalmWeeklyV1, ABMidVividWeeklyV1,
  ABMidV1VsV2,
});
