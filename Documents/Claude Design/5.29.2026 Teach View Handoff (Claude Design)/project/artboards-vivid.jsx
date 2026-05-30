// artboards-vivid.jsx — Comprehensive Vivid-theme designs for every
// surface. The brief originally asked for one Vivid direction-setting
// prototype; the user has since asked for the full set.
//
// Vivid rules applied consistently across every surface:
//   • Lesson card backgrounds are subject TINT (--cl), not white.
//   • A 5-6px full-saturation stripe sits on the left edge.
//   • Card titles use subject DEEP (--cd) for high contrast on tint.
//   • Top bars, side panels, body chrome stay restrained (--ink-50/paper).
//   • Unit rows use light tint backgrounds, never gray.
//   • Selected / hover states bump the border to the subject's full sat.
//
// At one-meter distance you should be able to tell Math (blue) from
// Writing (purple) from Reading (green) without reading any title.

// ───────────────────────────────────────────────────────────────────
// 1 · Primitives
// ───────────────────────────────────────────────────────────────────
const VV_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const VV_TODAY = 1;

// Subject-tint utility — the heart of Vivid. Mixes the subject color
// with paper to keep contrast WCAG-AA-safe on body text.
const vvBg = (id) => `color-mix(in oklch, var(--${id}) 18%, var(--paper))`;
const vvBgHot = (id) => `color-mix(in oklch, var(--${id}) 32%, var(--paper))`;

