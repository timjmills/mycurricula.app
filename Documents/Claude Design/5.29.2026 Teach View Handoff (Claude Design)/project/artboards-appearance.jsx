// artboards-appearance.jsx — The shipping spec.
//
// Three card styles users pick from:
//   1. Quiet        (the existing white-card / thin-stripe original)
//   2. Mid-Calm v1  (white card + rounded subject tile)
//   3. Mid-Vivid v1 (subject-tinted background + matching stripe)
//
// Plus a paired Normal/Highlight palette: 20 swatches, each with a
// confident-saturated variant and a highlighter-marker variant. The
// Core Curriculum locks the subject→swatch mapping team-wide. Each
// teacher individually picks Normal or Highlight as their viewing
// preference. Personal subjects: teacher picks their own swatch.
//
// This file contains:
//   • 3 × 2 grid showing the same Math lesson card in every
//     combination (Quiet/Mid-Calm/Mid-Vivid × Normal/Highlight).
//   • Settings → Appearance screen mock: style picker, palette
//     toggle, swatch picker per subject (Core view + Personal view).
//   • Full 20-swatch palette reference card.

// ── 3 × 2 style/palette grid ─────────────────────────────────────────
const AB3x2Grid = () => {
  const lesson = LESSONS.find(l => l.id === "m-12-1");
  const reading = LESSONS.find(l => l.id === "r-12-1");
  const writing = LESSONS.find(l => l.id === "w-12-1");

  const styles = [
    { id: "quiet",   label: "Quiet",     hint: "Phase-1 original. White card, thin 4px subject stripe." },
    { id: "calm",    label: "Mid-Calm",  hint: "White card + rounded subject tile in the header." },
    { id: "vivid",   label: "Mid-Vivid", hint: "Subject tint as background fill + matching stripe." },
  ];
  const palettes = [
    { id: "normal",    label: "Normal palette",    hint: "Darker, confident saturation. Reads as a regular school palette." },
    { id: "highlight", label: "Highlight palette", hint: "Highlighter-marker tones. Bright, electric, distinct from Normal." },
  ];

  const Card = ({ style, lesson, dense }) => {
    if (style === "quiet")  return <CPLessonCard      lesson={lesson} narrow />;
    if (style === "calm")   return <window.MidCalmCardV1  lesson={lesson} dense={dense} />;
    if (style === "vivid")  return <window.MidVividCardV1 lesson={lesson} dense={dense} />;
    return null;
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#F6F7F9", padding: 24 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Six combinations</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Three styles × two palettes</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Every teacher's view is one of six combinations. The Math lesson here uses the same data; only the card style and palette type change. Subject identity (which swatch represents Math) is locked by the Core Curriculum — only the saturation flips per-teacher.
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr 1fr",
          gap: 14,
          background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #ECEFF4",
          boxShadow: "0 1px 2px rgba(11,24,30,.04)",
        }}>
          {/* header row */}
          <div />
          {palettes.map(p => (
            <div key={p.id} style={{ padding: "8px 0" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Palette</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2, marginTop: 2 }}>{p.label}</div>
              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>{p.hint}</div>
            </div>
          ))}

          {/* one row per style */}
          {styles.map(s => (
            <React.Fragment key={s.id}>
              <div style={{ padding: "12px 0", borderTop: "1px solid #ECEFF4" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Style</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2, marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4, lineHeight: 1.45, textWrap: "pretty" }}>{s.hint}</div>
              </div>
              {palettes.map(p => (
                <div key={p.id} style={{ padding: "12px 0", borderTop: "1px solid #ECEFF4" }}>
                  <window.PaletteProvider type={p.id}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Card style={s.id} lesson={lesson} />
                      <Card style={s.id} lesson={{ ...reading, modified: true }} />
                      <Card style={s.id} lesson={{ ...writing, moved: "across-weeks" }} />
                    </div>
                  </window.PaletteProvider>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Modified-stripe explainer */}
        <div style={{ marginTop: 16, padding: "14px 16px", background: "#fff", border: "1px solid #ECEFF4", borderRadius: 12, fontSize: 12.5, color: "#475569", lineHeight: 1.6, textWrap: "pretty" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>How modified lessons show up</div>
          A lesson personalized from the team's Core Curriculum keeps its subject color, but the left stripe switches from <strong>solid</strong> to <strong>dashed</strong> (alternating colored segments). Paired with a corner pill ("My version" or "Modified") and the Moved chip when relevant.
        </div>
      </div>
    </div>
  );
};

// ── Settings → Appearance ────────────────────────────────────────────
const ABSettingsAppearance = () => {
  const [style, setStyle] = React.useState("vivid");
  const [paletteType, setPaletteType] = React.useState("normal");
  const [mapping, setMapping] = React.useState(window.DEFAULT_SUBJECT_MAPPING);
  const [editingSubject, setEditingSubject] = React.useState(null);
  // toggle between Core view (read-only, "set by your lead") and
  // Personal view (where the teacher tweaks personal-subject colors)
  const [scope, setScope] = React.useState("personal");

  const setSubjectSwatch = (subjectId, swatchId) => {
    setMapping(prev => ({ ...prev, [subjectId]: swatchId }));
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#F6F7F9", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Settings</div>
          <span style={{ fontSize: 11, color: "#CBD5E1" }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Appearance</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Style picker */}
          <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: "18px 18px 16px", boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Card style</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>How your planner looks</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 1.55, textWrap: "pretty" }}>Personal preference — your teammates can pick a different one.</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "quiet", label: "Quiet",     desc: "Minimal. White cards, thin subject stripe. Best for long workdays." },
                { id: "calm",  label: "Mid-Calm",  desc: "White cards with a friendly subject monogram tile. Warmer." },
                { id: "vivid", label: "Mid-Vivid", desc: "Subject tint fills the card. Colour reads at a glance." },
              ].map(s => (
                <button key={s.id} onClick={() => setStyle(s.id)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 14px", borderRadius: 10,
                  background: style === s.id ? "#F2F4F8" : "#fff",
                  border: style === s.id ? "1.5px solid #0B181E" : "1px solid #ECEFF4",
                  textAlign: "left", cursor: "pointer",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 999,
                    border: `2px solid ${style === s.id ? "#0B181E" : "#CBD5E1"}`,
                    background: style === s.id ? "#0B181E" : "#fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
                  }}>{style === s.id && <span style={{ width: 6, height: 6, borderRadius: 999, background: "#fff" }} />}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0B181E" }}>{s.label}</div>
                    <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2, lineHeight: 1.45, textWrap: "pretty" }}>{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Palette toggle */}
          <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: "18px 18px 16px", boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Palette</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>Color intensity</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 1.55, textWrap: "pretty" }}>Personal preference — the hues are set team-wide; only saturation changes.</div>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "normal",    label: "Normal",    desc: "Confident, slightly darker. Like a school workbook.",       swatches: window.PALETTE_20.slice(0, 6).map(s => s.normal) },
                { id: "highlight", label: "Highlight", desc: "Highlighter-marker bright. Electric, distinct.", swatches: window.PALETTE_20.slice(0, 6).map(s => s.highlight) },
              ].map(p => (
                <button key={p.id} onClick={() => setPaletteType(p.id)} style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
                  padding: "12px 14px", borderRadius: 10,
                  background: paletteType === p.id ? "#F2F4F8" : "#fff",
                  border: paletteType === p.id ? "1.5px solid #0B181E" : "1px solid #ECEFF4",
                  textAlign: "left", cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 999,
                      border: `2px solid ${paletteType === p.id ? "#0B181E" : "#CBD5E1"}`,
                      background: paletteType === p.id ? "#0B181E" : "#fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>{paletteType === p.id && <span style={{ width: 6, height: 6, borderRadius: 999, background: "#fff" }} />}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0B181E" }}>{p.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {p.swatches.map((c, i) => (
                      <span key={i} style={{ width: 18, height: 18, borderRadius: 5, background: c }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.45, textWrap: "pretty" }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Live preview</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11, color: "#475569" }}>Style: <strong style={{ color: "#0B181E" }}>{ style === "quiet" ? "Quiet" : style === "calm" ? "Mid-Calm" : "Mid-Vivid" }</strong> · Palette: <strong style={{ color: "#0B181E" }}>{paletteType === "normal" ? "Normal" : "Highlight"}</strong></div>
          </div>
          <window.PaletteProvider type={paletteType} mapping={mapping}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[LESSONS.find(l => l.id === "m-12-1"), LESSONS.find(l => l.id === "r-12-1"), LESSONS.find(l => l.id === "w-12-1")].map(l => {
                if (style === "quiet")  return <CPLessonCard           key={l.id} lesson={l} narrow />;
                if (style === "calm")   return <window.MidCalmCardV1   key={l.id} lesson={l} dense />;
                if (style === "vivid")  return <window.MidVividCardV1  key={l.id} lesson={l} dense />;
                return null;
              })}
            </div>
          </window.PaletteProvider>
        </div>

        {/* Subject colors — scope toggle */}
        <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: "18px 18px 18px", boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Subject colors</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>Which swatch represents each subject</div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 1.55, textWrap: "pretty" }}>
                Team subjects are set in the Core Curriculum — only your team lead can change them. Personal subjects (Morning Meeting, Afternoon Circle, etc.) you own and edit.
              </div>
            </div>
            <div style={{ display: "inline-flex", padding: 3, background: "#F2F4F8", borderRadius: 8, gap: 1 }}>
              {[["team", "Team subjects"], ["personal", "Personal subjects"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setScope(id)} style={{
                  padding: "6px 14px", fontSize: 12.5, fontWeight: 500, borderRadius: 6,
                  background: scope === id ? "#fff" : "transparent",
                  color: scope === id ? "#0B181E" : "#64748B",
                  boxShadow: scope === id ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                  cursor: "pointer", border: 0,
                }}>{lbl}</button>
              ))}
            </div>
          </div>

          {scope === "team" && (
            <div style={{ background: "#FEF3C8", border: "1px solid #FACC15", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#7A4F08", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5, textWrap: "pretty" }}>
              <span style={{ fontWeight: 700, flex: "0 0 auto" }}>Locked</span>
              <span style={{ flex: 1 }}>Your team lead, Omar Bishara, set these in the Core Curriculum so the whole team sees the same hue for each subject. Ask the lead to change them.</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {SUBJECTS.map(s => {
              const swatchId = mapping[s.id];
              const swatch = window.PALETTE_BY_ID[swatchId];
              const editing = editingSubject === s.id;
              const locked = scope === "team"; // team subjects are read-only here
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  border: "1px solid #ECEFF4", borderRadius: 10,
                  background: editing ? "#F2F4F8" : "#fff",
                  opacity: locked ? 0.85 : 1,
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: paletteType === "highlight" ? swatch.highlight : swatch.normal,
                    border: `1px solid ${swatch.deep}26`, flex: "0 0 auto",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0B181E" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{swatch.name}</div>
                  </div>
                  <button
                    disabled={locked}
                    onClick={() => setEditingSubject(editing ? null : s.id)}
                    style={{
                      padding: "5px 12px", borderRadius: 999,
                      background: editing ? "#0B181E" : "#fff",
                      color: editing ? "#fff" : (locked ? "#94A3B8" : "#0B181E"),
                      border: editing ? "1px solid #0B181E" : "1px solid #E2E8F0",
                      fontSize: 11.5, fontWeight: 600, cursor: locked ? "not-allowed" : "pointer",
                    }}>{locked ? "🔒 Locked" : (editing ? "Done" : "Change")}</button>
                </div>
              );
            })}
          </div>

          {/* Swatch picker — opens inline when editing a subject */}
          {editingSubject && (
            <div style={{ marginTop: 14, padding: 14, border: "1px solid #ECEFF4", borderRadius: 10, background: "#FAFBFD" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Pick a swatch for {SUBJECT_BY_ID[editingSubject].name}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 8 }}>
                {window.PALETTE_20.map(s => {
                  const active = mapping[editingSubject] === s.id;
                  const color = paletteType === "highlight" ? s.highlight : s.normal;
                  return (
                    <button key={s.id}
                      title={s.name}
                      onClick={() => setSubjectSwatch(editingSubject, s.id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: 4, borderRadius: 8,
                        background: active ? "#fff" : "transparent",
                        border: active ? "1.5px solid #0B181E" : "1.5px solid transparent",
                        cursor: "pointer",
                      }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: color,
                        boxShadow: active ? `0 0 0 2px ${s.deep}` : "none",
                        border: `1px solid ${s.deep}26`,
                      }} />
                      <span style={{ fontSize: 9.5, color: "#64748B", fontWeight: 500 }}>{s.name}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 10, lineHeight: 1.5, textWrap: "pretty" }}>
                The hue is locked when you save. Other teachers see the same hue — only the saturation changes based on their Normal/Highlight preference.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 20-swatch palette reference card ─────────────────────────────────
const ABPaletteReference = () => {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#FAFBFD", padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>The 20-color paired palette</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Every swatch has a Normal and Highlight twin</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            The Core Curriculum picks one swatch per subject. Each teacher's palette preference selects which column they see.
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 0 }}>
            {/* header */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px", borderBottom: "1px solid #ECEFF4" }}>Color</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px", borderBottom: "1px solid #ECEFF4" }}>Normal</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px", borderBottom: "1px solid #ECEFF4" }}>Highlight</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px", borderBottom: "1px solid #ECEFF4" }}>Deep (for text)</div>

            {window.PALETTE_20.map(s => (
              <React.Fragment key={s.id}>
                <div style={{ padding: "10px 6px", fontSize: 13, fontWeight: 600, color: "#0B181E", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: s.normal, border: `1px solid ${s.deep}33` }} />
                  {s.name}
                </div>
                <div style={{ padding: "10px 6px", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 36, height: 22, borderRadius: 5, background: s.normal, border: `1px solid ${s.deep}33` }} />
                  <span className="cp-mono" style={{ fontSize: 11, color: "#64748B" }}>{s.normal}</span>
                </div>
                <div style={{ padding: "10px 6px", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 36, height: 22, borderRadius: 5, background: s.highlight, border: `1px solid ${s.deep}33` }} />
                  <span className="cp-mono" style={{ fontSize: 11, color: "#64748B" }}>{s.highlight}</span>
                </div>
                <div style={{ padding: "10px 6px", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 5, background: s.deep }} />
                  <span className="cp-mono" style={{ fontSize: 11, color: "#64748B" }}>{s.deep}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Build directions / spec card ─────────────────────────────────────
const ABBuildDirections = () => {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#F6F7F9", padding: 24 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Updated spec</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>What we're building</h2>

        <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: "18px 22px", marginTop: 12, fontSize: 13.5, color: "#334155", lineHeight: 1.65, textWrap: "pretty" }}>
          <Block title="Three card styles users pick from">
            <Stat><strong>Quiet</strong> — Minimal. White cards with a thin 4px subject stripe on the left. Closest to a typical productivity tool.</Stat>
            <Stat><strong>Mid-Calm v1</strong> — White cards with a small rounded subject-monogram tile (Ma, Re, Wr…) inside the header. Subject name + status pill in subject color.</Stat>
            <Stat><strong>Mid-Vivid v1</strong> — Subject color as a soft tinted background. Solid subject stripe on the left. Title stays ink-900 for AA-strong readability.</Stat>
            <p style={{ margin: "8px 0 0", color: "#475569" }}>Each teacher picks one in Settings → Appearance. Personal preference; teammates are independent.</p>
          </Block>

          <Block title="20-color paired palette">
            <Stat>The Core Curriculum carries one subject → swatch mapping, set by the team lead. Every teacher sees the same hue for each subject.</Stat>
            <Stat>Each swatch in the 20-color palette has a paired <strong>Normal</strong> (darker, confident) and <strong>Highlight</strong> (highlighter-marker bright) variant.</Stat>
            <Stat>Each teacher picks Normal or Highlight as a personal viewing preference. Subject identity stays; only the aesthetic flips.</Stat>
            <Stat>Personal subjects (Morning Meeting, etc.) — the owning teacher picks their own swatch from the same 20-color pool.</Stat>
          </Block>

          <Block title="Modified-lesson indicator">
            <Stat>Subject color stripe on the left switches from <strong>solid</strong> to <strong>dashed</strong> (alternating colored segments) when a lesson has been personalized.</Stat>
            <Stat>Pairs with a "Modified" or "My version" pill in the top-right of the card.</Stat>
            <Stat>Move state: separate "Moved" chip in the meta row. Composes with the dashed stripe for modified+moved lessons.</Stat>
          </Block>

          <Block title="What changes Phase-1 → Phase-2">
            <Stat><strong>Phase 1:</strong> ship the three styles + paired palette + Settings → Appearance picker. All teachers default to Quiet + Normal at first login.</Stat>
            <Stat><strong>Phase 2:</strong> add density + reduce-motion + custom background layer on top. The full Appearance settings panel from the planning doc.</Stat>
            <Stat>Phase-1 Vivid (the saturated-card direction from the original brief) and the Playful theme are <strong>archived as reference</strong> in this exploration but not in the Phase-1 ship.</Stat>
          </Block>
        </div>
      </div>
    </div>
  );
};

const Block = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: "#0B181E", letterSpacing: -0.2 }}>{title}</div>
    <div style={{ marginTop: 6 }}>{children}</div>
  </div>
);
const Stat = ({ children }) => (
  <p style={{ margin: "4px 0", paddingLeft: 14, position: "relative" }}>
    <span style={{ position: "absolute", left: 0, top: 8, width: 5, height: 5, borderRadius: 999, background: "#94A3B8" }} />
    {children}
  </p>
);

Object.assign(window, { AB3x2Grid, ABSettingsAppearance, ABPaletteReference, ABBuildDirections });
