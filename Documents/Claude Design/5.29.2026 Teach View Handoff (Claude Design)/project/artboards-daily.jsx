// artboards-daily.jsx
//   3 · Two-pane Daily layout (with all three right-pane states as Tweaks)
//   4 · Today dashboard (standalone)
//   7 · Right-side lesson detail panel (standalone)

// ─────────────────────────────────────────────────────────────────────
// Reusable right-pane: LESSON DETAIL
// ─────────────────────────────────────────────────────────────────────
function CPLessonDetail({ lesson, compact }) {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [dirOpen, setDirOpen] = React.useState(true);
  const [notesHover, setNotesHover] = React.useState(false);

  return (
    <div className={`cp-subj ${subj.cls}`} style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--c)", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase" }}>
          <span style={{ width: 8, height: 8, background: "var(--c)", borderRadius: 1 }} />
          {subj.name}
          <span style={{ color: "var(--ink-300)" }}>·</span>
          <span style={{ color: "var(--ink-500)", textTransform: "none", letterSpacing: 0 }}>{UNITS[lesson.subject].name}</span>
          {lesson.isPersonal && (
            <>
              <span style={{ color: "var(--ink-300)" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ink-700)", textTransform: "none", letterSpacing: 0 }}>
                <CPForkDot pending={lesson.pendingMaster} /> Personal
              </span>
            </>
          )}
        </div>
        <h2 style={{ margin: "8px 0 0", fontSize: compact ? 17 : 19, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.25, textWrap: "balance" }}>{lesson.title}</h2>
        {lesson.objective && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 8, padding: "7px 10px",
            background: "var(--cl)", border: "1px solid color-mix(in oklch, var(--c) 25%, transparent)",
            borderRadius: 5, color: "var(--cd)" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: "var(--c)", color: "var(--paper)", flex: "0 0 auto", marginTop: 1, textTransform: "uppercase" }}>I can</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1, color: "var(--ink-900)" }}>{lesson.objective.replace(/^I can\s+/i, "")}</span>
          </div>
        )}
        {/* Optional note — appears for any non-done lesson */}
        {lesson.status !== "done" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--ink-500)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5 }}>
              <CPIcon name="edit" size={11} /> Add a note <span style={{ color: "var(--ink-400)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
            </div>
            <textarea
              defaultValue={lesson.reasonNotDone || ""}
              placeholder="Anything worth remembering — what worked, what didn't, what to try next time…"
              style={{
                width: "100%", minHeight: 48, padding: "7px 10px",
                background: lesson.reasonNotDone ? "var(--catchup-bg)" : "var(--paper)",
                border: lesson.reasonNotDone ? "1px solid color-mix(in oklch, var(--catchup) 35%, transparent)" : "1px dashed var(--ink-200)",
                borderRadius: 5, fontSize: 12.5, lineHeight: 1.5,
                color: "var(--ink-900)", resize: "vertical", outline: "none", fontFamily: "inherit",
              }} />
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", border: "1px solid var(--ink-200)", borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
            <CPCheck status={lesson.status} size={14} /> {lesson.status === "done" ? "Done" : "Mark done"}
          </button>
          <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid var(--ink-200)", borderRadius: 6, fontSize: 12, color: "var(--ink-700)" }}>
            <CPIcon name="dots" size={12} /> Status
          </button>
          <div style={{ flex: 1 }} />
          <button style={{ padding: 6, color: "var(--ink-500)" }}><CPIcon name="print" size={14} /></button>
          <button style={{ padding: 6, color: "var(--ink-500)" }}><CPIcon name="dots" size={14} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "14px 20px" }}>
        {/* Directions — collapsible */}
        <section style={{ marginBottom: 16 }}>
          <button onClick={()=>setDirOpen(o=>!o)} style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase",
            padding: "4px 0", marginBottom: 8,
          }}>
            <span style={{ transform: `rotate(${dirOpen ? 90 : 0}deg)`, transition: "transform .15s", display: "inline-flex" }}>
              <CPIcon name="chevron" size={10} />
            </span>
            Directions
          </button>
          {dirOpen && (
            <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55, textWrap: "pretty" }}>
              {lesson.directions}
            </div>
          )}
        </section>

        {/* Notes — hover reveal */}
        <section style={{ marginBottom: 16 }}
          onMouseEnter={()=>setNotesHover(true)}
          onMouseLeave={()=>setNotesHover(false)}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase",
            padding: "4px 0", marginBottom: 8,
          }}>
            <CPIcon name="eye" size={11} /> My notes <span style={{ color: "var(--ink-300)", textTransform: "none", letterSpacing: 0 }}>(hover to reveal)</span>
          </div>
          {lesson.notes ? (
            <div style={{
              fontSize: 13, lineHeight: 1.55, color: "var(--ink-700)",
              padding: "10px 12px", background: notesHover ? "var(--important-bg)" : "var(--ink-50)",
              borderLeft: `2px solid ${notesHover ? "var(--important)" : "var(--ink-200)"}`,
              borderRadius: "0 4px 4px 0",
              filter: notesHover ? "none" : "blur(3.5px)",
              transition: "filter .18s, background .18s",
              userSelect: notesHover ? "auto" : "none",
              textWrap: "pretty",
            }}>{lesson.notes}</div>
          ) : (
            <button style={{ fontSize: 12, color: "var(--ink-400)", padding: "8px 0" }}>+ Add a note</button>
          )}
        </section>

        {/* Lesson tasks — each task is a sub-event with its own check, title, resources, standards */}
        {lesson.tasks && lesson.tasks.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase", padding: "4px 0", marginBottom: 8 }}>
              <svg viewBox="0 0 9 9" width="11" height="11" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
              Lesson tasks · {lesson.tasks.length}
              <span style={{ color: "var(--ink-300)", textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 11 }}>
                each task has its own check, resources, and standards
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {lesson.tasks.map(t => <CPLessonTaskRow key={t.id} task={t} parentSubjectId={lesson.subject} />)}
              <button style={{
                alignSelf: "flex-start", marginTop: 4, padding: "4px 10px 4px 8px",
                fontSize: 11.5, color: "var(--ink-500)", border: "1px dashed var(--ink-200)", borderRadius: 4,
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <CPIcon name="plus" size={10} /> Add task
              </button>
            </div>
          </section>
        )}

        {/* Resources — Padlet-style drawer */}
        {lesson.resources.length > 0 && (
          <CPLessonResourcesDrawer lesson={lesson} />
        )}

        {/* Inline comment thread — short by default, expandable */}
        <section style={{ marginBottom: 18, paddingTop: 14, borderTop: "1px solid var(--ink-100)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase" }}>
              Team comments · {CP_SAMPLE_COMMENTS.length}
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>Visible to all 5th-grade teachers</span>
          </div>
          <CPCommentThread comments={CP_SAMPLE_COMMENTS} compact={compact} onSeeAll={()=>{}} />
        </section>

        {/* Standards */}
        {lesson.standards.length > 0 && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase", padding: "4px 0", marginBottom: 8 }}>
              Standards · {lesson.standards.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lesson.standards.map(code => (
                <div key={code} style={{ display: "flex", gap: 10, padding: "8px 10px", background: "var(--ink-50)", borderRadius: 5 }}>
                  <span className="cp-mono" style={{ fontSize: 11, color: "var(--ink-900)", fontWeight: 500, flex: "0 0 auto", marginTop: 1 }}>{code}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.4, textWrap: "pretty" }}>{STANDARDS[code]}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lesson resources drawer — Padlet-style drop-down inside lesson detail.
// Closed: one row showing a type-icon summary + total count + a chevron.
// Open: a 2-up tile grid of Padlet-style cards (same shape as the
// Resources board), drag-reorderable in production, plus a "+ Post"
// inline composer chip.
// ─────────────────────────────────────────────────────────────────────
function CPLessonResourcesDrawer({ lesson }) {
  const [open, setOpen] = React.useState(true);
  const subj = SUBJECT_BY_ID[lesson.subject];
  // Synthesize Padlet-card-shaped objects from the lesson's resource refs
  // so we can reuse the CPResThumb component from the resources artboard.
  // The thumb component already handles every type (pdf, youtube, image,
  // doc, slides, link).
  const cards = lesson.resources.map((r, i) => ({
    id: `lr-${lesson.id}-${i}`,
    kind: r.type === "website" ? "link" : r.type,
    title: r.label,
    caption: r.caption || "",
  }));

  return (
    <section style={{ marginBottom: 16 }}>
      <button onClick={()=>setOpen(o => !o)} className={`cp-subj ${subj.cls}`}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "8px 12px", textAlign: "left",
          background: open ? "var(--cl)" : "var(--ink-50)",
          border: `1px solid ${open ? "color-mix(in oklch, var(--c) 25%, transparent)" : "var(--ink-150)"}`,
          borderRadius: 6,
          transition: "background .15s",
        }}>
        <span style={{ display: "inline-flex", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s", color: open ? "var(--cd)" : "var(--ink-500)" }}>
          <CPIcon name="chevron" size={11} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: open ? "var(--cd)" : "var(--ink-900)" }}>
          Lesson resources
        </span>
        <span style={{ fontSize: 11, color: open ? "var(--cd)" : "var(--ink-500)", opacity: 0.8 }}>· {lesson.resources.length}</span>
        <div style={{ flex: 1 }} />
        <CPResourceTypeRow resources={lesson.resources} dense />
        <span onClick={(e)=>{e.stopPropagation();}} style={{
          fontSize: 11, color: open ? "var(--cd)" : "var(--ink-500)",
          padding: "2px 8px 2px 6px", borderRadius: 999,
          background: open ? "color-mix(in oklch, var(--c) 18%, transparent)" : "transparent",
          display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 500,
          cursor: "pointer",
        }}>
          <CPIcon name="plus" size={10} /> Post
        </span>
      </button>

      {open && (
        <div className={`cp-subj ${subj.cls}`} style={{
          padding: "12px 12px 4px",
          background: "color-mix(in oklch, var(--cl) 50%, transparent)",
          border: "1px solid color-mix(in oklch, var(--c) 18%, transparent)",
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          marginTop: -4,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 10,
            marginBottom: 8,
          }}>
            {cards.map(c => <CPResCard key={c.id} card={c} />)}
            <button style={{
              minHeight: 150, border: "1.5px dashed color-mix(in oklch, var(--c) 35%, transparent)", borderRadius: 8,
              background: "transparent",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, color: "var(--cd)", fontSize: 12, fontWeight: 500,
            }} onMouseEnter={(e)=>{e.currentTarget.style.background = "color-mix(in oklch, var(--c) 8%, transparent)";}}
              onMouseLeave={(e)=>{e.currentTarget.style.background = "transparent";}}>
              <CPIcon name="plus" size={16} />
              <span>Add resource</span>
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: "1px solid color-mix(in oklch, var(--c) 15%, transparent)", marginTop: 4 }}>
            <span style={{ fontSize: 10.5, color: "var(--cd)", fontWeight: 500, letterSpacing: 0.3, textTransform: "uppercase" }}>Tools</span>
            {[
              ["arrowR","Upload"],
              ["image","Photo"],
              ["sparkle","AI"],
              ["link","Link"],
              ["search","Search"],
              ["youtube","Embed"],
            ].map(([icon, lbl], i) => (
              <button key={i} title={lbl} style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24, borderRadius: 5, color: "var(--cd)",
                background: "var(--paper)", border: "1px solid color-mix(in oklch, var(--c) 25%, transparent)",
              }} onMouseEnter={(e)=>e.currentTarget.style.background = "var(--cl)"}
                onMouseLeave={(e)=>e.currentTarget.style.background = "var(--paper)"}>
                <CPIcon name={icon} size={12} />
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button style={{ fontSize: 11, color: "var(--cd)", fontWeight: 500 }}>
              Open full resource board →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reusable right-pane: NOTES EDITOR (Schedule view, non-academic block)
// ─────────────────────────────────────────────────────────────────────
function CPNotesEditor({ block }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)" }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase" }}>
          Non-academic · {block.start}–{block.end}
        </div>
        <h2 style={{ margin: "6px 0 0", fontSize: 19, fontWeight: 600, letterSpacing: -0.2 }}>{block.label}</h2>
        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>Notes only — no curriculum content here.</div>
      </div>
      <div style={{ flex: 1, padding: "14px 20px", overflow: "auto" }}>
        <textarea
          defaultValue={"Pickup Maya from PE at 1:35 — early debate club. Reminder: send field-trip permission slips to office before dismissal."}
          style={{
            width: "100%", minHeight: 180, padding: 12, border: "1px solid var(--ink-150)", borderRadius: 6,
            fontSize: 13, lineHeight: 1.55, color: "var(--ink-700)", resize: "vertical",
            background: "var(--paper)", outline: "none",
          }} />
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Previous</div>
          <div style={{ fontSize: 12, color: "var(--ink-400)", padding: "8px 10px", background: "var(--ink-50)", borderRadius: 4, lineHeight: 1.5 }}>
            <span style={{ color: "var(--ink-500)" }}>Mon ·</span> Skipped lunch supervision rotation — covered by Sarah.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reusable right-pane: TODAY DASHBOARD
// ─────────────────────────────────────────────────────────────────────
function CPTodayDashboard({ slim }) {
  const todayLessons = LESSONS.filter(l => l.day === 1);
  const doneCount = todayLessons.filter(l => l.status === "done").length;
  const totalCount = todayLessons.length;
  const todoToday = TODOS.filter(t => t.due === "today");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase" }}>Today</div>
        <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.1 }}>Mon, 10 Nov</h2>
        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>Week 12 · Half-day · No specials Period 4</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 20px" }}>
        {/* Progress strip */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.6, fontVariantNumeric: "tabular-nums" }}>{doneCount}</span>
            <span style={{ fontSize: 14, color: "var(--ink-500)" }}>of {totalCount} done</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>{Math.round(doneCount/totalCount * 100)}%</span>
          </div>
          <div style={{ display: "flex", gap: 2, height: 6, borderRadius: 999, overflow: "hidden", background: "var(--ink-100)" }}>
            {todayLessons.map(l => (
              <div key={l.id} className={`cp-subj ${SUBJECT_BY_ID[l.subject].cls}`} style={{
                flex: 1, background: l.status === "done" ? "var(--c)" : l.status === "partial" ? "var(--cl)" : "var(--ink-100)",
              }} />
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 4, gap: 2 }}>
            {todayLessons.map(l => (
              <div key={l.id} style={{ flex: 1, fontSize: 9, color: "var(--ink-400)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.4 }}>
                {SUBJECT_BY_ID[l.subject].name.slice(0,3)}
              </div>
            ))}
          </div>
        </div>

        {/* Daily notes */}
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase" }}>Today's notes</div>
            <button style={{ fontSize: 11, color: "var(--math)", display: "inline-flex", alignItems: "center", gap: 3 }}><CPIcon name="plus" size={10} /> Add</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {DAILY_NOTES.filter(n => n.day === 1).map((n, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "6px 9px", borderRadius: 4,
                background: n.priority === "urgent" ? "var(--urgent-bg)" : n.priority === "important" ? "var(--important-bg)" : "var(--fyi-bg)",
                borderLeft: `2px solid ${n.priority === "urgent" ? "var(--urgent)" : n.priority === "important" ? "var(--important)" : "var(--fyi)"}`,
              }}>
                <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-700)", flex: 1, fontStyle: n.scope === "personal" ? "italic" : "normal" }}>{n.body}</span>
                <span style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 2 }}>{n.scope === "shared" ? "team" : "mine"}</span>
              </div>
            ))}
            {DAILY_NOTES.filter(n => n.day === 1).length === 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>Nothing for today.</div>
            )}
          </div>
        </section>

        {/* Day shoutbox — flat team thread, distinct from notes */}
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
              Day shoutbox <span style={{ display: "inline-flex", padding: "1px 5px", background: "var(--fyi-bg)", color: "var(--fyi)", borderRadius: 999, fontSize: 9, letterSpacing: 0.3 }}>TEAM CHAT</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{CP_SAMPLE_SHOUTS.length} today</span>
          </div>
          <div style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 5, border: "1px solid var(--ink-100)" }}>
            <CPShoutbox messages={CP_SAMPLE_SHOUTS} compact={slim} />
          </div>
        </section>

        {/* Today's to-dos (read-only slice) */}
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", letterSpacing: 0.6, textTransform: "uppercase" }}>Today's to-dos · {todoToday.length}</div>
            <button style={{ fontSize: 11, color: "var(--math)" }}>Open list →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {todoToday.slice(0, slim ? 4 : 8).map(t => {
              const tagObjs = t.tags.map(id => TAGS.find(tg => tg.id === id)).filter(Boolean);
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "6px 0",
                  borderBottom: "1px solid var(--ink-100)",
                }}>
                  <CPCheck status={t.done ? "done" : "not_done"} size={14} />
                  <span style={{
                    flex: 1, fontSize: 12.5, lineHeight: 1.4,
                    color: t.done ? "var(--ink-400)" : "var(--ink-900)",
                    textDecoration: t.done ? "line-through" : "none", textDecorationColor: "var(--ink-300)",
                    textWrap: "pretty",
                  }}>{t.title}</span>
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {tagObjs.map(tg => <CPTagDot key={tg.id} tag={tg} />)}
                  </span>
                  {t.scope === "team" && <CPAvatar teacher={TEACHERS.find(x => x.id === t.assignee) || ME} size={16} />}
                </div>
              );
            })}
          </div>
          <button style={{ marginTop: 8, fontSize: 12, color: "var(--ink-500)", padding: "5px 8px", border: "1px dashed var(--ink-200)", borderRadius: 4, width: "100%", textAlign: "left" }}>
            <span style={{ color: "var(--ink-400)" }}>+ Quick-add a to-do…</span>
          </button>
        </section>

        {/* Quick-glance footer */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 5 }}>
            <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Carry-over</div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, color: "var(--catchup)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>2</div>
            <div style={{ fontSize: 11, color: "var(--ink-500)" }}>from last week</div>
          </div>
          <div style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 5 }}>
            <div style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Core updates</div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, color: "var(--important)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>1</div>
            <div style={{ fontSize: 11, color: "var(--ink-500)" }}>awaiting review</div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3 · TWO-PANE DAILY LAYOUT — shows all three right-pane states
