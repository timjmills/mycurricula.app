// artboards-views.jsx — 8·Subject view, 9·Unit summary card, 10·Schedule view

// ─────────────────────────────────────────────────────────────────────
// 8 · SUBJECT VIEW — filtered list across the year
// ─────────────────────────────────────────────────────────────────────
function ABSubjectView() {
  const [subjectId, setSubjectId] = React.useState("math");
  const [subjectExpansion, setSubjectExpansion] = React.useState({});
  const [openUnits, setOpenUnits] = React.useState({});
  const subj = SUBJECT_BY_ID[subjectId];
  const unit = UNITS[subjectId];

  // Build a fake year-long list: 8 units × ~6 lessons each, with status spread
  const allLessons = React.useMemo(() => {
    const out = [];
    const titles = {
      math: [
        ["Unit 1 · Place Value to Millions", ["Reading large numbers", "Place-value chart", "Comparing numbers", "Rounding to nearest 1,000", "Standard & expanded form", "Unit 1 check-in"]],
        ["Unit 2 · Multi-digit Multiplication", ["Area-model intro", "Partial products", "Standard algorithm — Day 1", "Standard algorithm — Day 2", "Word problems with multiplication", "Multiplication review"]],
        ["Unit 3 · Decimals — Place Value", ["Decimal place value to thousandths", "Compare & order decimals", "Round decimals", "Add decimals", "Subtract decimals", "Multiplying decimals × powers of 10"]],
        ["Unit 4 · Fraction Equivalence", ["Equivalent fractions on a number line", "Comparing fractions w/ benchmarks", "Adding fractions, like denominators", "Adding fractions, unlike denominators", "Subtracting mixed numbers", "Word problems with fractions"]],
        ["Unit 5 · Volume", ["Cubic units", "Find volume by counting", "V = l × w × h", "Volume of composite figures", "Volume word problems", "Volume project"]],
        ["Unit 6 · Coordinate Plane (current)", ["Plot points in Quadrant I", "Two-coordinate problems", "Distance on a coordinate grid", "Patterns & rules — Day 1", "Patterns & rules — Day 2", "Coordinate plane review"]],
        ["Unit 7 · Geometry — 2D Figures", ["Classify triangles", "Classify quadrilaterals", "Hierarchy of shapes", "Properties of shapes — Day 1", "Properties of shapes — Day 2", "Geometry review"]],
        ["Unit 8 · End-of-Year Review", ["Number sense review", "Operations review", "Fractions review", "Geometry review", "State assessment prep", "Year-end celebration"]],
      ],
      reading: [
        ["Unit 1 · Launching Reader's Workshop", ["Building stamina", "Choosing just-right books", "Reading log routines", "Stop-and-jot strategies", "Partner reading norms", "Unit 1 reflection"]],
        ["Unit 2 · Character Study", ["Character traits vs. feelings", "Tracking character change", "Internal vs. external conflict", "Character relationships", "Theme through character", "Character essay"]],
        ["Unit 3 · Nonfiction — Main Idea (current)", ["Identifying main idea", "Distinguishing main idea & details", "Main idea across paragraphs", "Summarizing nonfiction", "Comparing two articles", "Unit 3 assessment"]],
        ["Unit 4 · Historical Fiction", [], 4],
        ["Unit 5 · Poetry", [], 5],
        ["Unit 6 · Research Clubs", [], 5],
        ["Unit 7 · Test Prep & Strategy", [], 4],
        ["Unit 8 · Independent Reading Projects", [], 4],
      ],
      writing: [["Unit 1 · Personal Narrative", [], 6], ["Unit 2 · Informational Writing", [], 6], ["Unit 3 · Persuasive Essay (current)", [], 6], ["Unit 4 · Literary Essay", [], 5], ["Unit 5 · Poetry Writing", [], 4], ["Unit 6 · Memoir", [], 5], ["Unit 7 · Test Prep", [], 4], ["Unit 8 · Free Choice Publishing", [], 4]],
      science: [["Unit 1 · Matter", [], 6], ["Unit 2 · Energy in Ecosystems", [], 6], ["Unit 3 · Earth's Systems (current)", [], 5], ["Unit 4 · Space — Sun, Earth, Moon", [], 5], ["Unit 5 · Engineering Design", [], 4]],
      social: [["Unit 1 · Geography of N. America", [], 5], ["Unit 2 · Early Peoples", [], 5], ["Unit 3 · Colonial America (current)", [], 6], ["Unit 4 · American Revolution", [], 6], ["Unit 5 · A New Nation", [], 5], ["Unit 6 · Westward Expansion", [], 5]],
      art: [["Term 1 · Line & Shape", [], 6], ["Term 2 · Color Theory (current)", [], 6], ["Term 3 · Sculpture", [], 6]],
      pe: [["Q1 · Movement Skills", [], 8], ["Q2 · Net & Wall Games (current)", [], 8], ["Q3 · Cooperative Games", [], 8], ["Q4 · Athletics", [], 8]],
      music: [["Term 1 · Rhythm Foundations", [], 6], ["Term 2 · Pitch & Melody (current)", [], 6], ["Term 3 · Ensemble", [], 6]],
    };
    const data = titles[subjectId] || titles.math;
    let weekCounter = 1;
    data.forEach((unitData, ui) => {
      const [unitName, lessons, fillerCount] = unitData;
      const lessonList = lessons.length ? lessons : Array.from({length: fillerCount || 5}).map((_,i) => `Lesson ${i+1}`);
      lessonList.forEach((title, li) => {
        // Status logic: most weeks before current are done, current week mixed, future not_done
        let status;
        if (weekCounter < 12) status = Math.random() > 0.08 ? "done" : "skipped";
        else if (weekCounter === 12) status = li < 2 ? "done" : li === 2 ? "partial" : "not_done";
        else status = "not_done";
        out.push({
          id: `${subjectId}-u${ui+1}-l${li+1}`,
          unit: unitName,
          unitIdx: ui+1,
          title,
          week: weekCounter,
          status,
          isCurrent: weekCounter === 12,
          isPersonal: Math.random() > 0.85,
          // kind: "core" = team-wide Core lesson; "personal-full" = teacher-added
          //   standalone Personalized lesson event for this subject; sub-events
          //   live on `subEvents` and render nested under their parent Core lesson.
          kind: "core",
          subEvents: [],
          standards: subjectId === "math" ? [`5.${["NBT","OA","NF","MD","G"][ui % 5]}.${(li%5)+1}`] : [],
        });
        if ((li+1) % 2 === 0 || li === lessonList.length - 1) weekCounter += 0.5;
      });
      weekCounter = Math.ceil(weekCounter);
    });

    // ── Sprinkle Personalized events on top of the Core curriculum.
    // Mix both kinds: nested sub-lessons (lesson tasks) attached to a Core
    // lesson, and standalone full Personalized lessons that sit in the same
    // week as their own row.
    if (subjectId === "math") {
      // Two sub-events on the current unit's anchor lesson
      const parent = out.find(l => l.id === "math-u6-l3");
      if (parent) parent.subEvents.push(
        { id: "math-u6-l3-s1", title: "Pull-aside: bar-model warm-up for Aya, Tariq, Lara", status: "not_done" },
        { id: "math-u6-l3-s2", title: "Optional extension — coordinate-grid scavenger hunt", status: "not_done" },
      );
      const earlier = out.find(l => l.id === "math-u4-l4");
      if (earlier) earlier.subEvents.push(
        { id: "math-u4-l4-s1", title: "Re-teach equivalent fractions (small group)", status: "done" },
      );
      // A standalone full Personalized lesson event in the current week
      const idx = out.findIndex(l => l.id === "math-u6-l3");
      if (idx >= 0) out.splice(idx + 1, 0, {
        id: "math-personal-1", unit: "Unit 6 · Coordinate Plane (current)", unitIdx: 6,
        title: "Vocabulary game — coordinate plane terms",
        week: 12, status: "not_done", isCurrent: true, isPersonal: true,
        kind: "personal-full",
        subEvents: [],
        standards: ["5.G.A.1"],
      });
    }
    if (subjectId === "reading") {
      const p = out.find(l => l.id === "reading-u3-l2");
      if (p) p.subEvents.push(
        { id: "reading-u3-l2-s1", title: "Small-group fluency pull (3 students · cold-read passage)", status: "not_done" },
      );
      const idx = out.findIndex(l => l.id === "reading-u3-l4");
      if (idx >= 0) out.splice(idx, 0, {
        id: "reading-personal-1", unit: "Unit 3 · Nonfiction — Main Idea (current)", unitIdx: 3,
        title: "Author study — Patricia Polacco (week-long mini)",
        week: 11, status: "done", isCurrent: false, isPersonal: true,
        kind: "personal-full",
        subEvents: [
          { id: "reading-personal-1-s1", title: "Day 1 — biography read-aloud", status: "done" },
          { id: "reading-personal-1-s2", title: "Day 2 — story map", status: "done" },
        ],
        standards: ["RL.5.6"],
      });
    }

    return out;
  }, [subjectId]);

  const totalCount = allLessons.length;
  const doneCount = allLessons.filter(l => l.status === "done").length;
  const currentUnit = allLessons.find(l => l.isCurrent)?.unitIdx;
  const personalCount = allLessons.filter(l => l.kind === "personal-full").length
                      + allLessons.reduce((a,l) => a + (l.subEvents?.length || 0), 0);

  // Group by unit
  const byUnit = {};
  allLessons.forEach(l => { (byUnit[l.unit] = byUnit[l.unit] || []).push(l); });

  return (
    <div className={`cp-root cp-subj ${subj.cls}`} style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <CPTopBar view="subject" />

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 0 }}>
        {/* Subject switcher */}
        <div style={{ borderRight: "1px solid var(--ink-150)", background: "var(--ink-50)", padding: "14px 10px", overflow: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, padding: "0 6px 6px" }}>Subjects</div>
          {SUBJECTS.map(s => (
            <button key={s.id} onClick={()=>setSubjectId(s.id)}
              className={`cp-subj ${s.cls}`}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "7px 8px", borderRadius: 4, textAlign: "left", marginBottom: 1,
                background: subjectId === s.id ? "var(--paper)" : "transparent",
                border: subjectId === s.id ? "1px solid var(--ink-200)" : "1px solid transparent",
              }}>
              <span style={{ width: 4, height: 18, background: "var(--c)", borderRadius: 1 }} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--ink-900)", fontWeight: subjectId === s.id ? 600 : 500 }}>{s.name}</span>
              <span style={{ fontSize: 10, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>{s.id === subjectId ? `${doneCount}/${totalCount}` : ""}</span>
            </button>
          ))}
        </div>

        {/* Main */}
        <div style={{ overflow: "auto" }}>
          {/* Subject header */}
          <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--ink-100)", background: "var(--paper)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--c)", fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: "var(--c)", borderRadius: 1 }} /> Subject
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, marginTop: 2 }}>{subj.name}</h1>
                <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 2 }}>5 periods/week · {totalCount} planned lessons</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 14 }}>
                <CPStat label="Done" value={doneCount} color="var(--c)" />
                <CPStat label="Current unit" value={`U${currentUnit || 1}`} color="var(--ink-900)" />
                <CPStat label="Personalized" value={personalCount} color="var(--ink-700)" />
              </div>
            </div>
            {/* Progress bar split by unit */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 999, overflow: "hidden", background: "var(--ink-100)" }}>
                {Object.values(byUnit).map((unitLessons, i) => {
                  const u = i + 1;
                  const total = unitLessons.length;
                  const done = unitLessons.filter(l => l.status === "done").length;
                  const isCurrent = unitLessons[0].isCurrent || unitLessons.some(l => l.isCurrent);
                  return (
                    <div key={i} style={{ flex: total, display: "flex" }}>
                      <div style={{ flex: done, background: "var(--c)" }} />
                      <div style={{ flex: total - done, background: isCurrent ? "var(--cl)" : "var(--ink-100)", opacity: isCurrent ? 0.6 : 1 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--ink-400)" }}>
                <span>Aug</span><span>Oct</span><span>Dec</span><span>Feb</span><span>Apr</span><span>Jun</span>
              </div>
            </div>
          </div>

          {/* Lesson list by unit — collapsible week groups inside each unit, with per-unit Expand/Close all */}
          <div style={{ padding: "14px 24px 24px" }}>
            {Object.entries(byUnit).map(([unitName, unitLessons]) => {
              const isCurrent = unitLessons.some(l => l.isCurrent);
              const u = unitLessons[0].unitIdx;
              // group by week within this unit
              const byWeek = {};
              unitLessons.forEach(l => { (byWeek[l.week] = byWeek[l.week] || []).push(l); });
              const weeks = Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
              const unitKey = `unit-${u}`;
              const expandedWeeks = subjectExpansion[unitKey] || {};
              const allOpen = weeks.every(w => expandedWeeks[w]);
              const expandedLessons = subjectExpansion[`${unitKey}-lessons`] || {};
              const setUnitState = (next) => setSubjectExpansion(s => ({ ...s, [unitKey]: next }));
              const setUnitLessons = (next) => setSubjectExpansion(s => ({ ...s, [`${unitKey}-lessons`]: next }));
              const expandAllWeeks = () => setUnitState(Object.fromEntries(weeks.map(w => [w, true])));
              const closeAllWeeks = () => { setUnitState({}); setUnitLessons({}); };
              const toggleWeek = (w) => setUnitState({ ...expandedWeeks, [w]: !expandedWeeks[w] });
              const toggleLesson = (id) => setUnitLessons({ ...expandedLessons, [id]: !expandedLessons[id] });
              const isUnitOpen = openUnits[unitKey] ?? (isCurrent || u === 1);
              return (
                <div key={unitName} style={{ marginBottom: 10 }}>
                  <div onClick={()=>setOpenUnits(s => ({ ...s, [unitKey]: !isUnitOpen }))} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: isCurrent ? "color-mix(in oklch, var(--c) 8%, var(--paper))" : "var(--ink-50)",
                    border: isCurrent ? `1px solid color-mix(in oklch, var(--c) 35%, transparent)` : "1px solid var(--ink-100)",
                    borderRadius: 5, cursor: "pointer",
                  }}>
                    <span style={{ display: "inline-flex", transform: `rotate(${isUnitOpen ? 90 : 0}deg)`, transition: "transform .15s" }}>
                      <CPIcon name="chevron" size={11} />
                    </span>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--mono)", color: "var(--c)",
                      background: "var(--paper)", padding: "1px 6px", borderRadius: 3,
                      border: `1px solid var(--c)`, fontWeight: 600,
                    }}>U{u}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "var(--ink-900)" }}>{unitName.replace(/^Unit \d+ · |^Q\d · |^Term \d · /, "")}</span>
                    {isCurrent && <span style={{ fontSize: 10, padding: "1px 7px", background: "var(--c)", color: "white", borderRadius: 999, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Now</span>}
                    <span style={{ fontSize: 11, color: "var(--ink-500)", fontVariantNumeric: "tabular-nums" }}>
                      {unitLessons.filter(l=>l.status==="done").length}/{unitLessons.length}
                    </span>
                    {isUnitOpen && (
                      <button onClick={(e)=>{e.stopPropagation(); allOpen ? closeAllWeeks() : expandAllWeeks();}} style={{
                        fontSize: 11, color: "var(--ink-500)", padding: "2px 8px",
                        border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper)",
                      }}>{allOpen ? "Close all" : "Expand all"}</button>
                    )}
                  </div>
                  {isUnitOpen && (
                    <div style={{ paddingLeft: 12, paddingTop: 6 }}>
                      {weeks.map(w => {
                        const weekLessons = byWeek[w];
                        const open = !!expandedWeeks[w];
                        const wDone = weekLessons.filter(l => l.status === "done").length;
                        return (
                          <div key={w} style={{ marginBottom: 4 }}>
                            <button onClick={()=>toggleWeek(w)} style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              padding: "5px 10px", fontSize: 12,
                              color: "var(--ink-700)", textAlign: "left",
                              background: open ? "var(--ink-50)" : "transparent",
                              borderRadius: 3,
                            }}>
                              <span style={{ display: "inline-flex", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s" }}>
                                <CPIcon name="chevron" size={9} />
                              </span>
                              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-500)", width: 32 }}>W{w}</span>
                              <span style={{ flex: 1, fontWeight: 500 }}>
                                {weekLessons.length} {weekLessons.length === 1 ? "lesson" : "lessons"}
                                <span style={{ color: "var(--ink-400)", fontWeight: 400, marginLeft: 6 }}>· {weekLessons[0].title}{weekLessons.length>1 && " · …"}</span>
                              </span>
                              <span style={{ fontSize: 10.5, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>{wDone}/{weekLessons.length}</span>
                            </button>
                            {open && (
                              <div style={{ paddingLeft: 18, paddingTop: 2 }}>
                                {weekLessons.map(l => {
                                  const lExp = !!expandedLessons[l.id];
                                  const isPersonalFull = l.kind === "personal-full";
                                  return (
                                    <div key={l.id} style={{
                                      borderBottom: "1px solid var(--ink-100)",
                                      opacity: l.status === "skipped" ? 0.55 : 1,
                                      position: "relative",
                                    }}>
                                      {/* Dashed Personalized stripe for full added events */}
                                      {isPersonalFull && (
                                        <div style={{
                                          position: "absolute", left: 0, top: 6, bottom: 6, width: 3,
                                          backgroundImage: "repeating-linear-gradient(to bottom, var(--c) 0 4px, transparent 4px 8px)",
                                        }} />
                                      )}
                                      <button onClick={()=>toggleLesson(l.id)} style={{
                                        display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", paddingLeft: isPersonalFull ? 16 : 10,
                                        width: "100%", textAlign: "left",
                                      }}>
                                        <span style={{ display: "inline-flex", transform: `rotate(${lExp ? 90 : 0}deg)`, transition: "transform .15s", color: "var(--ink-300)" }}>
                                          <CPIcon name="chevron" size={8} />
                                        </span>
                                        <CPCheck status={l.status} size={14} />
                                        <span style={{
                                          flex: 1, fontSize: 13, color: "var(--ink-900)",
                                          textDecoration: l.status === "done" || l.status === "skipped" ? "line-through" : "none",
                                          textDecorationColor: "var(--ink-300)", textWrap: "pretty",
                                        }}>{l.title}</span>
                                        {isPersonalFull && (
                                          <span title="Standalone Personalized lesson event" style={{
                                            fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
                                            padding: "1px 6px", borderRadius: 999,
                                            background: "var(--c)", color: "var(--paper)",
                                          }}>Personalized</span>
                                        )}
                                        {!isPersonalFull && l.subEvents && l.subEvents.length > 0 && (
                                          <span title={`${l.subEvents.length} Personalized task${l.subEvents.length === 1 ? "" : "s"}`} style={{
                                            fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3,
                                            padding: "1px 7px 1px 5px", borderRadius: 999,
                                            background: "var(--cl)", color: "var(--cd)",
                                            display: "inline-flex", alignItems: "center", gap: 3,
                                          }}>
                                            <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--cd)" }} />
                                            +{l.subEvents.length}
                                          </span>
                                        )}
                                        {l.standards.slice(0,2).map(s => (
                                          <span key={s} style={{
                                            fontSize: 9, fontFamily: "var(--mono)", padding: "1px 5px", border: "1px solid var(--ink-200)",
                                            borderRadius: 2, color: "var(--ink-500)",
                                          }}>{s}</span>
                                        ))}
                                        {l.isPersonal && !isPersonalFull && <CPForkDot />}
                                        {l.isCurrent && <span style={{ fontSize: 10, color: "var(--c)", fontWeight: 600 }}>•</span>}
                                      </button>

                                      {/* Sub-events list — always visible under the parent, indented */}
                                      {!lExp && l.subEvents && l.subEvents.length > 0 && (
                                        <div style={{ paddingLeft: 50, paddingBottom: 5, display: "flex", flexDirection: "column" }}>
                                          {l.subEvents.map(s => (
                                            <div key={s.id} style={{
                                              display: "flex", alignItems: "center", gap: 9,
                                              padding: "4px 0", position: "relative",
                                            }}>
                                              {/* tree-line connector */}
                                              <span style={{
                                                position: "absolute", left: -14, top: 0, bottom: "50%",
                                                width: 12, borderLeft: "1.5px dashed color-mix(in oklch, var(--c) 50%, transparent)",
                                                borderBottom: "1.5px dashed color-mix(in oklch, var(--c) 50%, transparent)",
                                                borderBottomLeftRadius: 4,
                                              }} />
                                              <CPCheck status={s.status} size={12} />
                                              <span style={{
                                                fontSize: 12, color: "var(--ink-700)",
                                                textDecoration: s.status === "done" ? "line-through" : "none",
                                                textDecorationColor: "var(--ink-300)",
                                                flex: 1, textWrap: "pretty",
                                              }}>{s.title}</span>
                                              <span style={{
                                                fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
                                                padding: "1px 5px", borderRadius: 3,
                                                background: "color-mix(in oklch, var(--c) 18%, white)", color: "var(--cd)",
                                              }}>task</span>
                                            </div>
                                          ))}
                                          <button style={{
                                            alignSelf: "flex-start", marginTop: 3, fontSize: 11, color: "var(--cd)",
                                            display: "inline-flex", alignItems: "center", gap: 4,
                                            padding: "2px 8px", borderRadius: 4,
                                            border: "1px dashed color-mix(in oklch, var(--c) 40%, transparent)",
                                          }}>
                                            <CPIcon name="plus" size={9} /> Add Personalized task
                                          </button>
                                        </div>
                                      )}
                                      {lExp && (
                                        <div style={{ padding: "6px 10px 10px 38px", fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5, background: "var(--ink-50)" }}>
                                          <div style={{ textWrap: "pretty" }}>{l.directions || "Open in Weekly to see directions and resources."}</div>
                                          {l.notes && (
                                            <div style={{ marginTop: 6, padding: "4px 7px", background: "var(--important-bg)", color: "var(--important)", fontSize: 11, borderRadius: 3 }}>
                                              <span style={{ fontWeight: 500 }}>Note · </span>{l.notes}
                                            </div>
                                          )}
                                          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            {l.standards.map(s => (
                                              <span key={s} className="cp-mono" style={{ fontSize: 10, color: "var(--ink-700)", background: "var(--paper)", border: "1px solid var(--ink-200)", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CPStat({ label, value, color }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9 · UNIT SUMMARY CARD — header + summary + completion bar
// ─────────────────────────────────────────────────────────────────────
function ABUnitSummaryCard() {
  // Show three variants stacked: in-progress, upcoming, complete
  const variants = [
    {
      label: "In progress",
      subjectId: "math",
      title: "Coordinate Plane",
      unitNum: 6,
      window: "Nov 3 – Nov 21 · 3 weeks",
      summary: "Students plot points on the first quadrant of the coordinate plane and use ordered pairs to solve real-world problems. Connects to last year's number-line work and prepares students for fully signed coordinates in Grade 6.",
      lessonsTotal: 12, lessonsDone: 7, lessonsSkipped: 1,
      standards: ["5.G.A.1", "5.G.A.2", "5.OA.B.3"],
      keyResources: 4,
      notes: 3,
      isCurrent: true,
    },
    {
      label: "Upcoming",
      subjectId: "writing",
      title: "Persuasive Essay",
      unitNum: 3,
      window: "Dec 1 – Dec 19 · 3 weeks",
      summary: "Students build claim-evidence-reasoning paragraphs into a full five-paragraph persuasive essay on a self-selected topic. Heavy modeling in week 1; conferring-driven revision in week 3.",
      lessonsTotal: 14, lessonsDone: 0, lessonsSkipped: 0,
      standards: ["W.5.1", "W.5.4", "W.5.5", "L.5.3"],
      keyResources: 6,
      notes: 1,
    },
    {
      label: "Complete",
      subjectId: "explorers",
      title: "Mesopotamia — Rivers & Cities",
      unitNum: 1,
      window: "Aug 26 – Sep 27 · 5 weeks",
      summary: "Students trace how the Tigris and Euphrates shaped the first city-states. Capstone: a one-page argument for which innovation (writing, wheel, irrigation) mattered most, with two sources.",
      lessonsTotal: 18, lessonsDone: 16, lessonsSkipped: 2,
      standards: ["5.SS.A.1", "5.SS.A.2", "5.SS.B.1", "5.SS.B.3"],
      keyResources: 5,
      notes: 0,
    },
  ];

  return (
    <div className="cp-root" style={{ padding: 32, background: "var(--ink-50)", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760, margin: "0 auto" }}>
        {variants.map((v, i) => {
          const subj = SUBJECT_BY_ID[v.subjectId];
          const pct = v.lessonsTotal ? Math.round((v.lessonsDone / v.lessonsTotal) * 100) : 0;
          return (
            <div key={i}>
              <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 6 }}>
                Variant — {v.label}
              </div>
              <article className={`cp-subj ${subj.cls}`} style={{
                background: "var(--paper)", borderRadius: 7, overflow: "hidden",
                border: "1px solid var(--ink-150)", boxShadow: "0 1px 2px rgba(20,22,32,.04)",
              }}>
                {/* Header */}
                <div style={{
                  padding: "14px 18px 12px",
                  borderLeft: "4px solid var(--c)",
                  borderBottom: "1px solid var(--ink-100)",
                  background: v.isCurrent ? "color-mix(in oklch, var(--c) 5%, var(--paper))" : "var(--paper)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--mono)", color: "var(--c)",
                      padding: "2px 7px", borderRadius: 3, border: `1px solid var(--c)`,
                      fontWeight: 600, letterSpacing: 0.4,
                    }}>UNIT {v.unitNum}</span>
                    <span style={{ fontSize: 11, color: "var(--c)", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      {subj.name}
                    </span>
                    {v.isCurrent && <span style={{ fontSize: 10, padding: "1px 7px", background: "var(--c)", color: "white", borderRadius: 999, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Current</span>}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{v.window}</span>
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: "var(--ink-900)", marginTop: 4, lineHeight: 1.2 }}>{v.title}</h3>
                </div>

                {/* Body */}
                <div style={{ padding: "14px 18px 16px" }}>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-700)", marginBottom: 14, textWrap: "pretty" }}>
                    {v.summary}
                  </p>

                  {/* Progress */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Progress</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--ink-900)" }}>
                        {v.lessonsDone}<span style={{ color: "var(--ink-400)", fontWeight: 400 }}>/{v.lessonsTotal}</span>
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-400)", marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                    </div>
                    <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--ink-100)" }}>
                      <div style={{ width: `${(v.lessonsDone / v.lessonsTotal) * 100}%`, background: "var(--c)" }} />
                      <div style={{ width: `${(v.lessonsSkipped / v.lessonsTotal) * 100}%`, background: "var(--ink-300)" }} />
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 10, color: "var(--ink-500)" }}>
                      <span><span style={{ display: "inline-block", width: 7, height: 7, background: "var(--c)", borderRadius: 1, marginRight: 4 }} />Done {v.lessonsDone}</span>
                      <span><span style={{ display: "inline-block", width: 7, height: 7, background: "var(--ink-300)", borderRadius: 1, marginRight: 4 }} />Skipped {v.lessonsSkipped}</span>
                      <span><span style={{ display: "inline-block", width: 7, height: 7, background: "var(--ink-100)", borderRadius: 1, marginRight: 4 }} />Remaining {v.lessonsTotal - v.lessonsDone - v.lessonsSkipped}</span>
                    </div>
                  </div>

                  {/* Standards + meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, borderTop: "1px solid var(--ink-100)", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Standards</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {v.standards.map(s => (
                          <span key={s} style={{
                            fontSize: 10, fontFamily: "var(--mono)", padding: "1px 6px",
                            border: "1px solid var(--ink-200)", borderRadius: 2, color: "var(--ink-700)",
                          }}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "var(--ink-500)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <CPIcon name="link" size={11} /> {v.keyResources} resources
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-500)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <CPIcon name="eye" size={11} /> {v.notes} notes
                    </span>
                    <button style={{ fontSize: 12, fontWeight: 500, color: "var(--c)", padding: "4px 10px", border: `1px solid var(--c)`, borderRadius: 4, background: "var(--paper)" }}>
                      Open unit →
                    </button>
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 10 · SCHEDULE VIEW — time-blocked timeline w/ current-time indicator
// ─────────────────────────────────────────────────────────────────────
function ABScheduleView() {
  const layoutMode = useViewMode();
  const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
  const NOW_MIN = 10 * 60 + 32; // 10:32 AM

  // Time slots 8:00 to 15:30, in minutes from 8:00
  const dayStart = 8 * 60;
  const dayEnd   = 15 * 60 + 30;
  const totalMin = dayEnd - dayStart;
  const PX_PER_MIN = 1.4;
  const colHeight = totalMin * PX_PER_MIN;

  // Schedule blocks per day. Times in minutes-from-midnight.
  const schedule = {
    Sun: [
      ["math",     "Coordinate plane — patterns Day 2", 8*60,    9*60],
      ["reading",  "Main idea across paragraphs",       9*60,    9*60+50],
      ["block",    "Snack & recess",                    9*60+50, 10*60+20],
      ["writing",  "Counterargument modeling",          10*60+20, 11*60+10],
      ["block",    "Lunch & recess",                    11*60+40, 12*60+20],
      ["science",  "Water cycle station rotation",      12*60+20, 13*60+15],
      ["pe",       "Net & wall — pickleball",           13*60+25, 14*60+5],
      ["social",   "Colonial trade routes",             14*60+15, 15*60+5],
    ],
    Mon: [
      ["math",     "Distance on a coordinate grid",     8*60,    9*60],
      ["reading",  "Comparing two articles",            9*60,    9*60+50],
      ["block",    "Snack & recess",                    9*60+50, 10*60+20],
      ["writing",  "Drafting body paragraphs",          10*60+20, 11*60+10],
      ["block",    "Specials — Art (Ms. Chen)",         11*60+10, 11*60+40],
      ["block",    "Lunch",                             11*60+40, 12*60+20],
      ["science",  "Erosion lab — Day 1",               12*60+20, 13*60+30],
      ["social",   "Triangular trade jigsaw",           13*60+40, 14*60+30],
      ["block",    "Pack-up & dismissal",               14*60+30, 15*60],
    ],
    Tue: [
      ["math",     "Patterns & rules — Day 1",          8*60,    9*60],
      ["reading",  "Author's purpose mini-lesson",      9*60,    9*60+50],
      ["block",    "Snack & recess",                    9*60+50, 10*60+20],
      ["writing",  "Peer revision protocol",            10*60+20, 11*60+20],
      ["block",    "Lunch",                             11*60+40, 12*60+20],
      ["pe",       "Net & wall — badminton",            12*60+20, 13*60],
      ["science",  "Erosion lab — Day 2",               13*60,   14*60+10],
      ["music",    "Recorder ensemble",                 14*60+15, 15*60+5],
    ],
    Wed: [
      ["math",     "Unit 6 mid-check",                  8*60,    9*60],
      ["reading",  "Independent reading + conferring",  9*60,    9*60+50],
      ["block",    "Snack & recess",                    9*60+50, 10*60+20],
      ["writing",  "One-on-one conferences",            10*60+20, 11*60+10],
      ["block",    "Lunch",                             11*60+40, 12*60+20],
      ["social",   "Colonial daily life — gallery",     12*60+20, 13*60+15],
      ["art",      "Color theory — complementary",      13*60+25, 14*60+15],
      ["block",    "Class meeting",                     14*60+25, 15*60+5],
    ],
    Thu: [
      ["math",     "Coordinate plane review",           8*60,    9*60],
      ["reading",  "Unit 3 assessment",                 9*60,    10*60+10],
      ["block",    "Snack & recess",                    10*60+10,10*60+40],
      ["writing",  "Quick-write — counterargument",     10*60+40,11*60+20],
      ["block",    "Early dismissal — PD",              11*60+30,12*60+30],
    ],
  };

  const blockColor = (kind) => {
    if (kind === "block") return null;
    return SUBJECT_BY_ID[kind];
  };

  return (
    <div className="cp-root" style={{ height: "100%", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      <CPTopBar view="schedule" />

      {layoutMode === "tasks" ? (
        <div style={{ flex: 1, overflow: "auto", background: "var(--ink-50)" }}>
          <ABTaskListBody scope="day" lessons={LESSONS.filter(l => l.day === 1)} />
        </div>
      ) : (
      <React.Fragment>
      <div style={{ padding: "10px 18px 8px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Schedule</div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>Week 12 · Nov 9 – Nov 13</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--catchup)", fontWeight: 500, padding: "4px 10px 4px 8px", background: "color-mix(in oklch, var(--catchup) 10%, transparent)", borderRadius: 5 }}>
          <span style={{ width: 8, height: 8, background: "var(--catchup)", borderRadius: 999 }} /> Now · 10:32
        </div>
        <button style={{ fontSize: 12, padding: "5px 11px", border: "1px solid var(--ink-200)", borderRadius: 5, color: "var(--ink-700)" }}>
          Edit times
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 18px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", gap: 4, position: "relative", paddingTop: 22 }}>
          {/* Time gutter */}
          <div style={{ position: "relative" }}>
            {Array.from({ length: 8 }).map((_, i) => {
              const m = i * 60;
              const hour = 8 + i;
              return (
                <div key={i} style={{ position: "absolute", top: m * PX_PER_MIN, right: 8, fontSize: 10, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums", transform: "translateY(-50%)" }}>
                  {hour > 12 ? hour - 12 : hour}<span style={{ color: "var(--ink-300)" }}>{hour >= 12 ? "p" : "a"}</span>
                </div>
              );
            })}
            <div style={{ height: colHeight }} />
          </div>

          {/* Day columns */}
          {DAYS.map((d, di) => {
            const blocks = schedule[d];
            const isToday = d === "Mon";
            return (
              <div key={d}>
                <div style={{
                  position: "sticky", top: -1, zIndex: 2, background: "var(--paper)",
                  padding: "0 2px 6px", fontSize: 11, color: isToday ? "var(--catchup)" : "var(--ink-500)",
                  fontWeight: isToday ? 600 : 500, letterSpacing: 0.4, textTransform: "uppercase",
                  borderBottom: isToday ? "2px solid var(--catchup)" : "2px solid var(--ink-100)",
                  marginTop: -22, marginBottom: 0, height: 22, display: "flex", alignItems: "center", gap: 6,
                }}>
                  {d} <span style={{ color: "var(--ink-400)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{9 + di}</span>
                </div>
                <div style={{ position: "relative", height: colHeight, background: "var(--ink-50)", borderRadius: 4, overflow: "hidden" }}>
                  {/* Hour gridlines */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{
                      position: "absolute", top: i * 60 * PX_PER_MIN, left: 0, right: 0,
                      borderTop: "1px solid color-mix(in oklch, var(--ink-100) 60%, transparent)",
                    }} />
                  ))}
                  {/* Blocks */}
                  {blocks.map(([kind, label, start, end], i) => {
                    const subj = blockColor(kind);
                    const top = (start - dayStart) * PX_PER_MIN;
                    const h = (end - start) * PX_PER_MIN;
                    const fmt = (m) => {
                      const hh = Math.floor(m/60), mm = m % 60;
                      return `${((hh+11)%12)+1}:${mm.toString().padStart(2,"0")}`;
                    };
                    return (
                      <div key={i} className={subj ? `cp-subj ${subj.cls}` : ""} style={{
                        position: "absolute", top, left: 3, right: 3, height: h,
                        background: subj ? "var(--cs)" : "var(--paper)",
                        borderLeft: subj ? "3px solid var(--c)" : "3px solid var(--ink-200)",
                        borderRadius: 3,
                        padding: "4px 6px",
                        fontSize: 11, color: subj ? "var(--c)" : "var(--ink-500)",
                        overflow: "hidden",
                        opacity: subj ? 1 : 0.85,
                      }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.2, fontSize: 11, color: subj ? "var(--c)" : "var(--ink-500)", textTransform: subj ? "none" : "uppercase", letterSpacing: subj ? 0 : 0.4 }}>
                          {subj ? subj.name : label}
                        </div>
                        {subj && h > 32 && <div style={{ fontSize: 11, color: "var(--ink-700)", fontWeight: 500, marginTop: 1, lineHeight: 1.25, textWrap: "pretty" }}>{label}</div>}
                        {h > 50 && <div style={{ position: "absolute", bottom: 3, right: 6, fontSize: 9, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>{fmt(start)}–{fmt(end)}</div>}
                      </div>
                    );
                  })}
                  {/* Current-time line */}
                  {isToday && (
                    <div style={{
                      position: "absolute", top: (NOW_MIN - dayStart) * PX_PER_MIN, left: -2, right: -2,
                      height: 0, borderTop: "2px solid var(--catchup)", zIndex: 3, pointerEvents: "none",
                    }}>
                      <span style={{
                        position: "absolute", left: -10, top: -5, width: 10, height: 10, background: "var(--catchup)", borderRadius: 999,
                        boxShadow: "0 0 0 3px color-mix(in oklch, var(--catchup) 25%, transparent)",
                      }} />
                      <span style={{
                        position: "absolute", right: 4, top: -7, fontSize: 9, fontWeight: 600,
                        color: "var(--paper)", background: "var(--catchup)", padding: "1px 5px", borderRadius: 2, letterSpacing: 0.3,
                      }}>NOW</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { ABSubjectView, ABUnitSummaryCard, ABScheduleView, CPStat });
