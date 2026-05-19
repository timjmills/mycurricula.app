// artboards-new.jsx — Phase 1 additions:
//   • Catch-up screen (§5.17) — full-page coverage triage
//   • Standards drill-through side panel
//   • Master/Core-mode flashing → persistent banner sequence
//   • Keyboard shortcut cheat sheet modal (?-triggered)
//   • Vivid theme direction-setting weekly grid (Phase 2 preview, one artboard)

// ─────────────────────────────────────────────────────────────────────
// Helper: synthetic uncovered events spread across recent weeks
// ─────────────────────────────────────────────────────────────────────
const CATCHUP_ITEMS = [
  // Last week (W11)
  { id: "c1", week: 11, day: "Tue · Nov 3", subject: "math",    unit: "Unit 3 · Fractions on a Number Line", title: "Multiplying a fraction by a whole number", preview: "Concrete-pictorial-abstract sequence. Start with fraction tiles, move to area models, end with the algorithm.", status: "not_done",   standards: ["5.NF.B.4"], resources: 2, reasonNotDone: "Whole class behind on warm-up; gave them 10 min more on the bake-sale problem." },
  { id: "c2", week: 11, day: "Wed · Nov 4", subject: "writing", unit: "Unit 3 · Personal Narrative",          title: "Peer feedback — show vs tell",             preview: "Partner conferences focused on one paragraph: highlight what's telling, suggest one place to show.",      status: "partial",    standards: ["W.5.3.B"], resources: 1, reasonNotDone: "Two book-club groups still drafting from last week — pushed feedback to Wednesday." },
  { id: "c3", week: 11, day: "Thu · Nov 5", subject: "explorers", unit: "Unit 2 · Ancient Egypt",             title: "Hieroglyphs cartouche workshop",          preview: "Students build their own name cartouche in hieroglyphs using the phonetic alphabet handout.",            status: "skipped",    standards: [],          resources: 2, reasonNotDone: "Glue ran out; pivoted to a vocabulary review instead." },
  // 4-weeks back
  { id: "c4", week: 10, day: "Mon · Oct 26", subject: "math",   unit: "Unit 3 · Fractions on a Number Line",  title: "Equivalent fractions warm-up — extension", preview: "Number-talk routine: pairs find three equivalent fractions for 3/4, share strategies, then class consolidates.", status: "carried", standards: ["5.NF.B.3"], resources: 2, reasonNotDone: "Sub was here Friday — couldn't run a number talk cold." },
  { id: "c5", week: 9,  day: "Wed · Oct 21", subject: "reading", unit: "Unit 2 · Realistic Fiction",          title: "Wonder, chs 14–17 — point of view",       preview: "First-person narrator shift from August to Via. Students annotate three places the same event is reframed.", status: "not_done", standards: ["RL.5.6","RL.5.3"], resources: 2, reasonNotDone: "" },
  { id: "c6", week: 8,  day: "Thu · Oct 15", subject: "grammar", unit: "Unit 2 · Verb Tense & Agreement",     title: "Inappropriate shifts in tense",           preview: "Edit a one-paragraph narrative that drifts between tenses. Highlight every verb, then rewrite consistently.", status: "skipped", standards: ["L.5.1.D"], resources: 1, reasonNotDone: "PD pulled me out at 2:30. Came back to a half-finished sort." },
  { id: "c7", week: 7,  day: "Tue · Oct 6",  subject: "sel",     unit: "Unit 2 · Conflict & Resolution",      title: "Conflict — name it, claim it",             preview: "Class circle. Students share one small recent conflict (anonymously written), the group identifies its trigger.", status: "not_done", standards: [], resources: 0, reasonNotDone: "Class circle didn't feel safe yet; need one more morning meeting before this." },
];

