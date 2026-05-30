// artboards-extras.jsx — 11 · Catch-up filter flow · 12 · Print preview

// ─────────────────────────────────────────────────────────────────────
// 11 · CATCH-UP FILTER BADGE + ACTIVATION FLOW
// Three artboards stacked vertically inside one panel: off → activating → on
// ─────────────────────────────────────────────────────────────────────
function ABCatchupFlow() {
  const [stage, setStage] = React.useState(2); // 0 off, 1 menu, 2 on
  return (
    <div className="cp-root" style={{ height: "100%", background: "var(--ink-50)", display: "flex", flexDirection: "column" }}>
      <CPTopBar view="weekly" />

      {/* Catch-up badge row */}
      <div style={{
        padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid var(--ink-100)", background: "var(--paper)",
      }}>
        <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Week 12 · Nov 9 – Nov 13</div>
        <div style={{ flex: 1 }} />

        {/* Stage selector for the demo */}
        <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-100)", borderRadius: 5, gap: 1 }}>
          {["Off","Menu","On"].map((s, i) => (
            <button key={i} onClick={()=>setStage(i)} style={{
              padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4,
              background: stage === i ? "var(--paper)" : "transparent",
              color: stage === i ? "var(--ink-900)" : "var(--ink-500)",
              boxShadow: stage === i ? "0 1px 2px rgba(20,22,32,.08)" : "none",
            }}>{s}</button>
          ))}
        </div>

        {/* The badge itself, in its three states */}
        <div style={{ position: "relative" }}>
          {stage === 0 && (
            <button onClick={()=>setStage(1)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 11px 5px 9px", border: "1px solid var(--ink-200)", borderRadius: 999,
              background: "var(--paper)", fontSize: 12, color: "var(--ink-700)", fontWeight: 500,
            }}>
              <CPIcon name="filter" size={11} /> Filter
              <span style={{ fontSize: 10, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>·</span>
              <span style={{ fontSize: 10, color: "var(--ink-400)" }}>None</span>
            </button>
          )}
          {stage === 1 && (
            <>
              <button style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 11px 5px 9px", border: "1px solid var(--ink-300)", borderRadius: 999,
                background: "var(--ink-50)", fontSize: 12, color: "var(--ink-900)", fontWeight: 500,
              }}>
                <CPIcon name="filter" size={11} /> Filter
              </button>
              {/* Popover */}
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, width: 280, zIndex: 10,
                background: "var(--paper)", border: "1px solid var(--ink-200)", borderRadius: 7,
                boxShadow: "0 8px 24px rgba(20,22,32,.10)", padding: "8px 0",
              }}>
                <div style={{ padding: "4px 14px 6px", fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Quick filters</div>
                {[
                  { id: "catchup", label: "Catch-up", desc: "Missed or skipped lessons", icon: "flag", color: "var(--catchup)", count: 7, highlight: true },
                  { id: "pending", label: "Pending Core edits", desc: "Lessons with unmerged changes", icon: "warning", color: "var(--important)", count: 3 },
                  { id: "personal", label: "Personal only", desc: "Hide Core-plan lessons", icon: "user", color: "var(--math)", count: 12 },
                  { id: "tagged",  label: "Tagged…", desc: "Filter by tag", icon: "tag", color: "var(--ink-500)" },
                ].map((opt, i) => (
                  <button key={i} onClick={()=> opt.id === "catchup" && setStage(2)} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
                    padding: "8px 14px", textAlign: "left",
                    background: opt.highlight ? "color-mix(in oklch, var(--catchup) 5%, transparent)" : "transparent",
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 4, marginTop: 1,
                      background: opt.color, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: "var(--paper)",
                    }}>
                      <CPIcon name={opt.icon} size={12} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-900)" }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 1 }}>{opt.desc}</div>
                    </div>
                    {opt.count != null && (
                      <span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", color: "var(--ink-500)", padding: "1px 6px", background: "var(--ink-100)", borderRadius: 999, fontWeight: 600, marginTop: 3 }}>{opt.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {stage === 2 && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 6px 5px 9px", border: "1px solid var(--catchup)", borderRadius: 999,
              background: "color-mix(in oklch, var(--catchup) 10%, var(--paper))",
              fontSize: 12, color: "var(--catchup)", fontWeight: 600,
            }}>
              <CPIcon name="flag" size={11} /> Catch-up
              <span style={{ fontSize: 10, padding: "1px 6px", background: "var(--catchup)", color: "var(--paper)", borderRadius: 999, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>7</span>
              <button onClick={()=>setStage(0)} style={{ padding: 2, color: "var(--catchup)", marginLeft: 2 }}><CPIcon name="x" size={11} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Banner while active */}
      {stage === 2 && (
        <div style={{
          padding: "8px 18px", background: "color-mix(in oklch, var(--catchup) 8%, var(--paper))",
          borderBottom: "1px solid color-mix(in oklch, var(--catchup) 25%, transparent)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--ink-700)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--catchup)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <CPIcon name="flag" size={11} /> Catch-up
          </span>
          Showing 7 missed or skipped lessons from weeks 10–12. Drag any onto a day to reschedule.
          <div style={{ flex: 1 }} />
          <button style={{ fontSize: 11, color: "var(--catchup)", fontWeight: 500, textDecoration: "underline" }}>Mark all as done</button>
        </div>
      )}

      {/* Grid mock — dims non-catchup lessons when filter on */}
      <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px repeat(5, 1fr)", gap: 4 }}>
          <div />
          {["Sun","Mon","Tue","Wed","Thu"].map(d => (
            <div key={d} style={{ fontSize: 11, color: "var(--ink-500)", padding: "0 4px 4px", fontWeight: 500 }}>{d}</div>
          ))}
          {SUBJECTS.slice(0,5).map(s => (
            <React.Fragment key={s.id}>
              <div style={{
                fontSize: 10, color: "var(--ink-400)", padding: "6px 4px",
                writingMode: "horizontal-tb", borderRight: "1px solid var(--ink-100)",
                textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500,
              }}>{s.name}</div>
              {["Sun","Mon","Tue","Wed","Thu"].map((d, di) => {
                // Mock catch-up: some cells flagged
                const isCatchup = (s.id === "math" && di === 0) ||
                                  (s.id === "reading" && di === 1) ||
                                  (s.id === "writing" && di === 0) ||
                                  (s.id === "science" && di === 2);
                const dim = stage === 2 && !isCatchup;
                const empty = (s.id === "math" && di === 3) || (s.id === "reading" && di === 4);
                if (empty) return <div key={d} style={{ background: "var(--ink-50)", borderRadius: 4, height: 64 }} />;
                return (
                  <div key={d} className={`cp-subj cp-${s.id}`} style={{
                    position: "relative",
                    background: "var(--paper)",
                    border: isCatchup && stage === 2 ? "1.5px solid var(--catchup)" : "1px solid var(--ink-150)",
                    borderLeft: `3px solid var(--c)`,
                    borderRadius: 4, padding: "6px 8px",
                    opacity: dim ? 0.32 : 1,
                    filter: dim ? "saturate(0.4)" : "none",
                    height: 64, overflow: "hidden",
                  }}>
                    <div style={{ fontSize: 9, color: "var(--c)", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase" }}>{s.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.25, marginTop: 2, textWrap: "pretty" }}>
                      {isCatchup ? "Missed: " : ""}
                      {["Coordinate plane","Main idea","Counterargument","Erosion lab","Trade routes"][di]}
                    </div>
                    {isCatchup && (
                      <div style={{
                        position: "absolute", top: 4, right: 4,
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "1px 5px 1px 4px",
                        background: "var(--catchup)", color: "var(--paper)",
                        fontSize: 9, fontWeight: 700, borderRadius: 2, letterSpacing: 0.3,
                      }}>
                        <CPIcon name="flag" size={8} /> W{10 + di}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 12 · PRINT PREVIEW — letter-size weekly plan
// ─────────────────────────────────────────────────────────────────────
function ABPrintPreview() {
  const [orientation, setOrientation] = React.useState("landscape");
  const [includeNotes, setIncludeNotes] = React.useState(true);
  const [includeStandards, setIncludeStandards] = React.useState(false);
  const [includeBlank, setIncludeBlank] = React.useState(true);

  const DAYS = ["Sun 9","Mon 10","Tue 11","Wed 12","Thu 13"];
  const subjects = SUBJECTS.slice(0, 7);

  return (
    <div className="cp-root" style={{ height: "100%", background: "var(--ink-200)", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "var(--paper)", borderRight: "1px solid var(--ink-200)", padding: 16, display: "flex", flexDirection: "column", gap: 16, fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginBottom: 4 }}>Print</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Weekly plan</div>
          <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>Week 12 · Nov 9–13</div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginBottom: 6 }}>Paper</div>
          <div style={{ fontSize: 12, color: "var(--ink-700)", padding: "5px 9px", background: "var(--ink-50)", borderRadius: 4 }}>US Letter · 8.5 × 11"</div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginBottom: 6 }}>Orientation</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["landscape","portrait"].map(o => (
              <button key={o} onClick={()=>setOrientation(o)} style={{
                flex: 1, padding: "5px 8px", fontSize: 11, fontWeight: 500,
                background: orientation === o ? "var(--ink-900)" : "var(--paper)",
                color: orientation === o ? "var(--paper)" : "var(--ink-700)",
                border: `1px solid ${orientation === o ? "var(--ink-900)" : "var(--ink-200)"}`,
                borderRadius: 4, textTransform: "capitalize",
              }}>{o}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginBottom: 6 }}>Include</div>
          {[
            { label: "Notes", val: includeNotes, set: setIncludeNotes },
            { label: "CCSS standards", val: includeStandards, set: setIncludeStandards },
            { label: "Blank rows", val: includeBlank, set: setIncludeBlank },
          ].map((o, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", fontSize: 12, color: "var(--ink-700)" }}>
              <input type="checkbox" checked={o.val} onChange={e=>o.set(e.target.checked)} style={{ accentColor: "var(--math)" }} />
              {o.label}
            </label>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1.5, padding: "8px 10px", background: "var(--ink-50)", borderRadius: 4 }}>
          1 page · Black & white friendly · Subject colors print as a left edge stripe.
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button style={{ flex: 1, padding: "8px", background: "var(--math)", color: "white", borderRadius: 5, fontSize: 13, fontWeight: 600 }}>Print</button>
          <button style={{ padding: "8px 12px", border: "1px solid var(--ink-200)", borderRadius: 5, fontSize: 12 }}>PDF</button>
        </div>
      </aside>

      {/* Preview */}
      <div style={{ flex: 1, overflow: "auto", padding: 32, display: "flex", justifyContent: "center", alignItems: "flex-start", background: "var(--ink-200)" }}>
        <div style={{
          width: orientation === "landscape" ? 1056 : 816,
          height: orientation === "landscape" ? 816 : 1056,
          transform: "scale(0.62)", transformOrigin: "top center",
          background: "white", boxShadow: "0 6px 24px rgba(20,22,32,.18)",
          padding: orientation === "landscape" ? "36px 44px" : "44px 36px",
          display: "flex", flexDirection: "column",
          fontFamily: "var(--body)",
        }}>
          {/* Print header */}
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14, borderBottom: "2px solid #1a1d24" }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: 1, color: "#666", textTransform: "uppercase" }}>Grade 5 · Ms. Avery Tan</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1a1d24", marginTop: 2 }}>Week 12 — Nov 9 to 13, 2026</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: "#666", textAlign: "right", lineHeight: 1.6 }}>
              <div>Pinewood Elementary · Room 214</div>
              <div>Printed Mon Nov 10 · v3</div>
            </div>
          </div>

          {/* Grid */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 9.5, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: 78, textAlign: "left", padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#666", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid #1a1d24" }}>Subject</th>
                {DAYS.map(d => (
                  <th key={d} style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#1a1d24", borderBottom: "1px solid #1a1d24" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map(s => (
                <tr key={s.id}>
                  <td style={{
                    padding: "8px 8px",
                    borderBottom: "1px solid #e3e4e8",
                    fontSize: 10, fontWeight: 600, color: "#1a1d24",
                    verticalAlign: "top",
                  }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className={`cp-subj cp-${s.id}`} style={{ width: 4, height: 16, background: "var(--c)", borderRadius: 0.5, display: "inline-block" }} />
                      {s.name}
                    </div>
                  </td>
                  {DAYS.map((d, di) => {
                    const title = mockPrintTitle(s.id, di);
                    return (
                      <td key={d} className={`cp-subj cp-${s.id}`} style={{
                        verticalAlign: "top", padding: "8px 8px 8px 10px",
                        borderBottom: "1px solid #e3e4e8",
                        borderLeft: title ? "3px solid var(--c)" : "3px solid #e3e4e8",
                        height: orientation === "landscape" ? 78 : 64,
                      }}>
                        {title ? (
                          <>
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#1a1d24", lineHeight: 1.3, textWrap: "pretty" }}>{title}</div>
                            {includeStandards && mockStandards(s.id, di) && (
                              <div style={{ fontSize: 8, color: "#666", marginTop: 3, fontFamily: "var(--mono)" }}>{mockStandards(s.id, di)}</div>
                            )}
                            {includeNotes && mockNote(s.id, di) && (
                              <div style={{ fontSize: 9, color: "#444", marginTop: 4, fontStyle: "italic", lineHeight: 1.35 }}>{mockNote(s.id, di)}</div>
                            )}
                          </>
                        ) : (
                          includeBlank && <div style={{ fontSize: 9, color: "#bbb" }}>—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid #e3e4e8", paddingTop: 8, fontSize: 9, color: "#888" }}>
            <span>Legend</span>
            <span style={{ marginLeft: 12, display: "inline-flex", alignItems: "center", gap: 12 }}>
              {subjects.slice(0,5).map(s => (
                <span key={s.id} className={`cp-subj cp-${s.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: "var(--c)", borderRadius: 0.5, display: "inline-block" }} />
                  {s.name}
                </span>
              ))}
            </span>
            <div style={{ flex: 1 }} />
            <span>Page 1 of 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function mockPrintTitle(sid, di) {
  const grid = {
    math:    ["Patterns Day 2","Distance on grid","Patterns Day 1","Mid-check","Review"],
    reading: ["Main idea — paragraphs","Comparing articles","Author's purpose","Indep. reading","Unit 3 assessment"],
    writing: ["Counterargument model","Drafting body","Peer revision","Conferences","Quick-write"],
    science: ["Water-cycle stations","Erosion lab D1","Erosion lab D2","",""],
    social:  ["Trade routes","Triangular trade","","Colonial gallery",""],
    art:     ["","","","Complementary color",""],
    pe:      ["Pickleball","","Badminton","",""],
  };
  return grid[sid]?.[di] || "";
}
function mockStandards(sid, di) {
  const grid = {
    math:    ["5.OA.B.3","5.G.A.2","5.OA.B.3","","5.G.A.1"],
    reading: ["RI.5.2","RI.5.9","RI.5.8","","RI.5.2"],
    writing: ["W.5.1.B","W.5.1","W.5.5","W.5.5","W.5.1.B"],
    science: ["5-PS1-1","5-ESS2-1","5-ESS2-1","",""],
    social:  ["","","","",""],
  };
  return grid[sid]?.[di] || "";
}
function mockNote(sid, di) {
  const notes = {
    "math|1": "Pull small group: Jordan, Maya, Devon",
    "reading|4": "Bring scratch paper — no devices",
    "writing|3": "20-min conferences, sign-up sheet",
    "science|1": "Set up tubs before recess",
    "social|3": "Gallery prep — name tags ready",
  };
  return notes[`${sid}|${di}`] || "";
}

Object.assign(window, { ABCatchupFlow, ABPrintPreview });
