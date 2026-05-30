// artboards-tasklist.jsx — Task-list views across scopes
//
// One artboard, four scope chips: Day / Week / Unit / Missed. Each scope
// renders a flat checkable task list of lesson events (and their lesson
// tasks). Default state is "collapsed" — each row is a single line that
// reads like a to-do. Clicking a row expands it inline into the full
// lesson event (directions, notes, tasks, resources) so the teacher can
// teach off the same surface they triage from.

// ─────────────────────────────────────────────────────────────────────
// ABTaskListBody — extracted from ABTaskListViews so other artboards
// (Weekly, Schedule, Subject…) can drop the task-list rendering into
// their own shell when the user flips a layout switch.
// ─────────────────────────────────────────────────────────────────────
function ABTaskListBody({ scope = "week", lessons }) {
  const [expandedIds, setExpandedIds] = React.useState(new Set());
  const [statusMap, setStatusMap] = React.useState({});
  const getStatus = (l) => statusMap[l.id] ?? l.status;
  const cycle = (id, current) => setStatusMap(m => ({ ...m, [id]: cycleStatus(current) }));

  const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
  const source = lessons || LESSONS;
  const corpus = scope === "day"   ? source.filter(l => l.day === 1)
              : scope === "unit"   ? source.filter(l => l.subject === "math")
              : scope === "missed" ? CATCHUP_ITEMS.map(i => {
                  const base = source.find(l => l.subject === i.subject) || source[0];
                  return { ...base, id: "missed-"+i.id, subject: i.subject,
                           title: i.title, preview: i.preview, status: i.status,
                           standards: i.standards, resources: [],
                           tasks: [], dayLabel: i.day, weekLabel: `Week ${i.week}`, _missed: true };
                })
              : source;

  // Group by day-of-week for Week scope, subject for Day/Missed, week for Unit.
  const groups = {};
  for (const l of corpus) {
    const k = scope === "day"  ? SUBJECT_BY_ID[l.subject].name
            : scope === "week" ? `${DAYS[l.day]} · ${[9,10,11,12,13][l.day]}`
            : scope === "unit" ? "Week 12"
            : SUBJECT_BY_ID[l.subject].name;
    (groups[k] = groups[k] || []).push(l);
  }

  const toggleExp = (id) => setExpandedIds(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  return (
    <div style={{ padding: "16px 22px 22px" }}>
      {Object.entries(groups).map(([groupName, items]) => (
        <section key={groupName} style={{ marginBottom: 16 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", marginBottom: 4,
            fontSize: 11, fontWeight: 600, color: "var(--ink-500)",
            letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            {groupName}
            <span style={{ color: "var(--ink-300)", fontWeight: 500 }}>· {items.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "var(--paper)",
            border: "1px solid var(--ink-150)", borderRadius: 6, overflow: "hidden" }}>
            {items.map(l => {
              const exp = expandedIds.has(l.id);
              const subj = SUBJECT_BY_ID[l.subject];
              const cur = getStatus(l); const done = cur === "done";
              return (
                <div key={l.id} className={`cp-subj ${subj.cls}`} style={{
                  borderBottom: "1px solid var(--ink-100)",
                  borderLeft: "3px solid var(--c)",
                }}>
                  <div role="button" tabIndex={0} onClick={()=>toggleExp(l.id)} style={{ cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "8px 12px", textAlign: "left",
                    background: exp ? "var(--cl)" : "var(--paper)",
                    transition: "background .15s",
                  }}>
                    <CPCheck status={cur} size={14} onCycle={(next)=>setStatusMap(m=>({...m, [l.id]: next}))} />
                    <span style={{ display: "inline-flex", transform: `rotate(${exp ? 90 : 0}deg)`, transition: "transform .15s", color: "var(--ink-400)" }}>
                      <CPIcon name="chevron" size={10} />
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--c)", flex: "0 0 auto", width: 70 }}>{subj.name}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 500, color: "var(--ink-900)", flex: 1,
                      textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-300)",
                      textWrap: "pretty", display: "flex", flexDirection: "column",
                    }}>
                      {l.title}
                      {l.objective && (
                        <span style={{ fontSize: 10.5, fontStyle: "italic", color: "var(--cd)", marginTop: 1, fontWeight: 400 }}>
                          <span style={{ fontWeight: 600 }}>I can </span>{l.objective.replace(/^I can\s+/i, "")}
                        </span>
                      )}
                    </span>
                    {l.tasks && l.tasks.length > 0 && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "1px 6px 1px 4px", borderRadius: 999,
                        background: "var(--cl)", color: "var(--cd)",
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                      }}>
                        <svg viewBox="0 0 9 9" width="9" height="9" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
                        {l.tasks.length}
                      </span>
                    )}
                    <CPResourceTypeRow resources={l.resources} dense />
                    {l.standards.length > 0 && (
                      <span className="cp-mono" style={{ fontSize: 9.5, color: "var(--ink-500)" }}>{l.standards[0]}</span>
                    )}
                    {l._missed && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--catchup)", padding: "1px 6px", background: "var(--catchup-bg)", borderRadius: 999 }}>MISSED</span>
                    )}
                  </div>
                  {exp && (
                    <div style={{ padding: "10px 14px 14px 38px", background: "color-mix(in oklch, var(--cl) 40%, var(--paper))",
                      borderTop: "1px solid color-mix(in oklch, var(--c) 18%, transparent)",
                      fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.55 }}>
                      <div style={{ fontSize: 10, color: "var(--cd)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Directions</div>
                      <div style={{ textWrap: "pretty" }}>{l.directions}</div>
                      {l.tasks && l.tasks.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 10, color: "var(--cd)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5 }}>Lesson tasks · {l.tasks.length}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {l.tasks.map(t => <CPLessonTaskRow key={t.id} task={t} parentSubjectId={l.subject} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

Object.assign(window, { ABTaskListBody });

function ABTaskListViews() {
  const [scope, setScope] = React.useState("week");
  const [catchupOn, setCatchupOn] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(true);
  const [expandedIds, setExpandedIds] = React.useState(new Set());
  // status overrides per row id — supports the 3-state cycle:
  //   not_done → done → partial → not_done
  const [statusMap, setStatusMap] = React.useState({
    "m-12-2": "done", "uf-12-2": "done",
    "litc-read": "partial", "m-ctr-fluency": "partial",
  });
  const getStatus = (l) => statusMap[l.id] ?? l.status;
  const cycle = (id, current) => setStatusMap(m => ({ ...m, [id]: cycleStatus(current) }));

  // Per-scope corpus
  const DAYS = ["Sun","Mon","Tue","Wed","Thu"];
  const currentDay = 1; // Mon
  const corpus = React.useMemo(() => {
    if (scope === "day") {
      return LESSONS.filter(l => l.day === currentDay).map(l => ({
        ...l, dayLabel: "Mon · Nov 10", weekLabel: "Week 12",
      }));
    }
    if (scope === "week") {
      return LESSONS.map(l => ({
        ...l, dayLabel: DAYS[l.day], weekLabel: "Week 12",
      }));
    }
    if (scope === "unit") {
      // Pretend we're looking at Math Unit 3 across weeks 9–14.
      return LESSONS.filter(l => l.subject === "math").map(l => ({
        ...l, dayLabel: DAYS[l.day], weekLabel: "Week 12",
      }));
    }
    // missed — pull from the synthetic catchup list, hydrated to look like full lessons
    return CATCHUP_ITEMS.map(i => {
      const base = LESSONS.find(l => l.subject === i.subject) || LESSONS[0];
      return {
        ...base,
        id: "missed-"+i.id,
        subject: i.subject,
        title: i.title,
        preview: i.preview,
        directions: i.preview,
        status: i.status,
        standards: i.standards,
        resources: Array.from({length: i.resources}).map((_,k)=>({type: ["pdf","slides","youtube"][k%3], label: "Resource "+(k+1)})),
        tasks: [],
        notes: "",
        dayLabel: i.day,
        weekLabel: `Week ${i.week}`,
        _missed: true,
      };
    });
  }, [scope]);

  // Group by subject (or by day for the "day" scope which is single-day)
  const groups = React.useMemo(() => {
    const out = {};
    if (scope === "day") {
      for (const l of corpus) {
        const k = SUBJECT_BY_ID[l.subject].name;
        (out[k] = out[k] || []).push(l);
      }
    } else if (scope === "week") {
      for (const l of corpus) {
        const k = `${l.dayLabel} · ${[9,10,11,12,13][l.day]}`;
        (out[k] = out[k] || []).push(l);
      }
    } else if (scope === "unit") {
      for (const l of corpus) {
        const k = l.weekLabel;
        (out[k] = out[k] || []).push(l);
      }
    } else {
      for (const l of corpus) {
        const k = SUBJECT_BY_ID[l.subject].name;
        (out[k] = out[k] || []).push(l);
      }
    }
    return out;
  }, [corpus, scope]);

  const allItems = corpus.flat();
  const doneCount = allItems.filter(l => getStatus(l) === "done").length;
  const taskCount = allItems.reduce((a, l) => a + ((l.tasks?.length) || 0), 0);

  const toggleExp = (id) => {
    setCollapsed(false); // expanding any item turns the global mode off
    setExpandedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  // Scope chip labels
  const scopeChips = [
    { id: "day",    lbl: "Day",    sub: "Today · Mon Nov 10" },
    { id: "week",   lbl: "Week",   sub: "Week 12" },
    { id: "unit",   lbl: "Unit",   sub: "Math · Unit 3" },
    { id: "missed", lbl: "Missed", sub: `${CATCHUP_ITEMS.length} uncovered` },
  ];

  return (
    <div className="cp-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <CPTopBar view="weekly" />

      {/* Header */}
      <div style={{ padding: "14px 22px 12px", background: "var(--paper)", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}>
              Task list view
            </div>
            <h1 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>What I need to teach</h1>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>
              Every lesson event and its inner tasks rendered as a flat checklist. Click any row to open it in place.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 14, fontVariantNumeric: "tabular-nums" }}>
            <CPTLStat label="Done" value={doneCount} total={allItems.length} color="var(--done)" />
            <CPTLStat label="Tasks inside" value={taskCount} color="var(--ink-700)" />
            <CPTLStat label="Missed" value={CATCHUP_ITEMS.length} color="var(--catchup)" />
          </div>
        </div>

        {/* Controls row — scope chips + collapse toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginRight: 4 }}>Scope</span>
          {scopeChips.map(c => (
            <button key={c.id} onClick={()=>{ setScope(c.id); setExpandedIds(new Set()); setCollapsed(true); }} style={{
              display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
              padding: "5px 12px", borderRadius: 7, lineHeight: 1.15,
              background: scope === c.id ? (c.id === "missed" ? "var(--catchup)" : "var(--ink-900)") : "var(--paper)",
              color: scope === c.id ? "var(--paper)" : "var(--ink-700)",
              border: `1px solid ${scope === c.id ? "transparent" : "var(--ink-200)"}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{c.lbl}</span>
              <span style={{ fontSize: 9.5, opacity: 0.85, marginTop: 1 }}>{c.sub}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-100)", borderRadius: 6, gap: 1 }}>
            <button onClick={()=>{ setCollapsed(true); setExpandedIds(new Set()); }} style={{
              padding: "4px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 4,
              background: collapsed ? "var(--paper)" : "transparent",
              color: collapsed ? "var(--ink-900)" : "var(--ink-500)",
              boxShadow: collapsed ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <CPIcon name="list" size={11} /> Collapsed
            </button>
            <button onClick={()=>{ setCollapsed(false); setExpandedIds(new Set(allItems.map(l=>l.id))); }} style={{
              padding: "4px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 4,
              background: !collapsed ? "var(--paper)" : "transparent",
              color: !collapsed ? "var(--ink-900)" : "var(--ink-500)",
              boxShadow: !collapsed ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <CPIcon name="grid" size={11} /> Full
            </button>
          </div>
          <button style={{ padding: "4px 10px", fontSize: 11, color: "var(--ink-500)", border: "1px solid var(--ink-200)", borderRadius: 5,
            display: "inline-flex", alignItems: "center", gap: 5 }}>
            <CPIcon name="filter" size={10} /> Filter
          </button>
          <CPCatchupChip active={catchupOn || scope === "missed"} count={CATCHUP_ITEMS.length}
            onClick={()=>setCatchupOn(o=>!o)} dense />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 22px" }}>
        {Object.entries(groups).map(([groupName, items]) => {
          const sample = SUBJECT_BY_ID[items[0].subject];
          return (
            <section key={groupName} style={{ marginBottom: 16 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", marginBottom: 4,
                fontSize: 11, fontWeight: 600, color: "var(--ink-500)",
                letterSpacing: 0.5, textTransform: "uppercase",
              }}>
                {groupName}
                <span style={{ color: "var(--ink-300)", fontWeight: 500 }}>· {items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", background: "var(--paper)",
                border: "1px solid var(--ink-150)", borderRadius: 6, overflow: "hidden" }}>
                {items.map(l => {
                  const exp = expandedIds.has(l.id);
                  const subj = SUBJECT_BY_ID[l.subject];
                  const cur = getStatus(l); const done = cur === "done";
                  return (
                    <div key={l.id} className={`cp-subj ${subj.cls}`} style={{
                      borderBottom: "1px solid var(--ink-100)",
                      borderLeft: "3px solid var(--c)",
                    }}>
                      {/* Collapsed row */}
                      <div role="button" tabIndex={0} onClick={()=>toggleExp(l.id)} style={{ cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "8px 12px", textAlign: "left",
                        background: exp ? "var(--cl)" : "var(--paper)",
                        transition: "background .15s",
                      }}>
                        <CPCheck status={cur} size={14} onCycle={(next)=>setStatusMap(m=>({...m, [l.id]: next}))} />
                        <span style={{ display: "inline-flex", transform: `rotate(${exp ? 90 : 0}deg)`, transition: "transform .15s", color: "var(--ink-400)" }}>
                          <CPIcon name="chevron" size={10} />
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--c)", flex: "0 0 auto", width: scope === "day" ? "auto" : 70 }}>
                          {subj.name}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: "var(--ink-900)", flex: 1,
                          textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-300)",
                          textWrap: "pretty",
                        }}>{l.title}</span>
                        {/* Inline meta in collapsed mode */}
                        {scope !== "day" && (
                          <span style={{ fontSize: 11, color: "var(--ink-400)", flex: "0 0 auto" }}>
                            {l.dayLabel}{scope === "unit" || scope === "missed" ? ` · ${l.weekLabel}` : ""}
                          </span>
                        )}
                        {l.tasks && l.tasks.length > 0 && (
                          <span title={`${l.tasks.length} inner tasks`} style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 6px 1px 4px", borderRadius: 999,
                            background: "var(--cl)", color: "var(--cd)",
                            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, flex: "0 0 auto",
                          }}>
                            <svg viewBox="0 0 9 9" width="9" height="9" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
                            {l.tasks.length}
                          </span>
                        )}
                        <CPResourceTypeRow resources={l.resources} dense />
                        {l.standards.length > 0 && (
                          <span className="cp-mono" style={{ fontSize: 9.5, color: "var(--ink-500)", flex: "0 0 auto" }}>{l.standards[0]}</span>
                        )}
                        {l._missed && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--catchup)", padding: "1px 6px", background: "var(--catchup-bg)", borderRadius: 999, letterSpacing: 0.3 }}>
                            MISSED
                          </span>
                        )}
                      </div>

                      {/* Expanded — full lesson event in place */}
                      {exp && (
                        <div style={{
                          padding: "10px 14px 14px 38px",
                          background: "color-mix(in oklch, var(--cl) 40%, var(--paper))",
                          borderTop: "1px solid color-mix(in oklch, var(--c) 18%, transparent)",
                          fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.55,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: "var(--cd)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Directions</span>
                            <span style={{ flex: 1 }} />
                            <button style={{ fontSize: 11, color: "var(--cd)", padding: "2px 8px", borderRadius: 4, background: "color-mix(in oklch, var(--c) 12%, transparent)" }}>Open in Weekly →</button>
                          </div>
                          <div style={{ textWrap: "pretty" }}>{l.directions}</div>
                          {l.notes && (
                            <div style={{ marginTop: 8, padding: "6px 9px", background: "var(--important-bg)", color: "var(--important)", borderRadius: 4, fontSize: 11.5 }}>
                              <strong>Note · </strong>{l.notes}
                            </div>
                          )}

                          {/* Tasks under this lesson — each as its own checkable row */}
                          {l.tasks && l.tasks.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 10, color: "var(--cd)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                                <svg viewBox="0 0 9 9" width="10" height="10" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
                                Lesson tasks inside this lesson · {l.tasks.length}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {l.tasks.map(t => (
                                  <CPLessonTaskRow key={t.id} task={{ ...t, status: statusMap[t.id] ?? t.status }} onCycle={(next)=>setStatusMap(m=>({...m,[t.id]: next}))} parentSubjectId={l.subject} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Resource type summary inline */}
                          {l.resources && l.resources.length > 0 && (
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, color: "var(--cd)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Resources</span>
                              <CPResourceTypeRow resources={l.resources} />
                              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>· {l.resources.length} total</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {allItems.length === 0 && (
          <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink-400)" }}>
            🎉 Caught up. Nothing in this scope.
          </div>
        )}
      </div>
    </div>
  );
}

function CPTLStat({ label, value, total, color }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>
        {value}{total != null && <span style={{ fontSize: 13, color: "var(--ink-400)", fontWeight: 400 }}> / {total}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { ABTaskListViews });