// ─────────────────────────────────────────────────────────────────────
// 1 · CATCH-UP SCREEN (§5.17)
// ─────────────────────────────────────────────────────────────────────
function ABCatchupScreen() {
  const [scope, setScope] = React.useState("last4"); // lastWeek | last4 | term | year
  const [groupBy, setGroupBy] = React.useState("subject"); // subject | chrono | standard | unit
  const [selected, setSelected] = React.useState(new Set());
  const [statusFilter, setStatusFilter] = React.useState(new Set(["not_done","partial","carried"]));

  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const items = CATCHUP_ITEMS.filter(i => statusFilter.has(i.status))
    .filter(i => scope === "year" ? true
              : scope === "term" ? i.week >= 1
              : scope === "last4" ? i.week >= 8
              : i.week === 11);

  // Group
  const groups = {};
  items.forEach(i => {
    const k = groupBy === "subject" ? SUBJECT_BY_ID[i.subject].name
            : groupBy === "chrono"  ? `Week ${i.week}`
            : groupBy === "standard" ? (i.standards[0] || "Untagged")
            : i.unit;
    (groups[k] = groups[k] || []).push(i);
  });

  const total = CATCHUP_ITEMS.length;
  const covered = 142;          // headline numbers per the planning doc example
  const pct = 67;

  return (
    <div className="cp-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <CPTopBar view="weekly" />

      {/* Header */}
      <div style={{ padding: "16px 22px 12px", background: "var(--paper)", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--catchup)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
              <CPIcon name="flame" size={12} /> Catch-up
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>What I haven't covered yet</h1>
            <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
              Grade 5 · 2025–26 school year · Lena Haddad
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* Coverage stat */}
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, color: "var(--ink-900)" }}>{pct}<span style={{ fontSize: 18, color: "var(--ink-400)" }}>%</span></span>
              <span style={{ fontSize: 13, color: "var(--ink-500)" }}>covered</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--catchup)", fontWeight: 500 }}>{total} uncovered across 12 weeks</div>
          </div>
        </div>
        {/* Coverage bar */}
        <div style={{ marginTop: 12, height: 6, borderRadius: 999, background: "var(--ink-100)", overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${pct}%`, background: "var(--done)" }} />
          <div style={{ width: `${100-pct}%`, background: "var(--catchup)" }} />
        </div>
      </div>

      {/* Filters — sticky */}
      <div style={{
        padding: "10px 22px", background: "var(--paper)",
        borderBottom: "1px solid var(--ink-100)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        position: "sticky", top: 0, zIndex: 2,
      }}>
        <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Scope</span>
        {[
          ["lastWeek","Last week"],
          ["last4","Last 4 weeks"],
          ["term","This term"],
          ["year","All year"],
        ].map(([k, lbl]) => (
          <button key={k} onClick={()=>setScope(k)} style={{
            padding: "3px 11px", fontSize: 12, fontWeight: 500, borderRadius: 999,
            background: scope === k ? "var(--ink-900)" : "var(--paper)",
            color: scope === k ? "var(--paper)" : "var(--ink-700)",
            border: `1px solid ${scope === k ? "var(--ink-900)" : "var(--ink-200)"}`,
          }}>{lbl}</button>
        ))}
        <span style={{ height: 18, width: 1, background: "var(--ink-200)" }} />
        <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Status</span>
        {[
          ["not_done","Not done","var(--ink-300)"],
          ["partial","Partial","var(--important)"],
          ["skipped","Skipped","var(--ink-400)"],
          ["carried","Carry-over","var(--catchup)"],
        ].map(([k, lbl, color]) => {
          const on = statusFilter.has(k);
          return (
            <button key={k} onClick={()=>setStatusFilter(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px 3px 8px", fontSize: 12, fontWeight: 500, borderRadius: 999,
              background: on ? "color-mix(in oklch, " + color + " 14%, white)" : "var(--paper)",
              color: on ? "var(--ink-900)" : "var(--ink-500)",
              border: `1px solid ${on ? color : "var(--ink-200)"}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} /> {lbl}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-500)" }}>
          Group by
          <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{
            padding: "2px 6px", fontSize: 12, color: "var(--ink-900)", border: "1px solid var(--ink-200)",
            borderRadius: 5, background: "var(--paper)", outline: "none",
          }}>
            <option value="subject">Subject → Unit</option>
            <option value="chrono">Chronological</option>
            <option value="standard">Standard</option>
            <option value="unit">Unit only</option>
          </select>
        </label>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px 90px" }}>
        {items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 56 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, letterSpacing: -0.3 }}>Caught up.</div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>Nothing uncovered in this scope.</div>
          </div>
        ) : Object.entries(groups).map(([groupName, gItems]) => {
          const firstSubj = SUBJECT_BY_ID[gItems[0].subject];
          return (
            <section key={groupName} style={{ marginBottom: 20 }}>
              <div className={firstSubj ? `cp-subj ${firstSubj.cls}` : ""} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 5,
                marginBottom: 6,
              }}>
                {groupBy === "subject" && firstSubj && (
                  <span style={{ width: 4, height: 16, background: "var(--c)", borderRadius: 1 }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>{groupName}</span>
                <span style={{ fontSize: 11, color: "var(--ink-400)" }}>· {gItems.length} uncovered</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--ink-150)", borderRadius: 5, overflow: "hidden" }}>
                {gItems.map(i => {
                  const subj = SUBJECT_BY_ID[i.subject];
                  const statusBg = i.status === "skipped" ? "var(--ink-100)"
                                 : i.status === "carried" ? "color-mix(in oklch, var(--catchup) 8%, white)"
                                 : i.status === "partial" ? "color-mix(in oklch, var(--important) 8%, white)"
                                 : "var(--paper)";
                  const sel = selected.has(i.id);
                  return (
                    <div key={i.id} className={`cp-subj ${subj.cls}`} style={{
                      display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 14px",
                      background: sel ? "color-mix(in oklch, var(--math) 6%, var(--paper))" : statusBg,
                      borderLeft: `4px solid var(--c)`,
                    }}>
                      <input type="checkbox" checked={sel} onChange={()=>toggleSelect(i.id)}
                        style={{ marginTop: 3, accentColor: "var(--math)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--c)" }}>{subj.name}</span>
                          <span style={{ fontSize: 10, color: "var(--ink-400)" }}>· {i.unit.replace(/^Unit \d+ · /, "")}</span>
                          <span style={{ fontSize: 10, color: "var(--ink-300)" }}>·</span>
                          <span style={{ fontSize: 10, color: "var(--ink-500)" }}>{i.day}</span>
                          <span style={{ flex: 1 }} />
                          <CPCatchupStatusPill status={i.status} />
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)", lineHeight: 1.3 }}>{i.title}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3, lineHeight: 1.45, textWrap: "pretty",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.preview}</div>
                        {/* "Why not done" — shown when the teacher already recorded one;
                            otherwise an inline "Add reason" affordance */}
                        {i.reasonNotDone ? (
                          <div style={{ marginTop: 6 }}>
                            <CPReasonNotDone reason={i.reasonNotDone} />
                          </div>
                        ) : (
                          <button style={{
                            fontSize: 11, color: "var(--catchup)", padding: "3px 8px 3px 6px",
                            border: "1px dashed color-mix(in oklch, var(--catchup) 40%, transparent)", borderRadius: 4,
                            background: "transparent", marginTop: 6,
                            display: "inline-flex", alignItems: "center", gap: 4,
                          }}>
                            <CPIcon name="edit" size={10} /> Add a note
                          </button>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                          {i.standards.map(s => (
                            <span key={s} className="cp-mono" style={{ fontSize: 10, color: "var(--ink-700)", background: "var(--ink-100)", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
                          ))}
                          {i.resources > 0 && (
                            <span style={{ fontSize: 11, color: "var(--ink-400)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <CPIcon name="link" size={11} /> {i.resources}
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          <button style={{ fontSize: 11.5, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 4 }}>Mark done</button>
                          <button style={{ fontSize: 11.5, color: "var(--ink-500)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 4 }}>Skipped</button>
                          <button style={{ fontSize: 11.5, color: "var(--catchup)", padding: "3px 8px", border: "1px solid color-mix(in oklch, var(--catchup) 40%, white)", borderRadius: 4, fontWeight: 500 }}>Carry over to…</button>
                          <button style={{ fontSize: 11.5, color: "var(--ink-500)", padding: "3px 8px" }}>Jump to lesson</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          position: "absolute", left: 22, right: 22, bottom: 18,
          background: "var(--ink-900)", color: "var(--paper)",
          padding: "10px 16px", borderRadius: 8,
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 8px 24px rgba(20,22,32,.25)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,.18)" }} />
          <button style={{ fontSize: 12.5, color: "var(--paper)", padding: "5px 10px", borderRadius: 5, background: "rgba(255,255,255,.10)" }}>Mark all done</button>
          <button style={{ fontSize: 12.5, color: "var(--paper)", padding: "5px 10px", borderRadius: 5, background: "rgba(255,255,255,.10)" }}>Mark all skipped</button>
          <button style={{ fontSize: 12.5, color: "var(--paper)", padding: "5px 10px", borderRadius: 5, background: "var(--catchup)", fontWeight: 600 }}>Carry over all to…</button>
          <button style={{ fontSize: 12.5, color: "var(--paper)", padding: "5px 10px", borderRadius: 5, background: "rgba(255,255,255,.10)" }}>Add all to to-do</button>
          <div style={{ flex: 1 }} />
          <button onClick={()=>setSelected(new Set())} style={{ fontSize: 12, color: "rgba(255,255,255,.7)", padding: "5px 8px" }}>Clear</button>
        </div>
      )}
    </div>
  );
}

function CPCatchupStatusPill({ status }) {
  const M = {
    not_done: { lbl: "Not done", color: "var(--ink-500)", bg: "var(--ink-100)" },
    partial:  { lbl: "Partial",  color: "var(--important)", bg: "var(--important-bg)" },
    skipped:  { lbl: "Skipped",  color: "var(--ink-500)", bg: "var(--ink-100)" },
    carried:  { lbl: "Carry-over", color: "var(--catchup)", bg: "var(--catchup-bg)" },
  };
  const m = M[status] || M.not_done;
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
      color: m.color, background: m.bg, padding: "1px 7px", borderRadius: 3,
    }}>{m.lbl}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2 · STANDARDS DRILL-THROUGH side panel
// Triggered by clicking a CCSS code chip on lesson detail.
// ─────────────────────────────────────────────────────────────────────
function ABStandardsDrillThrough() {
  const code = "5.NF.B.3";
  const desc = STANDARDS[code];

  const matches = [
    { id: "m-12-1", subj: "math", title: "Fractions as division — bake sale problem", week: 12, day: "Mon", status: "not_done", isPersonal: true },
    { id: "m-12-0", subj: "math", title: "Equivalent fractions warm-up",                week: 12, day: "Sun", status: "not_done", isPersonal: false },
    { id: "m-12-3", subj: "math", title: "Mid-unit check — fractions",                  week: 12, day: "Wed", status: "not_done", isPersonal: false, missed: true },
    { id: "m-11-2", subj: "math", title: "Fractions on a number line (intro)",         week: 11, day: "Mon", status: "done",     isPersonal: false },
    { id: "m-10-1", subj: "math", title: "Equivalent fractions — strips",              week: 10, day: "Tue", status: "done",     isPersonal: false },
    { id: "m-9-3",  subj: "math", title: "Comparing fractions w/ same numerator",      week: 9,  day: "Thu", status: "skipped",  isPersonal: false },
  ];
  const missed = matches.filter(m => m.missed || m.status === "skipped");

  return (
    <div className="cp-root" style={{ height: "100%", background: "rgba(20,22,32,.32)", display: "flex" }}>
      {/* Dimmed page background — Daily view stub */}
      <div style={{ flex: 1, padding: 20, color: "var(--ink-300)" }}>
        <div style={{ background: "var(--paper)", borderRadius: 6, height: "100%", padding: 24, opacity: 0.6, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--ink-500)", fontWeight: 500 }}>Lesson detail (dimmed)</div>
          <div style={{ fontSize: 12, color: "var(--ink-400)" }}>The chip <span className="cp-mono" style={{ background: "var(--ink-100)", padding: "1px 5px", borderRadius: 3 }}>{code}</span> was clicked — side panel opens →</div>
        </div>
      </div>

      {/* Side panel */}
      <div style={{
        width: 460, background: "var(--paper)", boxShadow: "-8px 0 24px rgba(20,22,32,.12)",
        borderLeft: "1px solid var(--ink-150)", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--ink-100)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "var(--ink-400)", letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>CCSS</span>
            <span className="cp-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", background: "var(--ink-100)", padding: "2px 7px", borderRadius: 3 }}>{code}</span>
            <div style={{ flex: 1 }} />
            <button style={{ color: "var(--ink-500)", padding: 4 }}><CPIcon name="x" size={14} /></button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-700)", lineHeight: 1.5, textWrap: "pretty" }}>{desc}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 14, fontSize: 11, color: "var(--ink-500)" }}>
            <span><strong style={{ color: "var(--ink-900)", fontWeight: 600 }}>{matches.length}</strong> lessons tagged</span>
            <span><strong style={{ color: "var(--ink-900)", fontWeight: 600 }}>{matches.filter(m=>m.status==="done").length}</strong> done</span>
            <span><strong style={{ color: "var(--catchup)", fontWeight: 600 }}>{missed.length}</strong> missed</span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "0 18px 18px" }}>
          {/* Missed-events task list (per planning doc) */}
          {missed.length > 0 && (
            <section style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--catchup)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                <CPIcon name="flame" size={11} /> Missed events ({missed.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {missed.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
                    background: "color-mix(in oklch, var(--catchup) 6%, var(--paper))",
                    borderLeft: "3px solid var(--catchup)", borderRadius: "0 4px 4px 0",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{l.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-400)" }}>Week {l.week} · {l.day}</div>
                    </div>
                    <button style={{ fontSize: 11, color: "var(--ink-700)", padding: "2px 7px", border: "1px solid var(--ink-200)", borderRadius: 3 }}>Carry over</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All lessons */}
          <section style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
              All lessons tagged with this standard
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--ink-150)", borderRadius: 4, overflow: "hidden" }}>
              {matches.map(l => {
                const subj = SUBJECT_BY_ID[l.subj];
                return (
                  <div key={l.id} className={`cp-subj ${subj.cls}`} style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "8px 11px",
                    background: "var(--paper)",
                  }}>
                    <span style={{ width: 3, alignSelf: "stretch", background: "var(--c)", borderRadius: 1 }} />
                    <CPCheck status={l.status} size={13} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3,
                        textDecoration: l.status === "done" ? "line-through" : "none",
                        textDecorationColor: "var(--ink-300)" }}>{l.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-400)" }}>Week {l.week} · {l.day}</div>
                    </div>
                    {l.isPersonal && <span title="Personalized copy" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ink-700)" }} />}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3 · CORE MODE entry — flashing → persistent banner sequence (§5.16)
// Three vertical panes, captioned, so the sequence is readable as a still.
// ─────────────────────────────────────────────────────────────────────
function ABCoreModeBanner() {
  const samples = [
    LESSONS.find(l => l.id === "m-12-0"),
    LESSONS.find(l => l.id === "r-12-0"),
    LESSONS.find(l => l.id === "w-12-0"),
  ];
  const Frame = ({ stage, label, children }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--ink-150)", overflow: "hidden", background: "var(--paper)" }}>
      <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--ink-400)", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600, background: "var(--ink-50)", borderBottom: "1px solid var(--ink-150)" }}>
        Frame {stage} · {label}
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  );
  const MiniGrid = () => (
    <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {samples.map(l => <CPLessonCard key={l.id} lesson={l} narrow />)}
    </div>
  );

  return (
    <div className="cp-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ink-150)", background: "var(--paper)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Core mode entry</div>
        <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }}>Flashing heads-up → small persistent banner</h2>
        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3 }}>
          Toggling to <strong>Core</strong> triggers a 3-second flashing red message, then resolves into a slim persistent banner for the whole session. No confirm dialog — but the state is unmissable. <code>prefers-reduced-motion</code> drops the flash to a solid red.
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Frame stage={1} label="Frame just before toggle">
          {/* Personalized chrome */}
          <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--ink-100)", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Week 12 · Nov 9</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-100)", borderRadius: 999 }}>
              <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 500, background: "var(--paper)", borderRadius: 999, boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>Personalized</span>
              <span style={{ padding: "3px 10px", fontSize: 11, color: "var(--ink-500)" }}>Core</span>
            </div>
          </div>
          <MiniGrid />
        </Frame>

        <Frame stage={2} label="0–3s · flashing heads-up">
          <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--ink-100)", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Week 12 · Nov 9</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", padding: 2, background: "var(--core-mode)", borderRadius: 999 }}>
              <span style={{ padding: "3px 10px", fontSize: 11, color: "rgba(255,255,255,.7)" }}>Personalized</span>
              <span style={{ padding: "3px 12px", fontSize: 11, fontWeight: 600, background: "var(--paper)", color: "var(--urgent)", borderRadius: 999 }}>Core</span>
            </div>
          </div>
          {/* Big flashing banner */}
          <div className="cp-pulse" style={{
            background: "var(--core-mode)", color: "var(--paper)",
            padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10,
            animation: "cp-flash 0.6s ease-in-out 5 alternate",
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>!</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}>Heads up — changes here affect the whole team.</div>
              <div style={{ fontSize: 11.5, opacity: 0.92, marginTop: 1 }}>You're in Core Curriculum mode. Every edit syncs to all Grade 5 teachers.</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, letterSpacing: 0.5, textTransform: "uppercase" }}>Resolving in 3s…</span>
          </div>
          <MiniGrid />
        </Frame>

        <Frame stage={3} label="3s+ · persistent slim banner">
          <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--ink-100)", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Week 12 · Nov 9</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-100)", borderRadius: 999, border: "1px solid var(--core-mode)" }}>
            <span style={{ padding: "3px 10px", fontSize: 11, color: "var(--ink-500)" }}>Personalized</span>
              <span style={{ padding: "3px 12px", fontSize: 11, fontWeight: 600, background: "var(--core-mode)", color: "var(--paper)", borderRadius: 999 }}>Core</span>
            </div>
          </div>
          {/* Slim persistent banner */}
          <div style={{
            background: "var(--core-mode)", color: "var(--paper)",
            padding: "5px 14px",
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 11.5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--paper)" }} />
            <span style={{ fontWeight: 500 }}>Core Curriculum mode</span>
            <span style={{ opacity: 0.85 }}>· edits sync to all 5 teachers</span>
            <div style={{ flex: 1 }} />
            <button style={{ color: "var(--paper)", fontSize: 11, fontWeight: 500, opacity: 0.9, textDecoration: "underline" }}>Switch back to Personalized</button>
          </div>
          <MiniGrid />
        </Frame>
      </div>

      <style>{`
        @keyframes cp-flash { 0% { opacity: 1; } 100% { opacity: 0.55; } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4 · KEYBOARD CHEAT SHEET MODAL
// ─────────────────────────────────────────────────────────────────────
function ABKeyboardCheatSheet() {
  const groups = [
    { name: "Navigation", items: [
      ["j / k",   "Move focus down / up to next lesson card"],
      ["h / l",   "Move focus left / right (between days)"],
      ["g c",     "Open Catch-up screen (vim-style two-key)"],
      ["⌘ / Ctrl + ↑/↓", "Jump to next/prev week"],
      ["Esc",     "Close detail panel, collapse expanded card, close modal"],
    ]},
    { name: "Editing", items: [
      ["e",       "Expand / collapse the focused card"],
      ["Space",   "Toggle completion on the focused card"],
      ["⌘D / Ctrl+D", "Duplicate the focused lesson"],
      ["⌘K / Ctrl+K", "Open 'Move to' submenu for the focused card"],
      ["Delete",  "Delete (Core mode only — requires confirm)"],
      ["⌘Z / Ctrl+Z", "Undo last edit (5-deep stack)"],
    ]},
    { name: "Search & filter", items: [
      ["/",       "Focus the global search input"],
      ["⌘F / Ctrl+F", "In-page lesson title filter"],
      ["S",       "Toggle subject filter rail"],
      ["U",       "Toggle unit filter"],
    ]},
    { name: "Help", items: [
      ["?",       "Open this cheat sheet"],
      ["⌘. / Ctrl+.", "Open command palette"],
    ]},
  ];
  const Kbd = ({ children }) => (
    <span style={{
      display: "inline-block", padding: "1px 7px", fontSize: 11.5,
      background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderBottom: "2px solid var(--ink-200)",
      borderRadius: 4, fontFamily: "var(--font-mono)", color: "var(--ink-900)", fontWeight: 500,
    }}>{children}</span>
  );

  return (
    <div className="cp-root" style={{ height: "100%", background: "rgba(20,22,32,.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <div style={{
        width: 720, maxHeight: "100%", background: "var(--paper)", borderRadius: 10,
        boxShadow: "0 24px 64px rgba(20,22,32,.18), 0 2px 6px rgba(20,22,32,.08)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }}>Keyboard shortcuts</h2>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>Press <Kbd>?</Kbd> from anywhere to open this list.</div>
          </div>
          <Kbd>Esc</Kbd>
          <button style={{ color: "var(--ink-500)", padding: 4, marginLeft: 4 }}><CPIcon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 20, overflow: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 28px" }}>
          {groups.map(g => (
            <section key={g.name}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{g.name}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {g.items.map(([k, lbl], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--ink-100)" }}>
                    <div style={{ width: 130, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {k.split(" / ").map((part, j) => <Kbd key={j}>{part}</Kbd>)}
                    </div>
                    <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-700)" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5 · VIVID THEME direction-setting weekly grid (Phase 2 preview, 1 artboard)
// Subject-tinted card backgrounds; full-saturation stripe; subject-tint
// unit rows; warmer canvas. Reference: Padlet color recognition.
// ─────────────────────────────────────────────────────────────────────
function ABVividWeekly() {
  const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
  const dates = [9,10,11,12,13];

  const bySubjDay = {};
  for (const s of SUBJECTS) bySubjDay[s.id] = [[],[],[],[],[]];
  for (const l of LESSONS) bySubjDay[l.subject][l.day].push(l);

  const VividCard = ({ lesson }) => {
    const subj = SUBJECT_BY_ID[lesson.subject];
    const dashed = !!lesson.modified;
    return (
      <div className={`cp-subj ${subj.cls}`} style={{
        position: "relative", overflow: "hidden",
        background: "var(--cl)",
        border: "1px solid color-mix(in oklch, var(--c) 25%, transparent)",
        borderRadius: 6,
      }}>
        {dashed ? (
          <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4,
            backgroundImage: "repeating-linear-gradient(to bottom, var(--c) 0 4px, transparent 4px 8px)" }} />
        ) : (
          <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4, background: "var(--c)" }} />
        )}
        <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 4 }}>
          {lesson.moved && (
            <span title="Moved" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 16, height: 16, borderRadius: 3,
              background: "var(--c)", color: "var(--paper)", fontSize: 10, fontWeight: 600,
            }}>{lesson.moved === "across-weeks" ? "⤴" : "↔"}</span>
          )}
          {lesson.modified && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
              padding: "1px 6px", borderRadius: 999,
              background: "var(--cd)", color: "var(--paper)",
            }}>Modified</span>
          )}
        </div>
        <div style={{ padding: "8px 9px 4px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700,
            letterSpacing: 0.5, textTransform: "uppercase", color: "var(--cd)" }}>
            {subj.name}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.25, marginTop: 2, paddingRight: lesson.modified ? 70 : 6 }}>
            {lesson.title}
          </div>
        </div>
        <div style={{ padding: "0 9px 7px 12px", fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lesson.preview}</div>
        <div style={{ padding: "0 9px 7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <CPCheck status={lesson.status} size={12} />
          {lesson.standards.length > 0 && (
            <span className="cp-mono" style={{ fontSize: 9.5, color: "var(--cd)", background: "color-mix(in oklch, var(--c) 18%, transparent)", padding: "1px 5px", borderRadius: 2, fontWeight: 600 }}>CCSS·{lesson.standards.length}</span>
          )}
          {lesson.resources.slice(0, 3).map((r, i) => (
            <span key={i} style={{ color: "var(--cd)", opacity: 0.8, display: "inline-flex" }}>
              <CPIcon name={CP_RES_ICON[r.type] || "link"} size={11} />
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="cp-root" style={{
      height: "100%", display: "flex", flexDirection: "column",
      // Warmer canvas like the Padlet feel
      background: "linear-gradient(180deg, #fdfaf3 0%, #fbf3e6 100%)",
    }}>
      <CPTopBar view="weekly" />

      {/* Identifying banner */}
      <div style={{
        padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
        background: "linear-gradient(90deg, color-mix(in oklch, var(--math) 18%, transparent), color-mix(in oklch, var(--writing) 18%, transparent))",
        borderBottom: "1px solid color-mix(in oklch, var(--math) 30%, transparent)",
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          padding: "2px 7px", background: "var(--ink-900)", color: "var(--paper)", borderRadius: 3,
        }}>Vivid — Phase 2 direction prototype</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-700)" }}>
          Phase 1 production stays Quiet. Subject tint as card background; full-saturation stripe; warmer canvas.
        </span>
      </div>

      {/* Day header */}
      <div style={{ display: "grid", gridTemplateColumns: "112px repeat(5, 1fr)", borderBottom: "1px solid var(--ink-150)", background: "color-mix(in oklch, var(--paper) 90%, transparent)" }}>
        <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 500, color: "var(--ink-400)", letterSpacing: 0.6, textTransform: "uppercase" }}>Subject</div>
        {DAYS.map((d, i) => (
          <div key={d} style={{ padding: "9px 12px", borderLeft: "1px solid var(--ink-150)", display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: i === 1 ? "var(--math)" : "var(--ink-500)" }}>{d}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>{dates[i]}</span>
            {i === 1 && <span style={{ fontSize: 10, color: "var(--math)", fontWeight: 700 }}>TODAY</span>}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {SUBJECTS.map(subj => (
          <div key={subj.id} className={`cp-subj ${subj.cls}`} style={{
            display: "grid", gridTemplateColumns: "112px repeat(5, 1fr)",
            // Subject-tinted row background — the Padlet move
            background: "color-mix(in oklch, var(--cl) 55%, transparent)",
            borderBottom: "1px solid color-mix(in oklch, var(--c) 12%, transparent)",
          }}>
            <div style={{ padding: "10px 12px", display: "flex", gap: 7,
              borderRight: "1px solid color-mix(in oklch, var(--c) 18%, transparent)",
              background: "color-mix(in oklch, var(--c) 12%, var(--paper))" }}>
              <div style={{ width: 4, height: 18, background: "var(--c)", marginTop: 1, borderRadius: 1 }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cd)" }}>{subj.name}</div>
                <div style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 1 }}>{UNITS[subj.id].weeks}</div>
              </div>
            </div>
            {[0,1,2,3,4].map(day => (
              <div key={day} style={{
                minHeight: 44, padding: 6, borderLeft: "1px solid color-mix(in oklch, var(--c) 14%, transparent)",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {bySubjDay[subj.id][day].map(l => <VividCard key={l.id} lesson={l} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  ABCatchupScreen, ABStandardsDrillThrough, ABCoreModeBanner, ABKeyboardCheatSheet, ABVividWeekly,
  CATCHUP_ITEMS,
});