// Tiny check primitive (matches Quiet's footprint so the row rhythm is
// preserved across themes — only color treatment differs).
const VividCheck = ({ status, size = 16, onCycle }) => {
  const done = status === "done";
  const partial = status === "partial";
  const skipped = status === "skipped";
  const carried = status === "carried";
  let bg = "var(--paper)", border = "1.6px solid currentColor", glyph = null;
  if (done) {
    bg = "currentColor"; glyph = (
      <svg width={size - 5} height={size - 5} viewBox="0 0 16 16" fill="none" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>
    );
  }
  if (partial) {
    bg = "linear-gradient(135deg, currentColor 50%, var(--paper) 50%)";
    glyph = <svg width={size - 5} height={size - 5} viewBox="0 0 16 16" fill="none" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>;
  }
  if (skipped) glyph = <span style={{ fontSize: size * 0.7, lineHeight: 1, color: "currentColor" }}>—</span>;
  if (carried) glyph = <span style={{ fontSize: size * 0.7, lineHeight: 1, color: "var(--catchup)" }}>↻</span>;
  return (
    <button onClick={(e) => { e.stopPropagation(); onCycle && onCycle(); }}
      style={{
        width: size, height: size, borderRadius: 4,
        background: bg, border, padding: 0, flex: "0 0 auto",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{glyph}</button>
  );
};

// The Vivid lesson card. Background is subject tint. Stripe is full sat.
// Title sits in subject-deep. Meta text in ink-700. Tinted everything.
const VividLessonCard = ({ lesson, dense, selected, onClick, narrow }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const dashed = !!lesson.modified;
  const [hovered, setHovered] = React.useState(false);
  return (
    <div className={`cp-subj ${subj.cls}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        position: "relative",
        background: vvBg(subj.id),
        border: selected ? `1.5px solid var(--c)` : `1px solid color-mix(in oklch, var(--c) 25%, var(--paper))`,
        borderRadius: 6, overflow: "hidden",
        boxShadow: hovered ? `0 4px 14px color-mix(in oklch, var(--c) 28%, transparent)` : "none",
        transition: "box-shadow .12s, border-color .12s, transform .08s",
        cursor: onClick ? "pointer" : "default",
      }}>
      {/* Stripe — solid OR dashed for modified */}
      {dashed ? (
        <div style={{
          position: "absolute", inset: "0 auto 0 0", width: 5,
          backgroundImage: "repeating-linear-gradient(to bottom, var(--c) 0 5px, transparent 5px 10px)",
        }} />
      ) : (
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: 5, background: "var(--c)" }} />
      )}

      {/* Top-right pills — Modified + move arrow */}
      <div style={{ position: "absolute", top: 6, right: 7, display: "flex", gap: 4, alignItems: "center" }}>
        {lesson.moved && (
          <span title={lesson.moved === "across-weeks" ? "Moved across weeks" : "Moved within week"} style={{
            width: 17, height: 17, borderRadius: 4,
            background: "var(--paper)", color: "var(--cd)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, border: `1px solid color-mix(in oklch, var(--c) 35%, transparent)`,
          }}>{lesson.moved === "across-weeks" ? "⤴" : "↔"}</span>
        )}
        {lesson.modified && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
            padding: "2px 7px", borderRadius: 999, background: "var(--c)", color: "var(--paper)",
          }}>Modified</span>
        )}
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px 4px 14px" }}>
        <div style={{ marginTop: 2, color: "var(--c)" }}>
          <VividCheck status={lesson.status} size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: lesson.modified || lesson.moved ? 80 : 4 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--cd)",
            lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1,
            textDecoration: lesson.status === "done" ? "line-through" : "none",
            textDecorationColor: "color-mix(in oklch, var(--cd) 40%, transparent)",
          }}>{lesson.title}</div>
        </div>
      </div>

      {/* Preview — only when not narrow */}
      {!narrow && lesson.preview && (
        <div style={{
          padding: "0 12px 6px 14px", fontSize: 11.5, color: "var(--ink-700)",
          lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", textWrap: "pretty",
        }}>{lesson.preview}</div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 8px 14px", flexWrap: "wrap" }}>
        {lesson.standards.length > 0 && (
          <span className="cp-mono" style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "var(--paper)", color: "var(--cd)", letterSpacing: 0.2,
            border: `1px solid color-mix(in oklch, var(--c) 25%, transparent)`,
          }}>CCSS·{lesson.standards.length}</span>
        )}
        {lesson.resources.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--cd)", fontWeight: 600 }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" /></svg>
            {lesson.resources.length}
          </span>
        )}
        {lesson.tasks && lesson.tasks.length >= 2 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "1px 7px", borderRadius: 999,
            background: "var(--c)", color: "var(--paper)",
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
          }}>{lesson.tasks.length} tasks</span>
        )}
        <div style={{ flex: 1 }} />
        {lesson.status === "carried" && (
          <span style={{ fontSize: 10, color: "var(--catchup)", fontWeight: 600 }}>carry-over</span>
        )}
      </div>
    </div>
  );
};

// Vivid top bar — keeps chrome quiet so the colored cards pop.
const VividTopBar = ({ title, subtitle, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: "var(--paper)", borderBottom: "1px solid var(--ink-150)" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.3 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

// Vivid subject row header — used in Weekly + Subject views to colour
// the row separator with the subject's deep shade.
const VividRowHeader = ({ subj, dense, right }) => (
  <div className={`cp-subj ${subj.cls}`} style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: dense ? "6px 8px" : "9px 12px",
    background: vvBg(subj.id),
    border: `1px solid color-mix(in oklch, var(--c) 30%, transparent)`,
    borderRadius: 6,
  }}>
    <span style={{ width: 5, height: dense ? 18 : 22, background: "var(--c)", borderRadius: 2 }} />
    <span style={{ fontSize: dense ? 12.5 : 14, fontWeight: 700, color: "var(--cd)", letterSpacing: -0.1 }}>{subj.name}</span>
    {right && <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>{right}</div>}
  </div>
);

// ───────────────────────────────────────────────────────────────────
// 2 · Atomic card artboard
// ───────────────────────────────────────────────────────────────────
const ABVividLessonCard = () => {
  const m = LESSONS.find(l => l.id === "m-12-1");
  const r = LESSONS.find(l => l.id === "r-12-1");
  const w = LESSONS.find(l => l.id === "w-12-1");
  const e = LESSONS.find(l => l.id === "e-12-1");
  const ufli = LESSONS.find(l => l.id === "uf-12-2");
  const expl = LESSONS.find(l => l.id === "r-12-litcenters");

  const Section = ({ kicker, title, hint, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-900)", marginTop: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3, lineHeight: 1.5, textWrap: "pretty" }}>{hint}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 22, background: "color-mix(in oklch, var(--ufli-light) 30%, var(--paper))" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Atomic unit · Vivid</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.4 }}>Vivid lesson card</h2>
          <div style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.55, textWrap: "pretty" }}>
            Subject tint as background fill. Full-saturation stripe on the left. Deep-shade title for AA-safe contrast on the tint. At a one-meter glance you can tell Math from Writing from Reading without reading the title — that's the Vivid test.
          </div>
        </div>

        <Section kicker="Default · across all 8 subjects" title="Subject reads from the color, not the label" hint="Each card painted with that subject's tint + stripe + deep title.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <VividLessonCard lesson={m} />
            <VividLessonCard lesson={r} />
            <VividLessonCard lesson={w} />
            <VividLessonCard lesson={ufli} />
            <VividLessonCard lesson={e} />
            <VividLessonCard lesson={expl} />
          </div>
        </Section>

        <Section kicker="Three-tier modification system" title="Unedited · Modified · Moved · Both" hint="Solid stripe for unedited. Dashed for modified. ↔ / ⤴ icon for moved. They compose.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <VividLessonCard lesson={{ ...m, modified: false, moved: null }} />
            <VividLessonCard lesson={{ ...m, modified: true, moved: null }} />
            <VividLessonCard lesson={{ ...r, modified: false, moved: "same-week" }} />
            <VividLessonCard lesson={{ ...w, modified: true, moved: "across-weeks" }} />
          </div>
        </Section>

        <Section kicker="States" title="Selected · Done · Carried · With tasks">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <VividLessonCard lesson={m} selected />
            <VividLessonCard lesson={{ ...ufli, status: "done" }} />
            <VividLessonCard lesson={{ ...w, status: "carried" }} />
            <VividLessonCard lesson={expl} />
          </div>
        </Section>

        <Section kicker="Side-by-side" title="Same lesson · Quiet vs Vivid">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Quiet</div>
              <div style={{ background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 6, padding: 1 }}>
                <CPLessonCard lesson={m} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--math)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Vivid</div>
              <VividLessonCard lesson={m} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 3 · Weekly grid — full Vivid
// ───────────────────────────────────────────────────────────────────
const ABVividWeeklyFull = () => {
  const bySD = React.useMemo(() => {
    const out = {};
    SUBJECTS.forEach(s => { out[s.id] = VV_DAYS.map(() => []); });
    LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l); });
    return out;
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--ufli-light) 18%, var(--paper))" }}>
      <VividTopBar title="This week · Week 12" subtitle="January 12 – 16 · 4 teachers"
        right={<div style={{ display: "flex", gap: 8 }}>
          <button style={vvGhostBtn()}>← Wk 11</button>
          <button style={vvGhostBtn()}>Wk 13 →</button>
          <button style={vvPrimaryBtn()}>+ Add lesson</button>
        </div>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "14px 16px 22px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `124px repeat(${VV_DAYS.length}, 1fr)`,
          gap: 8, minWidth: 1200,
        }}>
          <div />
          {VV_DAYS.map((d, i) => (
            <div key={d} style={{
              fontSize: 12.5, fontWeight: 700, color: "var(--ink-700)",
              padding: "4px 4px 8px", letterSpacing: -0.1,
            }}>
              {d}
              {i === VV_TODAY && <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 999, background: "var(--ink-900)", color: "var(--paper)", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Today</span>}
            </div>
          ))}

          {SUBJECTS.map(s => (
            <React.Fragment key={s.id}>
              <VividRowHeader subj={s} dense />
              {VV_DAYS.map((_, d) => {
                const items = bySD[s.id][d];
                if (!items || items.length === 0) {
                  return (
                    <div key={d} style={{
                      background: vvBg(s.id), opacity: 0.45,
                      border: `1px dashed color-mix(in oklch, var(--${s.id}) 35%, transparent)`,
                      borderRadius: 6, minHeight: 76,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: `var(--${s.id}-deep)`, fontWeight: 500,
                    }}>+ add</div>
                  );
                }
                return (
                  <div key={d} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map(l => <VividLessonCard key={l.id} lesson={l} narrow />)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 4 · Daily two-pane
// ───────────────────────────────────────────────────────────────────
const ABVividDaily = () => {
  const byDay = VV_DAYS.map(() => []);
  LESSONS.forEach(l => { if (l.day != null) byDay[l.day].push(l); });
  const todays = byDay[VV_TODAY];
  const [sel, setSel] = React.useState("m-12-1");
  const lesson = todays.find(l => l.id === sel) || todays[0];
  const subj = SUBJECT_BY_ID[lesson.subject];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <VividTopBar title="Monday, January 13" subtitle={`${todays.length} lessons · 1 currently in progress`} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left list — vivid rows */}
        <div style={{ width: 340, borderRight: "1px solid var(--ink-150)", overflow: "auto", padding: 10, background: "color-mix(in oklch, var(--ufli-light) 20%, var(--paper))" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {todays.map(l => {
              const sj = SUBJECT_BY_ID[l.subject];
              const active = l.id === lesson.id;
              return (
                <div key={l.id} onClick={() => setSel(l.id)}
                  className={`cp-subj ${sj.cls}`}
                  role="button" tabIndex={0}
                  style={{
                    position: "relative",
                    background: active ? vvBgHot(sj.id) : vvBg(sj.id),
                    border: active ? `1.5px solid var(--c)` : `1px solid color-mix(in oklch, var(--c) 22%, transparent)`,
                    borderRadius: 6, padding: "8px 10px 8px 14px",
                    cursor: "pointer",
                  }}>
                  <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4, background: "var(--c)", borderRadius: "6px 0 0 6px" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--cd)", letterSpacing: 0.5, textTransform: "uppercase" }}>{sj.name}</span>
                    <div style={{ flex: 1 }} />
                    <VividCheck status={l.status} size={13} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cd)", marginTop: 2, lineHeight: 1.3, textWrap: "pretty", letterSpacing: -0.1 }}>{l.title}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right detail — full Vivid header block */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <div className={`cp-subj ${subj.cls}`} style={{
            padding: "22px 26px 22px",
            background: vvBg(subj.id),
            borderBottom: `1.5px solid var(--c)`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 4, background: "var(--c)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)" }}>{subj.icon}</span>
              <span style={{ fontSize: 11.5, color: "var(--cd)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{subj.name} · Unit 3</span>
              {lesson.modified && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--c)", color: "var(--paper)" }}>Modified</span>}
            </div>
            <h1 style={{ margin: "8px 0 8px", fontSize: 22, fontWeight: 600, color: "var(--cd)", letterSpacing: -0.4, textWrap: "pretty", lineHeight: 1.2 }}>{lesson.title}</h1>
            {lesson.objective && (
              <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--cd)", fontStyle: "italic" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, padding: "1px 6px", borderRadius: 3, background: "var(--paper)", color: "var(--cd)", fontStyle: "normal", textTransform: "uppercase" }}>I can</span>
                {lesson.objective.replace(/^I can\s+/i, "")}
              </div>
            )}
          </div>

          <div style={{ padding: "18px 26px 24px" }}>
            <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Directions</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-700)", marginTop: 6, textWrap: "pretty" }}>{lesson.directions}</div>

            {lesson.resources.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22 }}>Resources</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  {lesson.resources.map((r, i) => (
                    <div key={i} className={`cp-subj ${subj.cls}`} style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "8px 10px", borderRadius: 5,
                      background: vvBg(subj.id),
                      border: `1px solid color-mix(in oklch, var(--c) 22%, transparent)`,
                    }}>
                      <span style={{ width: 26, height: 26, borderRadius: 4, background: "var(--c)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <CPIcon name={CP_RES_ICON[r.type] || "link"} size={13} />
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: "var(--ink-900)" }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {lesson.standards.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22 }}>Standards</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {lesson.standards.map(c => (
                    <span key={c} className="cp-mono" style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 4,
                      background: "var(--paper)", color: `var(--${subj.id}-deep)`,
                      border: `1px solid color-mix(in oklch, var(--${subj.id}) 30%, transparent)`,
                    }}>{c}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 5 · Schedule timeline
// ───────────────────────────────────────────────────────────────────
const ABVividSchedule = () => {
  const blocks = SCHEDULE;
  const fmt = (t) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1; return `${h12}${m === 0 ? "" : ":" + String(m).padStart(2, "0")} ${ap}`; };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--sel-light) 25%, var(--paper))" }}>
      <VividTopBar title="Schedule · Monday" subtitle="Today's plan, time-blocked"
        right={<button style={vvPrimaryBtn()}>+ Add block</button>}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "18px 26px 26px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {blocks.map((b, i) => {
            const subj = b.subject && SUBJECT_BY_ID[b.subject];
            const lesson = b.lesson && LESSONS.find(l => l.id === b.lesson);
            const isNow = i === 2;
            return (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                <div style={{ width: 88, textAlign: "right", paddingTop: 8, flex: "0 0 auto" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-900)" }}>{fmt(b.start)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 2 }}>to {fmt(b.end)}</div>
                </div>
                {subj ? (
                  <div className={`cp-subj ${subj.cls}`} style={{
                    flex: 1, position: "relative",
                    background: isNow ? vvBgHot(subj.id) : vvBg(subj.id),
                    border: isNow ? `2px solid var(--c)` : `1px solid color-mix(in oklch, var(--c) 28%, transparent)`,
                    borderRadius: 8, padding: "12px 16px 12px 20px",
                    boxShadow: isNow ? `0 4px 16px color-mix(in oklch, var(--c) 30%, transparent)` : "none",
                  }}>
                    <div style={{ position: "absolute", inset: "0 auto 0 0", width: 6, background: "var(--c)", borderRadius: "8px 0 0 8px" }} />
                    {isNow && <div style={{ position: "absolute", top: 10, right: 12, padding: "3px 10px", borderRadius: 999, background: "var(--c)", color: "var(--paper)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>▶ Now</div>}
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--cd)", textTransform: "uppercase", letterSpacing: 0.5 }}>{subj.name}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--cd)", marginTop: 2, textWrap: "pretty", lineHeight: 1.3, letterSpacing: -0.2 }}>{lesson?.title || "—"}</div>
                    {lesson && lesson.preview && (
                      <div style={{ fontSize: 11.5, color: "var(--ink-700)", marginTop: 6, lineHeight: 1.45, textWrap: "pretty", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lesson.preview}</div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    flex: 1, background: "var(--ink-50)", border: "1px solid var(--ink-150)",
                    borderRadius: 8, padding: "11px 16px", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(--ink-100)", color: "var(--ink-500)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>·</span>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-700)" }}>{b.label}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 6 · Subject / Unit view
// ───────────────────────────────────────────────────────────────────
const ABVividSubject = () => {
  const subj = SUBJECT_BY_ID.math;
  const unit = UNITS.math;
  // Synthesize 6 weeks
  const lessons = LESSONS.filter(l => l.subject === "math");
  const weeks = [9, 10, 11, 12, 13, 14].map(wk => ({
    wk, lessons: wk === 12 ? lessons : [
      { id: `m-${wk}-stub-1`, subject: "math", title: ["Number sense", "Equivalent intro", "Adding fractions", "Mid-unit check", "Multiplying", "Unit review"][wk - 9], status: "not_done", resources: [{type:"slides"}], standards: ["5.NF.A.1"], preview: "Synthesized lesson preview for placeholder weeks." },
    ],
  }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: vvBg("math") }}>
      <div className={`cp-subj ${subj.cls}`} style={{ background: "var(--paper)", borderBottom: `2px solid var(--c)` }}>
        <VividTopBar
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 4, background: "var(--c)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 13 }}>{subj.icon}</span>
            {subj.name}
          </span>}
          subtitle={`${unit.name} · ${unit.weeks}`}
          right={<button style={vvPrimaryBtn()}>+ Add lesson</button>}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 26px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {weeks.map(w => {
            const here = w.wk === 12;
            return (
              <div key={w.wk} style={{
                background: "var(--paper)",
                border: here ? `2px solid var(--math)` : `1px solid color-mix(in oklch, var(--math) 22%, transparent)`,
                borderRadius: 8, padding: 14,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: "var(--math-deep)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Week {w.wk}</div>
                  {here && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--math)", color: "var(--paper)" }}>Now</span>}
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{w.lessons.filter(l => l.status === "done").length} / {w.lessons.length} done</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {w.lessons.map(l => <VividLessonCard key={l.id} lesson={l} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 7 · Task list — flat, subject-tinted rows
// ───────────────────────────────────────────────────────────────────
const ABVividTasks = () => {
  const byDay = VV_DAYS.map(() => []);
  LESSONS.forEach(l => { if (l.day != null) byDay[l.day].push(l); });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--ufli-light) 18%, var(--paper))" }}>
      <VividTopBar title="Tasks · This week" subtitle="48 events across 5 days · 11 done"
        right={<div style={{ display: "flex", gap: 6 }}>
          {["Day", "Week", "Unit", "Missed"].map((c, i) => (
            <button key={c} style={i === 1 ? vvChipBtn(true) : vvChipBtn(false)}>{c}</button>
          ))}
        </div>}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 24px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {VV_DAYS.map((d, i) => (
            <div key={d}>
              <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                {d}{i === VV_TODAY && " · today"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {byDay[i].map(l => <VividTaskRow key={l.id} lesson={l} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const VividTaskRow = ({ lesson }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  return (
    <div className={`cp-subj ${subj.cls}`} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px 9px 14px",
      background: vvBg(subj.id),
      border: `1px solid color-mix(in oklch, var(--c) 22%, transparent)`,
      borderRadius: 5, position: "relative",
    }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4, background: "var(--c)", borderRadius: "5px 0 0 5px" }} />
      <span style={{ color: "var(--c)" }}><VividCheck status={lesson.status} size={14} /></span>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--cd)", letterSpacing: 0.5, textTransform: "uppercase", flex: "0 0 auto", width: 64 }}>{subj.name}</span>
      <span style={{
        fontSize: 13, color: "var(--ink-900)", fontWeight: 500, flex: 1, textWrap: "pretty", lineHeight: 1.3,
        textDecoration: lesson.status === "done" ? "line-through" : "none",
        textDecorationColor: "var(--ink-300)",
      }}>{lesson.title}</span>
      {lesson.standards.length > 0 && (
        <span className="cp-mono" style={{ fontSize: 10, fontWeight: 600, color: "var(--cd)", background: "var(--paper)", padding: "1px 6px", borderRadius: 3 }}>CCSS·{lesson.standards.length}</span>
      )}
      {lesson.resources.length > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--cd)", fontWeight: 600 }}>📎 {lesson.resources.length}</span>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 8 · Catch-up screen
// ───────────────────────────────────────────────────────────────────
const ABVividCatchup = () => {
  const missed = LESSONS.filter(l => l.status === "carried" || l.reasonNotDone || l.id === "w-12-1");
  const padded = [...missed, ...LESSONS.filter(l => l.status === "not_done").slice(0, 6)].slice(0, 8);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--catchup) 8%, var(--paper))" }}>
      <div style={{ background: "var(--paper)", borderBottom: "2px solid var(--catchup)" }}>
        <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--catchup)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🔥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.3 }}>Catch up · {padded.length} not covered</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>Across this week and last week · grouped by subject</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["Last week", "Last 4 weeks", "This term", "All year"].map((c, i) => (
              <button key={c} style={i === 0 ? vvChipBtn(true) : vvChipBtn(false)}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 26px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {padded.map(l => {
            const subj = SUBJECT_BY_ID[l.subject];
            return (
              <div key={l.id} className={`cp-subj ${subj.cls}`} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: vvBg(subj.id),
                border: `1px solid color-mix(in oklch, var(--c) 28%, transparent)`,
                borderRadius: 8, padding: "12px 14px 12px 18px", position: "relative",
              }}>
                <div style={{ position: "absolute", inset: "0 auto 0 0", width: 5, background: "var(--c)", borderRadius: "8px 0 0 8px" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--cd)", textTransform: "uppercase", letterSpacing: 0.5 }}>{subj.name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--catchup)", letterSpacing: 0.5, textTransform: "uppercase", padding: "1px 7px", borderRadius: 999, background: "color-mix(in oklch, var(--catchup) 16%, var(--paper))" }}>5 days late</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cd)", marginTop: 3, textWrap: "pretty", letterSpacing: -0.1 }}>{l.title}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={vvChipBtn(false, "small")}>Mark done</button>
                  <button style={vvChipBtn(false, "small")}>Skip for now</button>
                  <button style={{ ...vvChipBtn(true, "small"), background: "var(--catchup)", borderColor: "var(--catchup)" }}>Carry over →</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 9 · Core / Personalized toggle banner
// ───────────────────────────────────────────────────────────────────
const ABVividCore = () => {
  const [mode, setMode] = React.useState("personal");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: mode === "core" ? "color-mix(in oklch, var(--core-mode) 8%, var(--paper))" : "var(--paper)" }}>
      {mode === "core" && (
        <div style={{
          background: "var(--core-mode)", color: "var(--paper)",
          padding: "9px 22px", display: "flex", alignItems: "center", gap: 10,
          fontSize: 12.5, fontWeight: 600, letterSpacing: 0.1,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          Editing the team's <strong>Core curriculum</strong> — every Grade 5 teacher will see your changes.
          <div style={{ flex: 1 }} />
          <button onClick={() => setMode("personal")} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--paper)", background: "color-mix(in oklch, white 20%, transparent)", padding: "3px 10px", borderRadius: 4, border: "1px solid color-mix(in oklch, white 30%, transparent)" }}>← Back to my view</button>
        </div>
      )}

      <VividTopBar title="Where you're working" subtitle="Pick what your edits affect." />

      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button onClick={() => setMode("personal")} style={vvModeCard("math", mode === "personal", "Just for me")}>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--math-deep)", letterSpacing: -0.2 }}>Personalized</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginTop: 5, lineHeight: 1.5, textWrap: "pretty" }}>Your edits stay in your own planner. Teammates still see the team's version.</div>
            </button>
            <button onClick={() => setMode("core")} style={vvModeCard("core-mode", mode === "core", "For the team")}>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--core-mode-deep)", letterSpacing: -0.2 }}>Core curriculum</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginTop: 5, lineHeight: 1.5, textWrap: "pretty" }}>Your edits show up for every teacher on the team. Use when the plan has actually shifted.</div>
            </button>
          </div>

          <div style={{ marginTop: 20, padding: 16, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Preview · sample lesson card in current mode</div>
            <VividLessonCard lesson={mode === "personal" ? { ...LESSONS.find(l => l.id === "m-12-1"), modified: true } : LESSONS.find(l => l.id === "m-12-1")} />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 10, lineHeight: 1.5, textWrap: "pretty" }}>
              {mode === "personal" ? "Modified shows as a 'Modified' pill + dashed stripe — your changes only, team plan untouched." : "Edits in Core mode push to every teacher. No 'Modified' pill, no dashed stripe — it IS the team plan."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const vvModeCard = (id, active, kicker) => ({
  textAlign: "left", padding: "16px 18px", borderRadius: 10,
  background: active ? `color-mix(in oklch, var(--${id}) 18%, var(--paper))` : "var(--paper)",
  border: active ? `2px solid var(--${id})` : `1.5px solid color-mix(in oklch, var(--${id}) 25%, transparent)`,
  cursor: "pointer", color: "var(--ink-900)",
  boxShadow: active ? `0 4px 14px color-mix(in oklch, var(--${id}) 22%, transparent)` : "none",
  display: "flex", flexDirection: "column", gap: 4, position: "relative",
  fontFamily: "inherit",
});

// ───────────────────────────────────────────────────────────────────
// 10 · Standards drill-through
// ───────────────────────────────────────────────────────────────────
const ABVividStandards = () => {
  const code = "5.NF.B.3";
  const desc = STANDARDS[code];
  const matching = LESSONS.filter(l => l.standards.includes(code));
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--math-light) 35%, var(--paper))" }}>
      <div style={{ background: "var(--paper)", borderBottom: "2px solid var(--math)" }}>
        <div style={{ padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 8, background: "var(--math)", color: "var(--paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700 }}>CCSS</span>
          <div style={{ flex: 1 }}>
            <div className="cp-mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.2 }}>{code}</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-700)", marginTop: 6, lineHeight: 1.55, textWrap: "pretty" }}>{desc}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8 }}>{matching.length} lesson{matching.length === 1 ? "" : "s"} cover this · 2 missed</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {matching.map(l => <VividLessonCard key={l.id} lesson={l} />)}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 11 · To-do panel
// ───────────────────────────────────────────────────────────────────
const ABVividTodo = () => {
  const todos = window.TODOS || [];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--writing-light) 30%, var(--paper))" }}>
      <VividTopBar title="To-do list" subtitle="Mine · 6 open · 2 due today"
        right={<button style={vvPrimaryBtn()}>+ Quick add</button>}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {todos.slice(0, 8).map(t => {
            const tag = (window.TAGS || []).find(x => x.id === (t.tags || [])[0]);
            const tagBg = tag ? tag.bg : "var(--ink-100)";
            const tagFg = tag ? tag.fg : "var(--ink-500)";
            const accent = tag ? tag.fg : "var(--ink-400)";
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                background: `color-mix(in oklch, ${accent} 14%, var(--paper))`,
                border: `1px solid color-mix(in oklch, ${accent} 28%, transparent)`,
                borderRadius: 8, padding: "11px 14px 11px 16px", position: "relative",
              }}>
                <div style={{ position: "absolute", inset: "0 auto 0 0", width: 5, background: accent, borderRadius: "8px 0 0 8px" }} />
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${accent}`, flex: "0 0 auto", background: t.done ? accent : "transparent" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)", textWrap: "pretty", lineHeight: 1.3 }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {(t.tags || []).map(tagId => {
                      const tg = (window.TAGS || []).find(x => x.id === tagId);
                      if (!tg) return null;
                      return <span key={tagId} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tg.bg, color: tg.fg, fontSize: 10.5, fontWeight: 600, padding: "1px 8px", borderRadius: 999 }}>{tg.label}</span>;
                    })}
                  </div>
                </div>
                {t.due && <span style={{ fontSize: 11, color: tagFg, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: tagBg }}>{t.due}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 12 · Today dashboard — vivid widget grid
// ───────────────────────────────────────────────────────────────────
const ABVividDashboard = () => {
  const byDay = VV_DAYS.map(() => []);
  LESSONS.forEach(l => { if (l.day != null) byDay[l.day].push(l); });
  const todays = byDay[VV_TODAY];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "color-mix(in oklch, var(--reading-light) 22%, var(--paper))" }}>
      <VividTopBar title="Today · Monday" subtitle="January 13 · everything in one place" />
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px 26px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Today's lessons</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todays.slice(0, 5).map(l => <VividLessonCard key={l.id} lesson={l} narrow />)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { kicker: "Done today", n: "1 of 6", id: "reading" },
              { kicker: "Carry-overs from last week", n: "3 items", id: "ufli", link: true },
              { kicker: "Resources pinned", n: "8", id: "writing" },
              { kicker: "Open comments", n: "5", id: "math" },
            ].map((s, i) => (
              <div key={i} style={{
                background: `color-mix(in oklch, var(--${s.id}) 18%, var(--paper))`,
                border: `1px solid color-mix(in oklch, var(--${s.id}) 28%, transparent)`,
                borderRadius: 10, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10.5, color: `var(--${s.id}-deep)`, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.kicker}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: `var(--${s.id}-deep)`, marginTop: 4, letterSpacing: -0.3 }}>{s.n}</div>
                {s.link && <div style={{ fontSize: 11.5, color: "var(--catchup)", fontWeight: 600, marginTop: 4 }}>Open Catch-up →</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 13 · Style helpers
// ───────────────────────────────────────────────────────────────────
function vvPrimaryBtn() {
  return {
    padding: "8px 16px", borderRadius: 8,
    background: "var(--ink-900)", color: "var(--paper)",
    fontSize: 12.5, fontWeight: 600, border: 0, cursor: "pointer",
  };
}
function vvGhostBtn() {
  return {
    padding: "8px 13px", borderRadius: 6,
    background: "var(--paper)", color: "var(--ink-700)",
    fontSize: 12, fontWeight: 500, border: "1px solid var(--ink-200)", cursor: "pointer",
  };
}
function vvChipBtn(active, size = "md") {
  return {
    padding: size === "small" ? "5px 10px" : "6px 12px",
    fontSize: size === "small" ? 11.5 : 12, fontWeight: 600, borderRadius: 999,
    background: active ? "var(--ink-900)" : "var(--paper)",
    color: active ? "var(--paper)" : "var(--ink-700)",
    border: active ? "1px solid var(--ink-900)" : "1px solid var(--ink-200)",
    cursor: "pointer",
  };
}

// ───────────────────────────────────────────────────────────────────
// 14 · Exports
// ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  VividLessonCard, VividCheck, VividTopBar, VividRowHeader,
  ABVividLessonCard, ABVividWeeklyFull, ABVividDaily, ABVividSchedule,
  ABVividSubject, ABVividTasks, ABVividCatchup, ABVividCore,
  ABVividStandards, ABVividTodo, ABVividDashboard,
});
