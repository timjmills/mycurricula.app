// artboards-todo.jsx — 6 · To-do slide-out + 7 · Core / Personalized banner

function ABTodoPanel() {
  const [tab, setTab] = React.useState("mine");
  const [scope, setScope] = React.useState("all");
  const [tagFilter, setTagFilter] = React.useState(null);
  const [showDone, setShowDone] = React.useState(false);

  const filtered = TODOS.filter(t => {
    if (tab === "mine" && t.scope !== "personal") return false;
    if (tab === "team" && t.scope !== "team") return false;
    if (scope !== "all" && t.scopeKind !== scope) return false;
    if (tagFilter && !t.tags.includes(tagFilter)) return false;
    if (!showDone && t.done) return false;
    return true;
  });

  // Group by due
  const groups = {};
  filtered.forEach(t => {
    const k = t.due || "later";
    (groups[k] = groups[k] || []).push(t);
  });
  const order = ["overdue", "today", "tomorrow", "thisweek", "later", "nodate"];
  const groupLabel = { overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", thisweek: "This week", later: "Later", nodate: "No date" };

  return (
    <div className="cp-root" style={{ display: "flex", height: "100%", background: "rgba(20,22,32,.18)" }}>
      {/* Faint page hint behind */}
      <div style={{ flex: 1, padding: 20, color: "var(--ink-300)", fontSize: 12 }}>
        <div style={{ background: "var(--paper)", borderRadius: 6, height: "100%", padding: 24, opacity: 0.55 }}>
          <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Weekly grid (dimmed)</div>
        </div>
      </div>

      {/* Slide-out */}
      <div style={{
        width: 420, background: "var(--paper)", boxShadow: "-8px 0 24px rgba(20,22,32,.10)",
        display: "flex", flexDirection: "column", borderLeft: "1px solid var(--ink-150)",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px 0", borderBottom: "1px solid var(--ink-100)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>To-dos</h2>
            <div style={{ flex: 1 }} />
            <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px 5px 8px", background: "var(--math)", color: "white", borderRadius: 5, fontSize: 12, fontWeight: 500 }}>
              <CPIcon name="plus" size={11} /> New
            </button>
            <button style={{ padding: 6, marginLeft: 4, color: "var(--ink-500)" }}><CPIcon name="x" size={14} /></button>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
            {[
              { id: "mine", label: "Mine", count: TODOS.filter(t=>t.scope==="personal" && !t.done).length },
              { id: "team", label: "Team", count: TODOS.filter(t=>t.scope==="team" && !t.done).length },
            ].map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding: "7px 14px 9px", fontSize: 13, fontWeight: 500,
                color: tab === t.id ? "var(--ink-900)" : "var(--ink-500)",
                borderBottom: `2px solid ${tab === t.id ? "var(--math)" : "transparent"}`,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {t.label}
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 999, fontVariantNumeric: "tabular-nums",
                  background: tab === t.id ? "var(--math-50)" : "var(--ink-100)",
                  color: tab === t.id ? "var(--math)" : "var(--ink-500)",
                  fontWeight: 600,
                }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--ink-100)", background: "var(--ink-50)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All" },
              { id: "lesson", label: "Lesson" },
              { id: "subject", label: "Subject" },
              { id: "day", label: "Day" },
              { id: "general", label: "General" },
            ].map(s => (
              <button key={s.id} onClick={()=>setScope(s.id)} style={{
                padding: "3px 9px", fontSize: 11, fontWeight: 500,
                background: scope === s.id ? "var(--ink-900)" : "var(--paper)",
                color: scope === s.id ? "var(--paper)" : "var(--ink-700)",
                border: `1px solid ${scope === s.id ? "var(--ink-900)" : "var(--ink-200)"}`,
                borderRadius: 999,
              }}>{s.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginRight: 2 }}>Tag</span>
            {TAGS.map(tg => (
              <button key={tg.id} onClick={()=>setTagFilter(f => f === tg.id ? null : tg.id)} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px 2px 6px", fontSize: 11, fontWeight: 500,
                background: tagFilter === tg.id ? tg.bg : "var(--paper)",
                color: tagFilter === tg.id ? tg.fg : "var(--ink-700)",
                border: `1px solid ${tagFilter === tg.id ? tg.fg : "var(--ink-200)"}`,
                borderRadius: 999, opacity: tagFilter && tagFilter !== tg.id ? 0.45 : 1,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: tg.fg }} /> {tg.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ink-500)" }}>
              <input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)} style={{ accentColor: "var(--math)" }} />
              Show done
            </label>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {order.filter(k => groups[k]).map(k => (
            <section key={k}>
              <div style={{
                padding: "9px 18px 5px", fontSize: 10, color: "var(--ink-500)",
                fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--paper)", position: "sticky", top: 0, zIndex: 1,
                borderBottom: "1px solid var(--ink-100)",
              }}>
                {groupLabel[k]}
                <span style={{ color: "var(--ink-300)", fontWeight: 500 }}>· {groups[k].length}</span>
              </div>
              {groups[k].map(t => {
                const tagObjs = t.tags.map(id => TAGS.find(tg => tg.id === id)).filter(Boolean);
                return (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 18px",
                    borderBottom: "1px solid var(--ink-100)",
                    background: t.due === "overdue" ? "color-mix(in oklch, var(--catchup) 4%, transparent)" : "transparent",
                  }}>
                    <div style={{ paddingTop: 1 }}>
                      <CPCheck status={t.done ? "done" : "not_done"} size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, lineHeight: 1.4, color: t.done ? "var(--ink-400)" : "var(--ink-900)",
                        textDecoration: t.done ? "line-through" : "none", textDecorationColor: "var(--ink-300)",
                        fontWeight: 500, textWrap: "pretty",
                      }}>{t.title}</div>
                      {t.context && (
                        <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <CPIcon name="link" size={9} /> {t.context}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {tagObjs.map(tg => (
                          <span key={tg.id} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "1px 7px 1px 5px", fontSize: 10, fontWeight: 500,
                            background: tg.bg, color: tg.fg, borderRadius: 999,
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: tg.fg }} />
                            {tg.label}
                          </span>
                        ))}
                        <span style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>
                          {t.scopeKind}
                        </span>
                      </div>
                    </div>
                    {t.scope === "team" && (
                      <CPAvatar teacher={TEACHERS.find(x => x.id === t.assignee) || ME} size={20} />
                    )}
                  </div>
                );
              })}
            </section>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", fontSize: 12, color: "var(--ink-400)" }}>
              Nothing matches these filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7 · CORE / PERSONALIZED toggle + editing-Core banner
// ─────────────────────────────────────────────────────────────────────
function ABCorePersonalToggle() {
  const [mode, setMode] = React.useState("personal");
  const isMaster = mode === "core";

  return (
    <div className="cp-root" style={{ height: "100%", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      <CPTopBar view="weekly" mode={mode} />

      {/* Banner */}
      {isMaster && (
        <div style={{
          background: "var(--important)",
          color: "var(--paper)",
          padding: "10px 18px",
          display: "flex", alignItems: "center", gap: 12,
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 1px 0 rgba(20,22,32,.08), 0 2px 8px rgba(207,114,33,.25) inset",
          borderTop: "1px solid color-mix(in oklch, var(--important) 70%, black)",
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            background: "rgba(255,255,255,.18)",
          }}>
            <CPIcon name="warning" size={14} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Editing the Core Curriculum</div>
            <div style={{ fontSize: 11.5, opacity: 0.9, fontWeight: 400 }}>
              Changes will sync to all 4 teachers on the Grade 5 team. Mr. Diallo and Ms. Park are editing right now.
            </div>
          </div>
          <div style={{ display: "flex", gap: -6, marginRight: 4 }}>
            {TEACHERS.slice(0, 3).map((t, i) => (
              <div key={t.id} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--important)", borderRadius: 999 }}>
                <CPAvatar teacher={t} size={22} />
              </div>
            ))}
          </div>
          <button style={{
            padding: "5px 12px", background: "var(--paper)", color: "var(--important)",
            borderRadius: 5, fontSize: 12, fontWeight: 600,
          }}>Back to my plan</button>
        </div>
      )}

      {/* Toggle showcase */}
      <div style={{ padding: 28, flex: 1, overflow: "auto" }}>
        <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 8 }}>The toggle (top bar, detail view)</div>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 32 }}>
          {/* Compact segmented */}
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 6 }}>Compact segmented (used in top bar)</div>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--ink-100)", borderRadius: 7, gap: 2 }}>
              {[
                { id: "personal", label: "Personalized", icon: "user" },
                { id: "core",   label: "Core", icon: "users" },
              ].map(opt => (
                <button key={opt.id} onClick={()=>setMode(opt.id)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                  background: mode === opt.id ? "var(--paper)" : "transparent",
                  color: mode === opt.id ? "var(--ink-900)" : "var(--ink-500)",
                  boxShadow: mode === opt.id ? "0 1px 2px rgba(20,22,32,.08)" : "none",
                }}>
                  <CPIcon name={opt.icon} size={12} /> {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inline detail view toggle */}
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 6 }}>Per-lesson toggle (lesson detail)</div>
            <div style={{
              display: "inline-flex", border: "1px solid var(--ink-200)", borderRadius: 6, overflow: "hidden",
              background: "var(--paper)",
            }}>
              {[
                { id: "personal", label: "Personalized", sub: "Just for you" },
                { id: "core",   label: "Core",   sub: "Shared with team" },
              ].map((opt, i) => (
                <button key={opt.id} onClick={()=>setMode(opt.id)} style={{
                  padding: "8px 14px", textAlign: "left",
                  borderLeft: i ? "1px solid var(--ink-150)" : "none",
                  background: mode === opt.id ? (opt.id === "core" ? "var(--important-bg)" : "var(--math-50)") : "var(--paper)",
                  minWidth: 130,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: mode === opt.id ? (opt.id === "core" ? "var(--important)" : "var(--math)") : "var(--ink-700)" }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Example: how lesson cards look in Core vs personal */}
        <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 8 }}>
          How lessons look in {isMaster ? "Core" : "Personalized"} mode
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 760 }}>
          {[LESSONS[0], LESSONS[3], LESSONS[5]].map(l => {
            const subj = SUBJECT_BY_ID[l.subject];
            const showsAsPersonal = !isMaster && l.isPersonal;
            const isMasterEdit = isMaster && l.isPersonal && l.pendingMaster;
            return (
              <div key={l.id} className={`cp-subj ${subj.cls}`} style={{
                background: "var(--paper)",
                border: isMasterEdit ? "1.5px solid var(--important)" : `1px solid var(--ink-150)`,
                borderLeft: `3px solid var(--c)`,
                borderRadius: 5, padding: "10px 12px",
                boxShadow: isMasterEdit ? "0 2px 0 var(--important-bg)" : "none",
              }}>
                <div style={{ fontSize: 10, color: "var(--c)", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                  {subj.name}
                  {showsAsPersonal && <span style={{ color: "var(--ink-400)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· yours</span>}
                  {isMasterEdit && <span style={{ color: "var(--important)", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· Core update pending</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, lineHeight: 1.3 }}>{l.title}</div>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 6 }}>
                  {isMaster ? "Affects all teachers" : "Only you see this"}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, padding: 14, background: "var(--ink-50)", borderRadius: 5, fontSize: 12, color: "var(--ink-700)", maxWidth: 760, lineHeight: 1.55 }}>
          <strong style={{ color: "var(--ink-900)" }}>Design intent.</strong> The toggle is calm; the <em>state</em> is loud. When you're in Core mode the entire view gains a persistent orange banner with collaborator presence, and every editable surface picks up an orange edge. Personal mode is the default — adding a personal copy of a Core lesson never asks for confirmation.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ABTodoPanel, ABCorePersonalToggle });
