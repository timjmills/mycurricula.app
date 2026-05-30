// artboards-core.jsx — The four hero artboards built in priority order:
//   1. Lesson card showcase (states + anatomy)
//   2. Weekly grid (3 weeks, full Sun-Thu × 8 subjects, drag-and-drop)
//   3. Two-pane Daily layout (3 right-pane states)
//   4. Today dashboard

// ─────────────────────────────────────────────────────────────────────
// 1 · LESSON CARD — every state in one artboard
// ─────────────────────────────────────────────────────────────────────
function ABLessonCard() {
  // Pull a few real lessons for variety
  const sample = LESSONS.find(l => l.id === "m-12-1");
  const personal = LESSONS.find(l => l.id === "r-12-1");
  const done = LESSONS.find(l => l.id === "m-12-2");
  const carried = LESSONS.find(l => l.id === "w-12-1");
  const pending = LESSONS.find(l => l.id === "m-12-3");
  const noStd   = LESSONS.find(l => l.id === "se-12-0");

  const Row = ({ label, sub, children, last }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr",
      gap: 24, alignItems: "flex-start",
      padding: "18px 22px",
      borderBottom: last ? "none" : "1px solid var(--ink-100)",
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-900)", letterSpacing: 0.2 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2, textWrap: "balance" }}>{sub}</div>
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="cp-root" style={{ height: "100%", overflow: "auto", background: "var(--ink-50)" }}>
      {/* Header */}
      <div style={{ padding: "20px 22px 14px", background: "var(--paper)", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }}>Lesson card</div>
        <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4, maxWidth: 540, textWrap: "pretty" }}>
          The atomic unit. Same card appears in Weekly, Daily, Subject, Unit views and slides into the right-pane detail.
          Collapsed default: title + 2–3 line preview from directions, completion check, standards badge, resource icons,
          subject stripe, fork dot.
        </div>
      </div>

      {/* Anatomy callout — annotated card */}
      <div style={{ background: "var(--paper)", borderBottom: "1px solid var(--ink-100)", padding: "26px 22px 28px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>Anatomy</div>
        <div style={{ position: "relative", maxWidth: 340 }}>
          <CPLessonCard lesson={sample} />
          {/* annotation lines (decorative, just SVG) */}
          <svg style={{ position: "absolute", left: -180, top: -10, width: 180, height: 220, pointerEvents: "none" }}>
            <g stroke="var(--ink-300)" strokeWidth="1" fill="none">
              <path d="M180 24 L60 24" /><path d="M180 60 L60 60" /><path d="M180 100 L60 100" /><path d="M180 138 L60 138" />
            </g>
            <g fontSize="10" fontFamily="var(--font-sans)" fill="var(--ink-500)" textAnchor="end">
              <text x="55" y="27">subject stripe</text>
              <text x="55" y="63">title + ✓</text>
              <text x="55" y="103">2–3 line preview</text>
              <text x="55" y="141">CCSS + resources</text>
            </g>
          </svg>
          <svg style={{ position: "absolute", right: -180, top: 80, width: 180, height: 120, pointerEvents: "none" }}>
            <g stroke="var(--ink-300)" strokeWidth="1" fill="none">
              <path d="M0 70 L80 70" />
            </g>
            <g fontSize="10" fontFamily="var(--font-sans)" fill="var(--ink-500)">
              <text x="85" y="73">personal-fork dot</text>
            </g>
          </svg>
        </div>
      </div>

      {/* States table */}
      <Row label="Default" sub="At rest in the grid.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={sample} />
        </div>
      </Row>

      <Row label="Hover" sub="Subtle shadow + ⋯ menu affordance.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={sample} state="hover" />
        </div>
      </Row>

      <Row label="Selected" sub="Subject-colored border. Used in Daily two-pane list.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={sample} state="selected" />
        </div>
      </Row>

      <Row label="Expanded (inline)" sub="Weekly/Subject/Unit views. Stays open until closed.">
        <div style={{ maxWidth: 320 }}>
          <div className={`cp-subj ${SUBJECT_BY_ID[sample.subject].cls}`} style={{
            background: "var(--paper)", border: "1px solid var(--ink-200)", borderRadius: 4, position: "relative", overflow: "hidden"
          }}>
            <div style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: "var(--c)" }} />
            <div style={{ display: "flex", gap: 7, padding: "8px 9px 4px 11px" }}>
              <CPCheck status="not_done" size={14} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{sample.title}</div>
              <button style={{ color: "var(--ink-400)" }}><CPIcon name="chevronU" size={12} /></button>
            </div>
            <div style={{ padding: "0 11px 8px", fontSize: 12, color: "var(--ink-500)", lineHeight: 1.45 }}>
              <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>Directions</div>
              <div style={{ textWrap: "pretty" }}>{sample.directions}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--ink-700)" }}>
                <CPIcon name="eye" size={12} />
                <span style={{ fontSize: 11 }}>Hover to reveal notes</span>
              </div>
            </div>
            <div style={{ padding: "6px 11px 8px", borderTop: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {sample.standards.map(s => (
                <span key={s} className="cp-mono" style={{ fontSize: 10, color: "var(--ink-700)", background: "var(--ink-100)", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
              ))}
              {sample.resources.map((r, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-700)", background: "var(--ink-100)", padding: "2px 6px", borderRadius: 3 }}>
                  <CPIcon name={CP_RES_ICON[r.type]} size={11} />{r.label}
                </span>
              ))}
              <div style={{ flex: 1 }} />
              <CPForkDot />
            </div>
          </div>
        </div>
      </Row>

      <Row label="Personalized fork" sub="Dot indicates this is your edited copy.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={personal} />
        </div>
      </Row>

      <Row label="Personalized + pending Core update" sub="Amber dot: Core changed, queued for review.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={pending} />
        </div>
      </Row>

      <Row label="Completed" sub="Title struck through, check filled.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={done} />
        </div>
      </Row>

      <Row label="Carried over" sub="Wasn't taught — rescheduled. Caught by catch-up filter.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={carried} />
        </div>
      </Row>

      <Row label="No standards" sub="SEL & specials often don't carry CCSS — badge omitted.">
        <div style={{ maxWidth: 320 }}>
          <CPLessonCard lesson={noStd} />
        </div>
      </Row>

      <Row label="Dragging" sub="Lifted, tilted, shadow grows. Cursor: grabbing.">
        <div style={{ maxWidth: 320, padding: "10px 0" }}>
          <CPLessonCard lesson={sample} state="dragging" />
        </div>
      </Row>

      <Row label="Narrow / mobile" sub="Preview clamps to 1 line in tight columns.">
        <div style={{ maxWidth: 200 }}>
          <CPLessonCard lesson={sample} narrow />
        </div>
      </Row>

      <Row label="Right-click menu" sub="Same affordance via ⋯ on hover. Mark status submenu shown.">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", maxWidth: 540 }}>
          <div style={{ width: 280 }}>
            <CPLessonCard lesson={sample} state="hover" />
          </div>
          <div style={{ position: "relative" }}>
            <CPContextMenu items={[
              { label: "Move to…", chevron: true },
              { label: "Duplicate" },
              { label: "Copy to my Personalized" },
              { label: "Mark status…", chevron: true },
              { divider: true },
              { label: "Add to to-do list" },
              { label: "See standards" },
              { label: "Print this lesson", kbd: "⌘P" },
              { divider: true },
              { label: "Delete", danger: true },
            ]} style={{ position: "static", boxShadow: "0 6px 24px rgba(20,22,32,0.18), 0 0 0 1px var(--ink-150)" }} />
          </div>
        </div>
      </Row>

      <Row last label="Color scale" sub="Each subject × 3 unit shades. Stripe = canonical hue.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8, maxWidth: 540 }}>
          {SUBJECTS.map(s => (
            <div key={s.id} className={`cp-subj ${s.cls}`} style={{ textAlign: "center" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 28, background: "var(--cl)" }} />
                <div style={{ flex: 1, height: 28, background: "var(--c)" }} />
                <div style={{ flex: 1, height: 28, background: "var(--cd)" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--ink-500)" }}>{s.name}</div>
            </div>
          ))}
        </div>
      </Row>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2 · WEEKLY GRID — 3 weeks, Sun–Thu × 8 subjects, drag-and-drop
// ─────────────────────────────────────────────────────────────────────
function ABWeeklyGrid() {
  const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
  const [week, setWeek] = React.useState(12);
  const [expanded, setExpanded] = React.useState(new Set(["m-12-1","r-12-1"]));
  const [dragging, setDragging] = React.useState(null);
  const [dropTarget, setDropTarget] = React.useState(null);
  const [lessons, setLessons] = React.useState(LESSONS);
  const [mode, setMode] = React.useState("personal");
  const [editingMaster, setEditingMaster] = React.useState(false);
  const [ctxMenu, setCtxMenu] = React.useState(null);
  // Global view mode lives in localStorage — last clicked wins everywhere.
  const layoutMode = useViewMode();

  const closeExpanded = () => setExpanded(new Set());
  const expandAll = () => setExpanded(new Set(LESSONS.map(l => l.id)));

  const toggleExp = (id) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  // Right-click handler — opens the universal context menu.
  const onLessonContext = (e, l) => {
    e.preventDefault(); e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const wrap = e.currentTarget.closest(".cp-root").getBoundingClientRect();
    setCtxMenu({ x: e.clientX - wrap.left, y: e.clientY - wrap.top, lesson: l });
  };

  React.useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("click", close); document.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  // Fake "moved" lessons for weeks 11 and 13
  const weekLessons = (w) =>
    w === 12 ? lessons :
    w === 11 ? lessons.map(l => ({ ...l, id: l.id+"_11", week: 11, status: ["done","done","partial","not_done"][Math.floor(Math.random()*4)] || l.status })) :
    lessons.map(l => ({ ...l, id: l.id+"_13", week: 13, status: "not_done" }));

  const all = weekLessons(week);
  const bySubjDay = {};
  for (const s of SUBJECTS) bySubjDay[s.id] = [[],[],[],[],[]];
  for (const l of all) bySubjDay[l.subject][l.day].push(l);

  const handleDrop = (subj, day) => {
    if (!dragging) return;
    // Re-bucket the dragged lesson — purely visual; data layer would write to API.
    setLessons(prev => prev.map(l => l.id === dragging.id ? { ...l, day } : l));
    setDragging(null); setDropTarget(null);
  };

  return (
    <div className="cp-root" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)", position: "relative" }}>
      {/* Top bar */}
      <CPTopBar week={week} setWeek={setWeek} mode={mode} setMode={setMode} editingMaster={editingMaster} setEditingMaster={setEditingMaster} />

      {/* Editing-Core-Curriculum banner — only visible in Core mode + edit on */}
      {mode === "core" && editingMaster && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
          background: "var(--core-mode-bg)", borderBottom: "2px solid var(--core-mode)",
          color: "var(--core-mode-deep)", fontSize: 12.5, fontWeight: 500 }}>
          <CPIcon name="lock" size={13} />
          <span>You're editing the <strong>Core Curriculum</strong>. Changes affect every teacher on the Grade 5 team.</span>
          <div style={{ flex: 1 }} />
          <button onClick={()=>setEditingMaster(false)} style={{ padding: "3px 10px", border: "1px solid var(--core-mode)", borderRadius: 4, fontSize: 11.5, color: "var(--core-mode-deep)", fontWeight: 500 }}>Exit edit mode</button>
        </div>
      )}

      {/* Task-list mode short-circuits the grid */}
      {layoutMode === "tasks" ? (
        <div style={{ flex: 1, overflow: "auto", background: "var(--ink-50)" }}>
          <ABTaskListBody scope="week" lessons={lessons} />
        </div>
      ) : (
      <React.Fragment>
      {/* Catch-up callout */}
      <div style={{ display: "flex", padding: "10px 16px", gap: 10, alignItems: "center",
        borderBottom: "1px solid var(--ink-100)", background: "var(--ink-50)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 6px",
          background: "var(--catchup-bg)", color: "var(--catchup)", borderRadius: 999, fontSize: 12, fontWeight: 500 }}>
          <CPIcon name="flame" size={12} /> 3 items not covered
        </div>
        <button style={{ fontSize: 12, color: "var(--ink-500)" }}>Show only uncovered →</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--ink-500)" }}>
          <button onClick={expanded.size > 0 ? closeExpanded : expandAll} style={{ padding: "2px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, fontSize: 11, color: "var(--ink-700)" }}>
            {expanded.size > 0 ? `Close all (${expanded.size})` : "Expand all"}
          </button>
          <span style={{ width: 1, height: 14, background: "var(--ink-200)", margin: "0 2px" }} />
          <span>Filters:</span>
          <button style={{ padding: "2px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, fontSize: 11 }}>Subjects · 8</button>
          <button style={{ padding: "2px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, fontSize: 11 }}>All units</button>
          <button style={{ padding: "2px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, fontSize: 11 }}>Status · All</button>
        </div>
      </div>

      {/* Day header */}
      <div style={{ display: "grid", gridTemplateColumns: "112px repeat(5, 1fr)", borderBottom: "1px solid var(--ink-150)", background: "var(--ink-50)" }}>
        <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 500, color: "var(--ink-400)", letterSpacing: 0.6, textTransform: "uppercase" }}>Subject</div>
        {DAYS.map((d, i) => {
          const date = week === 12 ? [9,10,11,12,13][i] : week === 11 ? [2,3,4,5,6][i] : [16,17,18,19,20][i];
          const today = week === 12 && i === 1; // Mon is "today"
          return (
            <div key={d} style={{
              padding: "9px 12px", borderLeft: "1px solid var(--ink-150)",
              display: "flex", alignItems: "baseline", gap: 8,
              background: today ? "linear-gradient(180deg, var(--math) 0%, var(--math) 3px, var(--paper) 3px)" : "transparent",
              position: "relative",
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: today ? "var(--math)" : "var(--ink-500)" }}>{d}</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: today ? "var(--ink-900)" : "var(--ink-700)", fontVariantNumeric: "tabular-nums" }}>{date}</span>
              {today && <span style={{ fontSize: 10, color: "var(--math)", fontWeight: 600, letterSpacing: 0.4 }}>TODAY</span>}
            </div>
          );
        })}
      </div>

      {/* Daily notes banner */}
      <div style={{ display: "grid", gridTemplateColumns: "112px repeat(5, 1fr)", background: "var(--ink-50)", borderBottom: "1px solid var(--ink-150)" }}>
        <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--ink-400)", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 500, display: "flex", alignItems: "center" }}>Daily notes</div>
        {[0,1,2,3,4].map(day => {
          const notes = DAILY_NOTES.filter(n => n.day === day);
          return (
            <div key={day} style={{ padding: 6, borderLeft: "1px solid var(--ink-150)", display: "flex", flexDirection: "column", gap: 4, minHeight: 28 }}>
              {notes.map((n, i) => (
                <div key={i} className={n.priority === "urgent" ? "cp-pulse" : ""}
                  style={{
                    fontSize: 10.5, lineHeight: 1.3, padding: "2px 6px", borderRadius: 3,
                    background: n.priority === "urgent" ? "var(--urgent-bg)" : n.priority === "important" ? "var(--important-bg)" : "var(--fyi-bg)",
                    color: n.priority === "urgent" ? "var(--urgent)" : n.priority === "important" ? "var(--important)" : "var(--fyi)",
                    borderLeft: `2px solid ${n.priority === "urgent" ? "var(--urgent)" : n.priority === "important" ? "var(--important)" : "var(--fyi)"}`,
                    fontWeight: n.scope === "personal" ? 500 : 400,
                    fontStyle: n.scope === "personal" ? "italic" : "normal",
                  }}>{n.body}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {SUBJECTS.map(subj => (
          <div key={subj.id} className={`cp-subj ${subj.cls}`} style={{
            display: "grid", gridTemplateColumns: "112px repeat(5, 1fr)",
            borderBottom: "1px solid var(--ink-100)",
          }}>
            {/* Row header */}
            <div style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 6, background: "var(--ink-50)" }}>
              <div style={{ width: 3, height: 16, background: "var(--c)", marginTop: 2, borderRadius: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{subj.name}</div>
                <div style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 1, lineHeight: 1.2 }}>{UNITS[subj.id].weeks}</div>
              </div>
            </div>
            {/* Day cells */}
            {[0,1,2,3,4].map(day => {
              const cards = bySubjDay[subj.id][day];
              const isDrop = dropTarget && dropTarget.subj === subj.id && dropTarget.day === day;
              return (
                <div key={day}
                  onDragOver={(e)=>{e.preventDefault(); setDropTarget({subj: subj.id, day});}}
                  onDragLeave={()=>setDropTarget(null)}
                  onDrop={()=>handleDrop(subj.id, day)}
                  style={{
                    minHeight: 110, padding: 6, borderLeft: "1px solid var(--ink-100)",
                    background: isDrop ? "var(--cl)" : "transparent",
                    display: "flex", flexDirection: "column", gap: 4,
                    transition: "background .12s",
                  }}>
                  {cards.map(l => {
                    const isExpanded = expanded.has(l.id);
                    // Personal mode mirrors Core: show every lesson, but cards
                    // that haven't been forked yet read "from Core" and need a
                    // single click to copy into personal before editing.
                    const unforked = mode === "personal" && !l.isPersonal;
                    return (
                      <div key={l.id}
                        draggable
                        onDragStart={()=>setDragging(l)}
                        onDragEnd={()=>{setDragging(null); setDropTarget(null);}}
                        onClick={()=>toggleExp(l.id)}
                        onContextMenu={(e)=>onLessonContext(e, l)}
                        style={{ opacity: dragging && dragging.id === l.id ? 0.4 : 1, position: "relative" }}>
                        <CPLessonCard lesson={l} state={isExpanded ? "expanded" : "default"} />
                        {unforked && (
                          <div title="From Core curriculum · click to copy into Personalized" style={{
                            position: "absolute", top: 4, right: 4, width: 14, height: 14,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "var(--ink-300)", pointerEvents: "none",
                          }}>
                            <CPIcon name="lock" size={9} />
                          </div>
                        )}
                        {isExpanded && (
                          <div onClick={(e)=>e.stopPropagation()} style={{
                            margin: "-1px 0 0", padding: "8px 10px 9px 14px",
                            background: "var(--ink-50)", border: "1px solid var(--ink-150)", borderTop: "none",
                            borderRadius: "0 0 4px 4px", fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.5,
                            maxHeight: 280, overflow: "auto",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", fontWeight: 500, letterSpacing: 0.5 }}>Directions</div>
                              <button onClick={(e)=>{e.stopPropagation(); toggleExp(l.id);}} style={{ fontSize: 10, color: "var(--ink-400)" }}>Close</button>
                            </div>
                            <div style={{ textWrap: "pretty" }}>{l.directions}</div>
                            {l.notes && (
                              <div style={{ marginTop: 8, padding: "5px 7px", background: "var(--important-bg)", borderRadius: 3, color: "var(--important)", fontSize: 11 }}>
                                <span style={{ fontWeight: 500 }}>Note · </span>{l.notes}
                              </div>
                            )}
                            {/* Lesson tasks — each shown as its own row */}
                            {l.tasks && l.tasks.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", fontWeight: 500, letterSpacing: 0.5 }}>
                                  <svg viewBox="0 0 9 9" width="10" height="10" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
                                  Lesson tasks · {l.tasks.length}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {l.tasks.map(t => <CPLessonTaskRow key={t.id} task={t} parentSubjectId={l.subject} />)}
                                  <button style={{
                                    alignSelf: "flex-start", marginTop: 2, padding: "2px 8px 2px 6px",
                                    fontSize: 10.5, color: "var(--ink-500)", border: "1px dashed var(--ink-200)", borderRadius: 4,
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                  }}>
                                    <CPIcon name="plus" size={9} /> Add task
                                  </button>
                                </div>
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                              {l.standards.map(s => (
                                <span key={s} className="cp-mono" style={{ fontSize: 10, color: "var(--ink-700)", background: "var(--paper)", border: "1px solid var(--ink-200)", padding: "1px 5px", borderRadius: 3 }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <button style={{ flex: 1, minHeight: 28, color: "var(--ink-300)", fontSize: 11, border: "1px dashed transparent", borderRadius: 3 }}
                      onMouseEnter={(e)=>{e.currentTarget.style.borderColor="var(--ink-200)"; e.currentTarget.style.color="var(--ink-400)";}}
                      onMouseLeave={(e)=>{e.currentTarget.style.borderColor="transparent"; e.currentTarget.style.color="var(--ink-300)";}}>
                      <CPIcon name="plus" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      </React.Fragment>
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <CPLessonContextMenu
          lesson={ctxMenu.lesson}
          x={ctxMenu.x}
          y={ctxMenu.y}
          isMaster={mode === "core"}
          onClose={()=>setCtxMenu(null)}
        />
      )}

      {/* Drag hint floating tag — appears while dragging */}
      {dragging && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink-900)", color: "var(--paper)", padding: "6px 12px",
          borderRadius: 999, fontSize: 11.5, boxShadow: "var(--shadow-modal)",
          display: "flex", alignItems: "center", gap: 8, pointerEvents: "none",
        }}>
          <span>Moving <strong>{dragging.title}</strong></span>
          <span style={{ opacity: 0.6 }}>· Drop on a day · Esc to cancel</span>
        </div>
      )}
    </div>
  );
}

// Shared top bar (with view switcher + Core / Personalized toggle)
function CPTopBar({ week = 12, setWeek = ()=>{}, view = "weekly", mode = "personal", setMode = ()=>{}, editingMaster = false, setEditingMaster = ()=>{} }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderBottom: "1px solid var(--ink-150)", background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "linear-gradient(135deg, var(--math), var(--writing))" }} />
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>Grade 5 · 2025–26</div>
      </div>

      {/* View switcher */}
      <div style={{ display: "flex", background: "var(--ink-50)", borderRadius: 6, padding: 2, gap: 1 }}>
        {[
          ["weekly","Weekly"],["daily","Daily"],["schedule","Schedule"],
          ["unit","Unit"],["subject","Subject"],["year","Year"],
        ].map(([id, label]) => (
          <button key={id} style={{
            padding: "4px 10px", fontSize: 12, fontWeight: view === id ? 500 : 400, borderRadius: 4,
            background: view === id ? "var(--paper)" : "transparent",
            color: view === id ? "var(--ink-900)" : "var(--ink-500)",
            boxShadow: view === id ? "0 1px 2px rgba(20,22,32,0.06)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* Week jumper */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={()=>setWeek(Math.max(1, week-1))} style={{ padding: 4, color: "var(--ink-500)" }}><CPIcon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} /></button>
        <div style={{ fontSize: 12, fontWeight: 500, padding: "3px 8px", background: "var(--ink-50)", borderRadius: 4 }}>Week {week}</div>
        <button onClick={()=>setWeek(Math.min(40, week+1))} style={{ padding: 4, color: "var(--ink-500)" }}><CPIcon name="chevron" size={12} /></button>
        <button style={{ fontSize: 11, color: "var(--math)", padding: "2px 6px", fontWeight: 500 }}>Today</button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Global view-mode switch — Grid / Task list / Simple. Persists everywhere. */}
      <CPViewModeSwitch scheduleView={view === "schedule"} />

      {/* Personalized / Core toggle */}
      <div title="Personalized = your own copy · Core = the shared team curriculum (edits sync to everyone)"
        style={{ display: "flex", background: "var(--ink-50)", borderRadius: 999, padding: 2,
          border: mode === "core" ? "1px solid var(--core-mode)" : "1px solid transparent" }}>
        <button onClick={()=>setMode("personal")} title="Just yours" style={{ padding: "3px 12px", fontSize: 11.5, fontWeight: 500, borderRadius: 999,
          background: mode === "personal" ? "var(--paper)" : "transparent",
          color: mode === "personal" ? "var(--ink-900)" : "var(--ink-500)",
          boxShadow: mode === "personal" ? "0 1px 2px rgba(20,22,32,0.06)" : "none" }}>Personalized</button>
        <button onClick={()=>{setMode("core"); setEditingMaster(true);}} title="Shared with the whole Grade 5 team — edits sync to everyone" style={{ padding: "3px 12px", fontSize: 11.5, fontWeight: 500, borderRadius: 999,
          background: mode === "core" ? "var(--core-mode)" : "transparent",
          color: mode === "core" ? "var(--paper)" : "var(--ink-500)" }}>Core</button>
      </div>

      {/* Search */}
      <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: "1px solid var(--ink-200)", borderRadius: 6, color: "var(--ink-500)", fontSize: 12, width: 180 }}>
        <CPIcon name="search" size={12} />
        <span style={{ flex: 1, textAlign: "left" }}>Search…</span>
        <span style={{ fontSize: 10, color: "var(--ink-400)" }}>⌘K</span>
      </button>

      {/* To-do panel toggle */}
      <button style={{ padding: 6, color: "var(--ink-500)", position: "relative" }}>
        <CPIcon name="list" size={16} />
        <span style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 999, background: "var(--urgent)" }} />
      </button>

      {/* Profile */}
      <CPAvatar teacher={ME} size={24} />
    </div>
  );
}

Object.assign(window, { ABLessonCard, ABWeeklyGrid, CPTopBar });