// ─────────────────────────────────────────────────────────────────────
function ABDailyTwoPane({ rightPane = "lesson" /* lesson | notes | dashboard */ }) {
  const todayLessons = LESSONS.filter(l => l.day === 1);
  const [selectedId, setSelectedId] = React.useState(rightPane === "lesson" ? "m-12-1" : null);
  const selected = LESSONS.find(l => l.id === selectedId);

  // Resolve which right pane to show based on selection
  let pane;
  if (rightPane === "dashboard" || !selectedId) pane = <CPTodayDashboard />;
  else if (rightPane === "notes") pane = <CPNotesEditor block={{ start: "11:40", end: "12:20", label: "Lunch" }} />;
  else pane = <CPLessonDetail lesson={selected} />;

  return (
    <div className="cp-root" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--paper)" }}>
      <CPTopBar view="daily" />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 0 }}>
        {/* Left list */}
        <div style={{ borderRight: "1px solid var(--ink-150)", background: "var(--ink-50)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px 8px" }}>
            <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase" }}>Monday</div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }}>10 November</div>
            <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
              {todayLessons.filter(l => l.status === "done").length} of {todayLessons.length} done
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "4px 8px 12px" }}>
            {todayLessons.map(l => {
              const subj = SUBJECT_BY_ID[l.subject];
              const sel = rightPane === "lesson" && selectedId === l.id;
              return (
                <button key={l.id} onClick={()=>setSelectedId(l.id)}
                  className={`cp-subj ${subj.cls}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%",
                    padding: "8px 9px", borderRadius: 4, textAlign: "left",
                    background: sel ? "var(--paper)" : "transparent",
                    boxShadow: sel ? "0 1px 2px rgba(20,22,32,.06)" : "none",
                    border: sel ? "1px solid var(--c)" : "1px solid transparent",
                    marginBottom: 1,
                  }}>
                  <span style={{ width: 3, alignSelf: "stretch", background: "var(--c)", borderRadius: 1 }} />
                  <CPCheck status={l.status} size={14} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--c)", fontWeight: 500, letterSpacing: 0.3, textTransform: "uppercase" }}>{subj.name}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-900)", lineHeight: 1.3, textDecoration: l.status === "done" ? "line-through" : "none", textDecorationColor: "var(--ink-300)" }}>{l.title}</div>
                  </div>
                  {l.isPersonal && <CPForkDot pending={l.pendingMaster} />}
                </button>
              );
            })}
            <button onClick={()=>setSelectedId(null)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "8px 12px", borderRadius: 4, textAlign: "left", marginTop: 10,
              background: !selectedId ? "var(--paper)" : "transparent",
              border: !selectedId ? "1px solid var(--ink-200)" : "1px solid transparent",
              fontSize: 12, color: "var(--ink-500)",
            }}>
              <CPIcon name="grid" size={12} /> Today dashboard
            </button>
          </div>
        </div>

        {/* Right pane */}
        <div style={{ minHeight: 0, position: "relative" }}>
          {pane}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4 · TODAY DASHBOARD — standalone artboard
// ─────────────────────────────────────────────────────────────────────
function ABTodayDashboard() {
  return (
    <div className="cp-root" style={{ height: "100%", background: "var(--ink-50)" }}>
      <CPTodayDashboard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7 · RIGHT-SIDE LESSON DETAIL PANEL — standalone, full-height
// ─────────────────────────────────────────────────────────────────────
function ABLessonDetailPanel() {
  const lesson = LESSONS.find(l => l.id === "m-12-1");
  return (
    <div className="cp-root" style={{ height: "100%" }}>
      <CPLessonDetail lesson={lesson} />
    </div>
  );
}

Object.assign(window, {
  CPLessonDetail, CPNotesEditor, CPTodayDashboard,
  ABDailyTwoPane, ABTodayDashboard, ABLessonDetailPanel,
});
