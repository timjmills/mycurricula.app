// artboards-simple.jsx — Purpose-built Simple-mode designs.
//
// Simple mode isn't "Advanced with stuff hidden." It's a redesigned UX:
//   • Bigger touch targets (24px checks, 88px cards, 6px stripes)
//   • Plain-language labels ("Not done yet" / "Done" / "Skipped",
//     "Weeks 9 to 12" not "Wk 9–14")
//   • One primary action per surface; secondary actions live behind
//     "More options" disclosures
//   • No Modified pill, move-arrow, Core↑, comment count, tasks pill,
//     I-Can pill, standards drill-through chips
//   • Suppressed Core / Personalized banner — Simple mode quietly stays
//     in Personalized
//
// Each artboard is a complete screen, designed from the ground up — not
// the dense Advanced surface with flag-hidden chrome. The Tab pairs
// them with side-by-side mode toggles so the team can compare Simple /
// Task / Advanced for each surface.

// ───────────────────────────────────────────────────────────────────
// 1 · Atomic primitives
// ───────────────────────────────────────────────────────────────────

// Big, friendly check. 24px target. Two-tone "Done" / "Not done yet"
// only — Partial / Skipped / Carried live behind "More options" in
// Simple mode, never on the row itself.
const SimpleCheck = ({ done, onCycle, size = 24 }) => (
  <button onClick={(e) => { e.stopPropagation(); onCycle && onCycle(!done); }}
    aria-label={done ? "Done — click to undo" : "Not done — click to mark done"}
    title={done ? "Done" : "Mark as done"}
    style={{
      width: size, height: size, borderRadius: 6, padding: 0,
      background: done ? "var(--done)" : "var(--paper)",
      border: done ? "1.5px solid var(--done)" : "1.5px solid var(--ink-300)",
      color: "#fff", flex: "0 0 auto",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      transition: "background .12s, border-color .12s, transform .08s",
      cursor: "pointer",
    }}>
    {done && <svg width={size - 10} height={size - 10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>}
  </button>
);

// Plain-language status pill. Maps to the same model the Advanced cards
// use — but never abbreviates and never shows "carried" / "pending Core".
const SimpleStatusPill = ({ status }) => {
  const map = {
    done:      { lbl: "Done",         bg: "var(--reading-light)", fg: "var(--reading-deep)" },
    not_done:  { lbl: "Not done yet", bg: "var(--ink-100)",       fg: "var(--ink-500)" },
    partial:   { lbl: "Partly done",  bg: "var(--important-bg)",  fg: "var(--important-deep, #8a5a00)" },
    skipped:   { lbl: "Skipped",      bg: "var(--ink-100)",       fg: "var(--ink-500)" },
    carried:   { lbl: "Moved later",  bg: "var(--catchup-bg)",    fg: "var(--catchup)" },
  };
  const m = map[status] || map.not_done;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, lineHeight: 1.3,
      background: m.bg, color: m.fg,
    }}>{m.lbl}</span>
  );
};

// Single "📎 N" resource indicator. No type breakdown — the Advanced
// card's tinted type-row is too dense for Simple.
const SimpleResCount = ({ resources, big }) => {
  if (!resources || resources.length === 0) return null;
  return (
    <span title={`${resources.length} resource${resources.length === 1 ? "" : "s"}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: big ? 13 : 12, color: "var(--ink-500)", fontWeight: 500,
      }}>
      <svg width={big ? 14 : 13} height={big ? 14 : 13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L14.5 8.5a4 4 0 0 0-5.6-5.6L3.5 8.3" />
      </svg>
      {resources.length} {resources.length === 1 ? "resource" : "resources"}
    </span>
  );
};

// Single "Standards: N" indicator. Not clickable in Simple. The
// Standards drill-through requires the standards chips, which only
// show in Advanced.
const SimpleStdCount = ({ codes, big }) => {
  if (!codes || codes.length === 0) return null;
  return (
    <span title={codes.join(", ")} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: big ? 12.5 : 11.5, color: "var(--ink-500)", fontWeight: 500,
    }}>
      <span className="cp-mono" style={{ fontSize: big ? 10 : 9.5, fontWeight: 600, padding: "1px 5px", background: "var(--ink-100)", color: "var(--ink-700)", borderRadius: 3 }}>CCSS</span>
      {codes.length} standard{codes.length === 1 ? "" : "s"}
    </span>
  );
};

// ───────────────────────────────────────────────────────────────────
// 2 · Simple lesson card — the atomic unit of every Simple surface
// ───────────────────────────────────────────────────────────────────
//
// Spec:
//   • 88px minimum height
//   • 6px subject stripe (Advanced uses 4px)
//   • 16px title, weight 500 (Advanced uses 13px)
//   • 24px check (Advanced uses 14px)
//   • One resource count, one standards count, plain-language status
//   • No Modified pill, move-arrow, Core↑, I-Can, comment count, tasks pill
//   • No dashed stripe — solid only. The mod state still exists in the
//     data model, just hidden in this mode.
//
const SimpleLessonCard = ({ lesson, onClick, selected, dense }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [localStatus, setLocalStatus] = React.useState(lesson.status);
  const status = localStatus;
  const setDone = (d) => setLocalStatus(d ? "done" : "not_done");
  const isDone = status === "done";

  // Simple-mode treatment of the three-tier mod system.
  //   Advanced uses: dashed stripe + "Modified" pill + move-arrow ↔/⤴.
  //   Simple uses:   plain-language pills on the card and a one-line
  //                  meta caption explaining what changed.
  // Same data, just translated for low-floor readability. The full
  // mod state is recoverable by switching to Advanced.
  const modified = !!lesson.modified;
  const moved    = lesson.moved;
  const movedFromLbl = moved === "across-weeks" ? "Moved from last week"
                     : moved === "same-week"   ? "Moved from another day this week"
                     : null;

  return (
    <div onClick={onClick}
      className={`cp-subj ${subj.cls}`}
      style={{
        position: "relative",
        background: "var(--paper)",
        border: selected ? "1.5px solid var(--c)" : "1px solid var(--ink-150)",
        borderRadius: 8,
        minHeight: dense ? 72 : 88,
        paddingLeft: 18, paddingRight: 14,
        paddingTop: dense ? 10 : 14, paddingBottom: dense ? 10 : 14,
        display: "flex", alignItems: "center", gap: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color .12s, box-shadow .12s",
      }}>
      {/* 6px subject stripe — solid in Simple (no dashed pattern). The
          "My version" pill carries the modified state instead. */}
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 6, background: "var(--c)" }} />

      <SimpleCheck done={isDone} onCycle={setDone} size={dense ? 22 : 24} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: dense ? 14.5 : 16, fontWeight: 500, lineHeight: 1.3,
            color: "var(--ink-900)", textWrap: "pretty",
            textDecoration: isDone ? "line-through" : "none",
            textDecorationColor: "var(--ink-300)",
          }}>{lesson.title}</span>
          {modified && <SimpleMyVersionPill />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--cd)" }}>{subj.name}</span>
          {movedFromLbl && <SimpleMovedNote label={movedFromLbl} />}
          <SimpleResCount resources={lesson.resources} />
          <SimpleStdCount codes={lesson.standards} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SimpleStatusPill status={status} />
      </div>
    </div>
  );
};

// "My version" pill — the Simple-mode translation of the Advanced
// "Modified" pill. Soft, neutral-friendly: tells the teacher this card
// has been personalized without shouting. Hover for the explanation.
const SimpleMyVersionPill = ({ size = "sm" }) => (
  <span title="You changed this lesson from the team's version. Your changes only show in your own planner."
    style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: size === "lg" ? "3px 9px" : "2px 8px",
      borderRadius: 999,
      background: "color-mix(in oklch, var(--writing) 14%, var(--paper))",
      color: "var(--writing-deep)",
      fontSize: size === "lg" ? 11.5 : 10.5, fontWeight: 600,
      letterSpacing: 0.2, lineHeight: 1.3,
      border: "1px solid color-mix(in oklch, var(--writing) 30%, var(--paper))",
    }}>
    <svg width={size === "lg" ? 11 : 10} height={size === "lg" ? 11 : 10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 14h3l8-8-3-3-8 8v3z" />
    </svg>
    My version
  </span>
);

// Plain-language move note — the Simple-mode translation of the ↔/⤴ arrow.
const SimpleMovedNote = ({ label }) => (
  <span title="You moved this lesson from its original spot." style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11.5, color: "var(--catchup)", fontWeight: 500,
  }}>
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
    {label}
  </span>
);

// ───────────────────────────────────────────────────────────────────
// 3 · Simple top bar — used on every full-screen Simple artboard
// ───────────────────────────────────────────────────────────────────
const SimpleTopBar = ({ title, subtitle, right, children }) => (
  <div style={{ display: "flex", flexDirection: "column", background: "var(--paper)", borderBottom: "1px solid var(--ink-150)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px 14px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.3, lineHeight: 1.15 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

// Three-way mode pill. Used at top of every artboard. Local state so
// each artboard can be toggled independently for comparison.
const ModePill = ({ mode, onChange, scheduleView }) => {
  const modes = scheduleView
    ? [["simple", "Simple"], ["tasks", "Task list"], ["grid", "Timeline"]]
    : [["simple", "Simple"], ["tasks", "Task list"], ["grid", "Advanced"]];
  return (
    <div style={{ display: "inline-flex", padding: 3, background: "var(--ink-100)", borderRadius: 8, gap: 2 }}>
      {modes.map(([id, lbl]) => {
        const active = mode === id;
        return (
          <button key={id} onClick={() => onChange(id)}
            style={{
              padding: "6px 14px", fontSize: 12.5, fontWeight: 500, borderRadius: 6,
              background: active ? "var(--paper)" : "transparent",
              color: active ? "var(--ink-900)" : "var(--ink-500)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              cursor: "pointer", border: 0,
            }}>{lbl}</button>
        );
      })}
    </div>
  );
};

// Section header inside a Simple artboard
const SimpleSectionHead = ({ kicker, title, hint, right }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "14px 22px 8px", borderBottom: "1px solid var(--ink-100)" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      {kicker && <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>}
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.2 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2, textWrap: "pretty" }}>{hint}</div>}
    </div>
    {right}
  </div>
);

// Empty-day affordance — 40×40 + button per spec
const SimpleAddCell = ({ subjectColor, label = "Drag a lesson here or tap +" }) => (
  <button style={{
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    width: "100%", minHeight: 88,
    background: "transparent",
    border: `1.5px dashed var(--ink-200)`, borderRadius: 8,
    color: "var(--ink-400)", fontSize: 13, fontWeight: 500,
    cursor: "pointer", transition: "all .15s", padding: "10px 14px",
  }}
  onMouseEnter={(e) => { e.currentTarget.style.borderColor = subjectColor; e.currentTarget.style.background = "var(--ink-50)"; e.currentTarget.style.color = "var(--ink-700)"; }}
  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ink-200)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-400)"; }}>
    <span style={{
      width: 40, height: 40, borderRadius: 999,
      background: "var(--ink-100)", color: "var(--ink-500)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, fontWeight: 400, lineHeight: 1, flex: "0 0 auto",
    }}>+</span>
    {label}
  </button>
);

// ───────────────────────────────────────────────────────────────────
// 4 · Helpers for stable per-day grouping
// ───────────────────────────────────────────────────────────────────
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu"];
const TODAY_INDEX = 1; // Mon

const lessonsByDay = () => {
  const out = DAYS.map(() => []);
  LESSONS.forEach(l => { if (l.day != null) out[l.day].push(l); });
  return out;
};
const lessonsBySubjectDay = () => {
  const out = {};
  SUBJECTS.forEach(s => { out[s.id] = DAYS.map(() => []); });
  LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l); });
  return out;
};

// ───────────────────────────────────────────────────────────────────
// 5 · Simple lesson card — artboard
// ───────────────────────────────────────────────────────────────────
const ABSimpleLessonCard = () => {
  // Real demo lessons — lifted from the dataset to show each mod state.
  const baseline   = LESSONS.find(l => l.id === "m-12-0");    // unedited from Core
  const doneOne    = LESSONS.find(l => l.id === "uf-12-2");   // done
  const modifiedOne = LESSONS.find(l => l.id === "w-12-2");   // personally modified
  const movedOne   = LESSONS.find(l => l.id === "m-12-3");    // moved within week
  const movedAcross = LESSONS.find(l => l.id === "w-12-1");   // moved across weeks + carried
  const bothOne    = LESSONS.find(l => l.id === "r-12-1");    // modified + moved
  const selectedOne = LESSONS.find(l => l.id === "r-12-litcenters");

  const Header = ({ kicker, title, hint }) => (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)", marginTop: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2, lineHeight: 1.5, textWrap: "pretty" }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ height: "100%", background: "var(--ink-50)", padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Atomic unit</div>
          <h2 style={{ margin: "3px 0 6px", fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: "var(--ink-900)" }}>Simple lesson card</h2>
          <div style={{ fontSize: 13.5, color: "var(--ink-500)", lineHeight: 1.55, textWrap: "pretty" }}>
            88px tall · 6px stripe · 16px title · 24px check · one resource count · one standards count · plain-language status. Tap the check to mark done; tap anywhere else to open the lesson.
          </div>
        </div>

        {/* ── Default states ────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Header kicker="Default" title="From the team's plan, not started" hint="Solid stripe · plain row · 'Not done yet'." />
          <SimpleLessonCard lesson={baseline} />

          <Header kicker="Done" title="Lesson marked complete" hint="Check turns green. Title gets a soft strike-through." />
          <SimpleLessonCard lesson={{ ...doneOne, status: "done" }} />
        </div>

        {/* ── The three-tier mod system — translated to plain language ── */}
        <div style={{ padding: "16px 18px", background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Personalized states</div>
          <h3 style={{ margin: "4px 0 4px", fontSize: 16, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.2 }}>When you change a lesson from the team plan</h3>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.55, marginBottom: 12, textWrap: "pretty" }}>
            In Advanced mode these states use a dashed stripe + a “Modified” pill + a move-arrow icon (↔ / ⤴). In Simple mode the same information shows as plain-English labels on the card: a soft <strong>My version</strong> pill next to the title and a <strong>Moved from…</strong> note under the subject name. Same data, easier to read.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <Header kicker="Modified" title="You changed the team's lesson" hint="The 'My version' pill marks it as personalized. The original Core lesson is untouched for everyone else." />
              <div style={{ marginTop: 8 }}><SimpleLessonCard lesson={{ ...modifiedOne, modified: true, moved: null, status: "not_done" }} /></div>
            </div>

            <div>
              <Header kicker="Moved · within this week" title="You dragged this to a different day" hint="'Moved from another day this week' caption sits under the subject name." />
              <div style={{ marginTop: 8 }}><SimpleLessonCard lesson={{ ...movedOne, modified: false, moved: "same-week", status: "not_done" }} /></div>
            </div>

            <div>
              <Header kicker="Moved · from a different week" title="You carried this from last week" hint="Captioned as 'Moved from last week'. Pairs cleanly with the catch-up flow." />
              <div style={{ marginTop: 8 }}><SimpleLessonCard lesson={{ ...movedAcross, modified: false, moved: "across-weeks", status: "carried" }} /></div>
            </div>

            <div>
              <Header kicker="Both · modified and moved" title="You changed it and shifted its date" hint="Both indicators sit side-by-side. Still no dashed stripe, still no urgent color — Simple keeps the chrome calm." />
              <div style={{ marginTop: 8 }}><SimpleLessonCard lesson={{ ...bothOne, modified: true, moved: "same-week", status: "not_done" }} /></div>
            </div>
          </div>
        </div>

        {/* ── Side-by-side: Simple vs Advanced for a modified lesson ── */}
        <div style={{ padding: "16px 18px", background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Side-by-side</div>
          <h3 style={{ margin: "4px 0 4px", fontSize: 16, fontWeight: 600, color: "var(--ink-900)", letterSpacing: -0.2 }}>Same lesson — Simple vs Advanced</h3>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.55, marginBottom: 12, textWrap: "pretty" }}>
            The same Reading book-club lesson, modified + moved. Simple translates Advanced indicators into plain text; nothing is lost in the data.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--reading)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Simple</div>
              <SimpleLessonCard lesson={{ ...bothOne, modified: true, moved: "same-week" }} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--catchup)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Advanced</div>
              <CPLessonCard lesson={{ ...bothOne, modified: true, moved: "same-week" }} />
            </div>
          </div>
        </div>

        {/* ── Selected state ───────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Header kicker="Selected" title="Currently open in the Daily view" hint="Subject-color border. No extra chrome." />
          <SimpleLessonCard lesson={selectedOne} selected />
        </div>

        {/* What hides in Simple — reference */}
        <div style={{ padding: 14, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>What still hides in Simple</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11.5 }}>
            {[
              "I Can statement",
              "Preview paragraph",
              "Resource type breakdown",
              "Comment count",
              "Tasks pill",
              "Core ↑ badge",
              "⋯ menu",
              "Right-click submenus",
              "Dashed stripe",
              "↔ / ⤴ arrow icons",
            ].map((k, i) => (
              <span key={i} style={{
                padding: "3px 9px", borderRadius: 999,
                background: "var(--ink-100)", color: "var(--ink-500)", fontWeight: 500,
              }}>{k}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 10, lineHeight: 1.5, textWrap: "pretty" }}>
            These are still in the data — flipping any view to <strong>Advanced</strong> brings them back. Simple just doesn't lead with them.
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 6 · Simple Weekly grid
// ───────────────────────────────────────────────────────────────────
//
// Spec: no catch-up bar, no Core banner, larger lesson cards, 40px +
// button on empty cells. Drag-and-drop reschedules a lesson by sliding
// it to another day; cells stack multiple lessons (e.g. Math + Math
// Centers on the same day).
//
const ABSimpleWeekly = () => {
  const initial = React.useMemo(() => {
    const out = {};
    SUBJECTS.forEach(s => { out[s.id] = DAYS.map(() => []); });
    LESSONS.forEach(l => { if (l.day != null && out[l.subject]) out[l.subject][l.day].push(l.id); });
    return out;
  }, []);
  const [layout, setLayout] = React.useState(initial);
  // dragging = { lessonId, fromSubject, fromDay }
  const [dragging, setDragging] = React.useState(null);
  // dropTarget = { subject, day } — highlights the cell currently being
  // dragged over so the teacher sees where the lesson will land.
  const [dropTarget, setDropTarget] = React.useState(null);

  const subjects = SUBJECTS.filter(s => ["math","reading","writing","ufli","explorers"].includes(s.id));

  const onDragStart = (lessonId, subject, day) => (e) => {
    setDragging({ lessonId, fromSubject: subject, fromDay: day });
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", lessonId); } catch {}
  };
  const onDragEnd = () => { setDragging(null); setDropTarget(null); };
  const onDragOver = (subject, day) => (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(prev => (prev && prev.subject === subject && prev.day === day) ? prev : { subject, day });
  };
  const onDragLeave = () => setDropTarget(null);
  const onDrop = (subject, day) => (e) => {
    if (!dragging) return;
    e.preventDefault();
    setLayout(prev => {
      const next = { ...prev };
      // remove from source — within the same subject grid only (we don't
      // let the teacher accidentally drop Math into the Reading row in
      // Simple; that's an Advanced power-move)
      const src = [...next[dragging.fromSubject]];
      src[dragging.fromDay] = src[dragging.fromDay].filter(id => id !== dragging.lessonId);
      next[dragging.fromSubject] = src;
      // add to target
      const dst = [...next[subject]];
      dst[day] = [...dst[day], dragging.lessonId];
      next[subject] = dst;
      return next;
    });
    onDragEnd();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="This week" subtitle="Week of January 12 to 16"
        right={<button style={primaryBtn()}>+ Add lesson</button>}
      />

      {/* Drag hint — explains the two affordances that aren't visible-by-default */}
      <div style={{
        padding: "10px 18px", background: "var(--paper)", borderBottom: "1px solid var(--ink-150)",
        fontSize: 12, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 14,
        flexWrap: "wrap",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-700)" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="5" cy="4" r="0.9"/><circle cx="5" cy="8" r="0.9"/><circle cx="5" cy="12" r="0.9"/><circle cx="11" cy="4" r="0.9"/><circle cx="11" cy="8" r="0.9"/><circle cx="11" cy="12" r="0.9"/></svg>
          <strong style={{ fontWeight: 600, color: "var(--ink-900)" }}>Drag any lesson</strong>
          to another day to reschedule it.
        </span>
        <span style={{ width: 1, height: 14, background: "var(--ink-200)" }} />
        <span><strong style={{ fontWeight: 600, color: "var(--ink-900)" }}>Stack multiple</strong> lessons in the same day — they fit one on top of the other.</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `120px repeat(${DAYS.length}, 1fr)`,
          gap: 8,
          minWidth: 1100,
        }}>
          {/* header row */}
          <div />
          {DAYS.map((d, i) => (
            <div key={d} style={{
              fontSize: 13, fontWeight: 600,
              color: i === TODAY_INDEX ? "var(--ink-900)" : "var(--ink-500)",
              padding: "2px 4px 6px",
            }}>
              {d}
              {i === TODAY_INDEX && <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 999, background: "var(--ink-900)", color: "var(--paper)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Today</span>}
            </div>
          ))}

          {/* per-subject rows */}
          {subjects.map(s => (
            <React.Fragment key={s.id}>
              <div className={`cp-subj ${s.cls}`} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 0 4px",
              }}>
                <span style={{ width: 6, height: 22, background: "var(--c)", borderRadius: 2 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--cd)" }}>{s.name}</span>
              </div>
              {DAYS.map((_, d) => {
                const ids = layout[s.id][d] || [];
                const isHot = dropTarget && dropTarget.subject === s.id && dropTarget.day === d;
                const isSource = dragging && dragging.fromSubject === s.id && dragging.fromDay === d;
                return (
                  <div key={d}
                    onDragOver={onDragOver(s.id, d)}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop(s.id, d)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 6,
                      borderRadius: 8,
                      padding: isHot ? 4 : 0,
                      background: isHot ? `color-mix(in oklch, var(--${s.id}) 12%, var(--paper))` : "transparent",
                      outline: isHot ? `2px dashed var(--${s.id})` : "none",
                      transition: "background .12s, outline-color .12s",
                      minHeight: 88,
                    }}>
                    {ids.length === 0 ? (
                      <SimpleAddCell subjectColor={`var(--${s.id})`} label={isHot ? `Drop here` : `Add ${s.name.toLowerCase()} lesson`} />
                    ) : (
                      ids.map(id => {
                        const l = LESSONS.find(x => x.id === id);
                        if (!l) return null;
                        return <SimpleDraggableCard key={id} lesson={l} dense
                          onDragStart={onDragStart(id, s.id, d)} onDragEnd={onDragEnd}
                          dimmed={dragging && dragging.lessonId === id} />;
                      })
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Multi-stack call-out — placed under the grid so the teacher
            sees how Math · Mon (which has two lessons) renders by default. */}
        <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, background: "var(--math-light)", color: "var(--math-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "0 0 auto" }}>↕</span>
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5, textWrap: "pretty" }}>
            <strong style={{ color: "var(--ink-900)" }}>See Math on Monday?</strong> Two lessons stacked in the same cell — the bake-sale anchor and a 20-minute Math Centers block. Drop as many as you need into any cell; Simple stacks them vertically, no Advanced toggles required.
          </div>
        </div>
      </div>
    </div>
  );
};

// Draggable variant of SimpleLessonCard — adds a grab handle on hover
// and the HTML5 drag attributes. We don't push these into the base
// SimpleLessonCard because not every Simple context wants drag (the
// Daily list, the Task list, and the Catch-up row use the same primitive
// but shouldn't be draggable).
const SimpleDraggableCard = ({ lesson, dense, onDragStart, onDragEnd, dimmed }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [hovered, setHovered] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState(lesson.status);
  const modified = !!lesson.modified;
  const moved = lesson.moved;
  const movedFromLbl = moved === "across-weeks" ? "Moved from last week"
                     : moved === "same-week"   ? "Moved from another day this week"
                     : null;
  const isDone = localStatus === "done";

  return (
    <div draggable
      onDragStart={onDragStart} onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className={`cp-subj ${subj.cls}`}
      style={{
        position: "relative",
        background: "var(--paper)",
        border: "1px solid var(--ink-150)",
        borderRadius: 8,
        minHeight: dense ? 72 : 88,
        paddingLeft: 18, paddingRight: 14,
        paddingTop: dense ? 10 : 14, paddingBottom: dense ? 10 : 14,
        display: "flex", alignItems: "center", gap: 12,
        overflow: "hidden",
        cursor: dimmed ? "grabbing" : "grab",
        opacity: dimmed ? 0.4 : 1,
        boxShadow: hovered && !dimmed ? "0 2px 8px rgba(20,22,32,.08)" : "none",
        transition: "box-shadow .12s, opacity .12s",
      }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 6, background: "var(--c)" }} />

      {/* Grab handle — visible on hover, hidden when at rest so the card
          reads clean. Touch devices: HTML5 drag still triggers from
          anywhere on the card, so the handle is decorative there. */}
      <span aria-hidden style={{
        opacity: hovered ? 1 : 0,
        transition: "opacity .12s",
        color: "var(--ink-400)", flex: "0 0 auto",
        display: "inline-flex",
      }}>
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="2" cy="7" r="1"/><circle cx="2" cy="12" r="1"/><circle cx="8" cy="2" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="8" cy="12" r="1"/></svg>
      </span>

      <SimpleCheck done={isDone} onCycle={(d) => setLocalStatus(d ? "done" : "not_done")} size={dense ? 22 : 24} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: dense ? 14.5 : 16, fontWeight: 500, lineHeight: 1.3,
            color: "var(--ink-900)", textWrap: "pretty",
            textDecoration: isDone ? "line-through" : "none",
            textDecorationColor: "var(--ink-300)",
          }}>{lesson.title}</span>
          {modified && <SimpleMyVersionPill />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--cd)" }}>{subj.name}</span>
          {movedFromLbl && <SimpleMovedNote label={movedFromLbl} />}
          <SimpleResCount resources={lesson.resources} />
          <SimpleStdCount codes={lesson.standards} />
        </div>
      </div>

      <SimpleStatusPill status={localStatus} />
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 7 · Simple Daily — two pane
// ───────────────────────────────────────────────────────────────────
//
// Spec: left list 64px row height; right pane 14px directions; single
// "Mark done" button + "More options" disclosure. No keyboard hints.
//
const ABSimpleDaily = () => {
  const byDay = React.useMemo(lessonsByDay, []);
  const todays = byDay[TODAY_INDEX];
  const [sel, setSel] = React.useState(todays.find(l => l.id === "m-12-1")?.id || todays[0]?.id);
  const rawLesson = todays.find(l => l.id === sel) || todays[0];
  // Force the m-12-1 demo card into the "modified" state so the detail
  // pane surfaces the My-version banner on first open. Real cards keep
  // whatever modified/moved flags they already carry.
  const lesson = rawLesson.id === "m-12-1" ? { ...rawLesson, modified: true } : rawLesson;
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [status, setStatus] = React.useState(lesson.status);
  const [moreOpen, setMoreOpen] = React.useState(false);
  React.useEffect(() => { setStatus(lesson.status); setMoreOpen(false); }, [lesson.id]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="Monday, January 13" subtitle="Today · 6 lessons planned" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: day list — 64px rows */}
        <div style={{ width: 340, borderRight: "1px solid var(--ink-150)", overflow: "auto", background: "var(--paper)" }}>
          {todays.map(l => {
            const sj = SUBJECT_BY_ID[l.subject];
            const active = l.id === lesson.id;
            const done = l.status === "done";
            return (
              <div key={l.id} onClick={() => setSel(l.id)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(l.id); } }}
                className={`cp-subj ${sj.cls}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", height: 64, padding: "0 14px 0 0",
                  background: active ? "var(--ink-50)" : "var(--paper)",
                  borderLeft: active ? "4px solid var(--c)" : "4px solid transparent",
                  borderBottom: "1px solid var(--ink-100)",
                  cursor: "pointer", textAlign: "left",
                }}>
                <span style={{ width: active ? 0 : 4, height: 32, background: "var(--c)", borderRadius: 2, marginLeft: active ? 14 : 14 }} />
                <SimpleCheck done={done} size={22} onCycle={() => {}} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500, color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-300)" }}>{l.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>{sj.name}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <div className={`cp-subj ${subj.cls}`} style={{
            padding: "22px 28px 0",
            background: "linear-gradient(180deg, var(--cl) 0%, transparent 100%)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--cd)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{subj.name}</div>
              {lesson.modified && <SimpleMyVersionPill size="lg" />}
            </div>
            <h1 style={{ margin: "4px 0 10px", fontSize: 24, fontWeight: 600, letterSpacing: -0.5, color: "var(--ink-900)", textWrap: "pretty", lineHeight: 1.2 }}>{lesson.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <SimpleStatusPill status={status} />
              {lesson.moved && (
                <SimpleMovedNote label={lesson.moved === "across-weeks" ? "Moved from last week" : "Moved from another day this week"} />
              )}
            </div>
            {lesson.modified && (
              <div style={{
                marginTop: 14, padding: "10px 12px",
                background: "color-mix(in oklch, var(--writing) 8%, var(--paper))",
                border: "1px solid color-mix(in oklch, var(--writing) 25%, var(--paper))",
                borderRadius: 8, fontSize: 12.5, color: "var(--writing-deep)",
                lineHeight: 1.5, textWrap: "pretty",
              }}>
                This is <strong>your version</strong> of the team's lesson. Your changes only show up here — your teammates still see the original. Switch to <strong>Core curriculum</strong> if you want to change the team's plan.
              </div>
            )}
          </div>

          <div style={{ padding: "20px 28px 28px" }}>
            <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginTop: 6 }}>What to do</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-700)", marginTop: 6, textWrap: "pretty" }}>
              {lesson.directions}
            </div>

            {lesson.resources.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginTop: 22 }}>Resources</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {lesson.resources.map((r, i) => (
                    <a key={i} href="#" onClick={e => e.preventDefault()} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 14px", background: "var(--paper)",
                      border: "1px solid var(--ink-150)", borderRadius: 8,
                      color: "var(--ink-900)", fontSize: 13.5, fontWeight: 500,
                      textDecoration: "none",
                    }}>
                      <span style={{ width: 28, height: 28, background: "var(--ink-100)", color: "var(--ink-500)", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <CPIcon name={CP_RES_ICON[r.type] || "link"} size={14} />
                      </span>
                      <span style={{ flex: 1 }}>{r.label}</span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-400)" }}>Open →</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Primary action */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 26 }}>
              <button onClick={() => setStatus(status === "done" ? "not_done" : "done")}
                style={status === "done" ? secondaryBtn() : primaryBigBtn()}>
                {status === "done" ? "✓ Done — click to undo" : "Mark as done"}
              </button>
              <button onClick={() => setMoreOpen(v => !v)} style={ghostBtn()}>
                More options {moreOpen ? "▴" : "▾"}
              </button>
            </div>

            {moreOpen && (
              <div style={{ marginTop: 14, padding: 14, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  ["Mark as partly done", "partial"],
                  ["Skip for now", "skipped"],
                  ["Move to another day…", null],
                  ["Add a note…", null],
                  ["Add to my to-do list", null],
                  ["Print this lesson", null],
                ].map(([lbl, val], i) => (
                  <button key={i} onClick={() => val && setStatus(val)} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 6,
                    background: "transparent", color: "var(--ink-900)", fontSize: 13.5, textAlign: "left",
                    border: 0, cursor: "pointer",
                  }} onMouseEnter={e => e.currentTarget.style.background = "var(--ink-50)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{lbl}</button>
                ))}
              </div>
            )}

            {lesson.standards.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--ink-100)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Standards covered</div>
                <div style={{ fontSize: 13, color: "var(--ink-700)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  {lesson.standards.join("  ·  ")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 8 · Simple Schedule — time-blocked
// ───────────────────────────────────────────────────────────────────
const ABSimpleSchedule = () => {
  const blocks = SCHEDULE;
  const fmt = (t) => {
    const [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, "0")} ${ap}`;
  };
  const dur = (s, e) => {
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    const min = (eh * 60 + em) - (sh * 60 + sm);
    if (min >= 60 && min % 60 === 0) return `${min / 60} hour${min / 60 === 1 ? "" : "s"}`;
    if (min >= 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
    return `${min} minutes`;
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="Today's schedule" subtitle="Monday, January 13 · 7 things on your day" />
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {blocks.map((b, i) => {
            const subj = b.subject && SUBJECT_BY_ID[b.subject];
            const lesson = b.lesson && LESSONS.find(l => l.id === b.lesson);
            const isNow = i === 2;
            return (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                {/* time gutter */}
                <div style={{ width: 96, textAlign: "right", paddingTop: 10, flex: "0 0 auto" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.15 }}>{fmt(b.start)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{dur(b.start, b.end)}</div>
                </div>

                {/* card */}
                {subj ? (
                  <div className={`cp-subj ${subj.cls}`} style={{
                    flex: 1, position: "relative", background: "var(--paper)",
                    border: isNow ? "1.5px solid var(--c)" : "1px solid var(--ink-150)",
                    borderRadius: 10, padding: "14px 16px 14px 22px",
                    boxShadow: isNow ? "0 2px 10px color-mix(in oklch, var(--c) 24%, transparent)" : "none",
                  }}>
                    <div style={{ position: "absolute", inset: "0 auto 0 0", width: 6, background: "var(--c)", borderRadius: "10px 0 0 10px" }} />
                    {isNow && <div style={{
                      position: "absolute", top: 10, right: 12,
                      padding: "3px 9px", borderRadius: 999,
                      background: "var(--c)", color: "var(--paper)",
                      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                    }}>▶ Right now</div>}
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--cd)", textTransform: "uppercase", letterSpacing: 0.5 }}>{subj.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-900)", marginTop: 3, textWrap: "pretty", lineHeight: 1.3 }}>
                      {lesson ? lesson.title : "—"}
                    </div>
                    {lesson && (
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
                        <SimpleResCount resources={lesson.resources} />
                        <SimpleStdCount codes={lesson.standards} />
                        <div style={{ flex: 1 }} />
                        <SimpleStatusPill status={lesson.status} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    flex: 1, background: "var(--paper)",
                    border: "1px solid var(--ink-150)", borderRadius: 10,
                    padding: "14px 18px",
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--ink-100)", color: "var(--ink-500)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>·</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-900)" }}>{b.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>Not a lesson — break / morning meeting / lunch</div>
                    </div>
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
// 9 · Simple Subject view
// ───────────────────────────────────────────────────────────────────
//
// Spec: plain-language status words, plain-language week ranges
// ("Weeks 9 to 12"), no standards drill-through chips, no missed-events
// task list.
//
const SIMPLE_WEEK_RANGES = {
  "Wk 9–14":   "Weeks 9 to 14",
  "Wk 7–12":   "Weeks 7 to 12",
  "Wk 10–15":  "Weeks 10 to 15",
  "Wk 8–13":   "Weeks 8 to 13",
  "Wk 12":     "Week 12 only",
  "Wk 9–12":   "Weeks 9 to 12",
  "Wk 8–14":   "Weeks 8 to 14",
};
const plainWeeks = (label) => SIMPLE_WEEK_RANGES[label] || label;

const ABSimpleSubject = () => {
  const subj = SUBJECT_BY_ID.math;
  const unit = UNITS.math;
  // Build 6 weeks of math (Wk 9–14). Real data only has Wk 12 lessons,
  // so we add stub lessons for the other weeks just to show structure.
  const mathLessons = LESSONS.filter(l => l.subject === "math");
  const weeks = [9, 10, 11, 12, 13, 14].map(wk => ({
    wk,
    lessons: wk === 12 ? mathLessons : [
      { id: `m-${wk}-stub`, subject: "math", title: ["Number sense warm-ups", "Equivalent fractions intro", "Adding fractions", "Mid-unit check", "Multiplying fractions", "Unit review"][wk - 9], status: "not_done", resources: [{ type: "slides" }], standards: ["5.NF.A.1"] },
    ],
    label: ["Two weeks ago", "Last week", "This week", "Next week", "In two weeks", "In three weeks"][wk - 9] || `Week ${wk}`,
  }));

  const [openWeek, setOpenWeek] = React.useState(12);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar
        title={subj.name}
        subtitle={`${unit.name.split(" · ")[1]} · ${plainWeeks(unit.weeks)}`}
        right={<button style={primaryBtn()}>+ Add a lesson</button>}
      />
      <div style={{ flex: 1, overflow: "auto" }}>
        {weeks.map(w => {
          const isOpen = w.wk === openWeek;
          const isThisWeek = w.wk === 12;
          return (
            <div key={w.wk}>
              <button onClick={() => setOpenWeek(isOpen ? -1 : w.wk)} style={{
                display: "flex", alignItems: "center", gap: 14, width: "100%",
                padding: "16px 22px", background: isThisWeek ? "color-mix(in oklch, var(--math-light) 35%, var(--paper))" : "var(--paper)",
                borderTop: "1px solid var(--ink-100)", borderBottom: isOpen ? "1px solid var(--ink-100)" : 0,
                textAlign: "left", cursor: "pointer",
              }}>
                <span style={{ fontSize: 13, color: "var(--ink-500)", fontWeight: 500, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▸</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}>
                    {w.label}
                    {isThisWeek && <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 999, background: "var(--math)", color: "var(--paper)", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Now</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 1 }}>Week {w.wk} · {w.lessons.length} lesson{w.lessons.length === 1 ? "" : "s"}</div>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                  {w.lessons.filter(l => l.status === "done").length} of {w.lessons.length} done
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: "14px 22px 18px", background: "var(--ink-50)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {w.lessons.map(l => <SimpleLessonCard key={l.id} lesson={l} dense />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 10 · Simple Task list — flat checklist
// ───────────────────────────────────────────────────────────────────
//
// Simple version: one filter (Today / This week / Missed) instead of
// the four-scope chip strip. Plain-text day headers. 24px checks. No
// bulk-select multi-select toolbar (that's the Task-mode-proper variant).
//
const ABSimpleTaskList = () => {
  const [scope, setScope] = React.useState("week");
  const byDay = React.useMemo(lessonsByDay, []);
  const all = React.useMemo(() => LESSONS.filter(l => l.day != null), []);

  const groups = scope === "today" ? [{ label: "Today · Monday", items: byDay[TODAY_INDEX] }]
    : scope === "missed" ? [{ label: "Missed last week", items: all.filter(l => l.status === "carried" || l.status === "skipped" || l.reasonNotDone).slice(0, 6) }]
    : DAYS.map((d, i) => ({ label: i === TODAY_INDEX ? `${d} (today)` : d, items: byDay[i] }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="Things to do" subtitle="Check off lessons as you finish them.">
        <div style={{ display: "flex", gap: 6, padding: "10px 20px 14px" }}>
          {[["today", "Today"], ["week", "This week"], ["missed", "Missed last week"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setScope(id)} style={chipBtn(scope === id)}>{lbl}</button>
          ))}
        </div>
      </SimpleTopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 22px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((g, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 12, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{g.label}</div>
              {g.items.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13.5, color: "var(--ink-500)", textAlign: "center", background: "var(--paper)", borderRadius: 10, border: "1px dashed var(--ink-200)" }}>Nothing planned.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.items.map(l => <SimpleTaskRow key={l.id} lesson={l} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Single-line task row — the most compact Simple primitive
const SimpleTaskRow = ({ lesson }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [status, setStatus] = React.useState(lesson.status);
  const done = status === "done";
  return (
    <div className={`cp-subj ${subj.cls}`} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px 12px 14px", background: "var(--paper)",
      border: "1px solid var(--ink-150)", borderRadius: 8,
      minHeight: 56,
    }}>
      <span style={{ width: 5, height: 30, background: "var(--c)", borderRadius: 2, flex: "0 0 auto" }} />
      <SimpleCheck done={done} onCycle={(d) => setStatus(d ? "done" : "not_done")} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 500, color: "var(--ink-900)", lineHeight: 1.3,
          textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-300)",
        }}>{lesson.title}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
          {subj.name}{lesson.resources.length > 0 && ` · ${lesson.resources.length} resource${lesson.resources.length === 1 ? "" : "s"}`}
        </div>
      </div>
      {done && <span style={{ fontSize: 11.5, color: "var(--reading-deep)", fontWeight: 600 }}>✓ Done</span>}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 11 · Simple Catch-up
// ───────────────────────────────────────────────────────────────────
const ABSimpleCatchup = () => {
  const missed = LESSONS.filter(l => l.status === "carried" || l.reasonNotDone || l.id === "w-12-1");
  // We want at least 5 rows — pad with not_done lessons from last week
  const padded = [...missed, ...LESSONS.filter(l => l.status === "not_done").slice(0, 6)].slice(0, 7);
  const [resolved, setResolved] = React.useState(new Set());

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="Catch up on missed lessons" subtitle={`${padded.length - resolved.size} lessons didn't get covered. Pick what to do with each.`} />
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {padded.length === resolved.size && (
            <div style={{ padding: 30, textAlign: "center", background: "var(--paper)", borderRadius: 12, border: "1px solid var(--ink-150)" }}>
              <div style={{ fontSize: 40, lineHeight: 1 }}>🌿</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-900)", marginTop: 8 }}>All caught up.</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>Nothing left from last week.</div>
            </div>
          )}
          {padded.map(l => !resolved.has(l.id) && <SimpleCatchupRow key={l.id} lesson={l} onResolve={() => setResolved(prev => new Set([...prev, l.id]))} />)}
        </div>
      </div>
    </div>
  );
};

const SimpleCatchupRow = ({ lesson, onResolve }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const [open, setOpen] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState(lesson.reasonNotDone || "");
  return (
    <div className={`cp-subj ${subj.cls}`} style={{
      background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px 14px 14px" }}>
        <span style={{ width: 6, height: 36, background: "var(--c)", borderRadius: 2, flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-900)", lineHeight: 1.3, textWrap: "pretty" }}>{lesson.title}</div>
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3 }}>
            {subj.name} · was planned for Tuesday, January 7
          </div>
          {note && (
            <div style={{ fontSize: 12.5, color: "var(--catchup)", marginTop: 6, background: "var(--catchup-bg)", padding: "5px 9px", borderRadius: 6, textWrap: "pretty", display: "inline-flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 1 }}>Note</span>
              <span style={{ flex: 1 }}>{note}</span>
            </div>
          )}
        </div>
      </div>
      {noteOpen && (
        <div style={{ padding: "4px 16px 14px" }}>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering — what worked, what didn't, what to try next time…"
            style={{
              width: "100%", minHeight: 64, padding: "9px 11px",
              background: "var(--catchup-bg)",
              border: "1px solid color-mix(in oklch, var(--catchup) 35%, transparent)",
              borderRadius: 6, fontSize: 13, lineHeight: 1.5, color: "var(--ink-900)",
              outline: "none", resize: "vertical", fontFamily: "inherit",
            }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setNoteOpen(false)} style={primaryBtn()}>Save note</button>
            <button onClick={() => { setNote(""); setNoteOpen(false); }} style={ghostBtn()}>Cancel</button>
          </div>
        </div>
      )}
      {open ? (
        <div style={{ padding: "10px 16px 14px", borderTop: "1px solid var(--ink-100)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-500)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>What should we do?</div>
          <button onClick={onResolve} style={catchupActionBtn()}>↻ Move to this week</button>
          <button onClick={onResolve} style={catchupActionBtn()}>✓ Mark as done anyway</button>
          <button onClick={() => { setOpen(false); setNoteOpen(true); }} style={catchupActionBtn()}>✏ Add a note</button>
          <button onClick={onResolve} style={catchupActionBtn()}>— Skip for now</button>
          <button onClick={() => setOpen(false)} style={{ ...catchupActionBtn(), color: "var(--ink-500)" }}>Decide later</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, padding: "0 16px 14px" }}>
          <button onClick={() => setOpen(true)} style={primaryBtn()}>Decide what to do</button>
          {!note && !noteOpen && <button onClick={() => setNoteOpen(true)} style={ghostBtn()}>✏ Add a note</button>}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 12 · Simple Core / Personalized — the toggle, calmly
// ───────────────────────────────────────────────────────────────────
//
// In Simple mode the warm-amber flashing Core-mode entry sequence is
// suppressed. The toggle becomes a clearly-labelled two-state pill with
// a sentence below explaining what changed.
//
const ABSimpleCore = () => {
  const [mode, setMode] = React.useState("personal");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar title="Where you're working" subtitle="Pick where to make changes." />
      <div style={{ flex: 1, overflow: "auto", padding: "22px 22px 28px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          {/* The toggle itself */}
          <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ModeCard
              active={mode === "personal"} onClick={() => setMode("personal")}
              accent="var(--math)"
              kicker="Just for me"
              title="Personalized"
              desc="Changes you make stay in your own copy. Your teammates don't see them."
            />
            <ModeCard
              active={mode === "core"} onClick={() => setMode("core")}
              accent="var(--core-mode)"
              kicker="For the whole team"
              title="Core curriculum"
              desc="Changes you make show up for every teacher on the team. Use this when the plan has actually shifted."
            />
          </div>

          {/* Resolution banner — calm, not flashing */}
          <div style={{
            marginTop: 18, padding: "14px 18px",
            background: mode === "core" ? "var(--core-mode-bg)" : "var(--reading-light)",
            border: `1px solid ${mode === "core" ? "var(--core-mode)" : "var(--reading)"}`,
            borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: mode === "core" ? "var(--core-mode)" : "var(--reading)", color: "var(--paper)", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
              {mode === "core" ? "!" : "✓"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: mode === "core" ? "var(--core-mode-deep)" : "var(--reading-deep)" }}>
                {mode === "core" ? "You're editing the team plan." : "You're editing your own copy."}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-700)", marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>
                {mode === "core"
                  ? "Anything you change here will show up for every Grade 5 teacher when they next open the planner. The team gets a notification."
                  : "Edit freely. Your teammates won't see your changes. If you want to share what you've changed, switch to Core curriculum and apply the change there."}
              </div>
            </div>
          </div>

          {/* Sample card to anchor */}
          <div style={{ marginTop: 22, padding: 16, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>Preview · how a lesson card looks</div>
            <SimpleLessonCard lesson={LESSONS.find(l => l.id === "m-12-1")} />
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 10, lineHeight: 1.5, textWrap: "pretty" }}>
              {mode === "core"
                ? "When you edit this in Core mode, every teammate sees the same change."
                : "When you edit this in your own copy, only you see the change. The original Core curriculum is untouched."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModeCard = ({ active, onClick, accent, kicker, title, desc }) => (
  <button onClick={onClick} role="radio" aria-checked={active} style={{
    textAlign: "left", padding: "16px 18px", borderRadius: 10,
    background: active ? "var(--paper)" : "var(--ink-50)",
    border: active ? `1.5px solid ${accent}` : "1.5px solid var(--ink-150)",
    boxShadow: active ? `0 1px 3px ${accent}26` : "none",
    cursor: "pointer", color: "var(--ink-900)",
  }}>
    <div style={{ fontSize: 10.5, color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{kicker}</div>
    <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, letterSpacing: -0.2, color: "var(--ink-900)" }}>{title}</div>
    <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4, lineHeight: 1.5, textWrap: "pretty" }}>{desc}</div>
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: active ? accent : "var(--ink-400)" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 999,
        border: `2px solid ${active ? accent : "var(--ink-300)"}`,
        background: active ? accent : "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{active && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--paper)" }} />}</span>
      {active ? "Selected" : "Tap to switch"}
    </div>
  </button>
);

// ───────────────────────────────────────────────────────────────────
// 13 · Simple Standards
// ───────────────────────────────────────────────────────────────────
//
// In Simple, standards aren't chips you click to drill through. They're
// a plain list under each lesson. The Standards screen, when you do
// arrive there, shows lessons grouped by standard, with plain-language
// descriptions and a single "Open lesson" button per row.
//
const ABSimpleStandards = () => {
  const code = "5.NF.B.3";
  const desc = STANDARDS[code];
  // every lesson tagged with this code
  const matching = LESSONS.filter(l => l.standards.includes(code));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <SimpleTopBar
        title="Standard"
        subtitle="Every lesson that covers this standard, this year."
      />
      <div style={{ padding: "18px 22px 8px", background: "var(--paper)", borderBottom: "1px solid var(--ink-150)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: "var(--ink-900)" }}>{code}</div>
            <div style={{ fontSize: 14, color: "var(--ink-700)", marginTop: 6, lineHeight: 1.55, textWrap: "pretty" }}>{desc}</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>From CCSS · Common Core State Standards · Grade 5 Math</div>
          </div>
          <button style={ghostBtn()}>← Back</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            {matching.length} lesson{matching.length === 1 ? "" : "s"} covers this
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matching.map(l => <SimpleStandardLessonRow key={l.id} lesson={l} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

const SimpleStandardLessonRow = ({ lesson }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  return (
    <div className={`cp-subj ${subj.cls}`} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 14px 12px 14px", background: "var(--paper)",
      border: "1px solid var(--ink-150)", borderRadius: 8,
    }}>
      <span style={{ width: 5, height: 36, background: "var(--c)", borderRadius: 2, flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: "var(--ink-900)", lineHeight: 1.3, textWrap: "pretty" }}>{lesson.title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
          {subj.name} · Week 12 · {lesson.status === "done" ? "Done" : "Not done yet"}
        </div>
      </div>
      <button style={ghostBtn()}>Open lesson →</button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 14 · Compare-modes wrapper — used by the tab to flip Simple / Task / Advanced
// ───────────────────────────────────────────────────────────────────
//
// Each Simple artboard pairs with the existing Advanced + Task views
// from the other artboard files via the slug map below. When the user
// flips the Mode pill at the top of an artboard, only that artboard
// re-renders in the chosen mode.
//
const ModeFrame = ({ defaultMode = "simple", scheduleView, render }) => {
  const [mode, setMode] = React.useState(defaultMode);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--paper)", borderBottom: "1px solid var(--ink-150)" }}>
        <span style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>View as</span>
        <ModePill mode={mode} onChange={setMode} scheduleView={scheduleView} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
          {mode === "simple" && "Big targets · plain language · one action."}
          {mode === "tasks"  && "Flat checklist · bulk-actions on selection."}
          {mode === "grid"   && "Full chrome · all indicators · power-user toolkit."}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* The Advanced + Task renderings come from window — they're
            registered by their own artboard files. For Task we point at
            CPViewModeContext = "tasks" so the existing artboards switch
            their internal view-mode pill. */}
        <window.CPViewModeContext.Provider value={mode === "tasks" ? "tasks" : (mode === "simple" ? "simple" : "grid")}>
          {render(mode)}
        </window.CPViewModeContext.Provider>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────
// 15 · Style helpers — reused across Simple-mode artboards
// ───────────────────────────────────────────────────────────────────
function primaryBtn() {
  return {
    padding: "9px 16px", borderRadius: 8,
    background: "var(--ink-900)", color: "var(--paper)",
    fontSize: 13, fontWeight: 600, border: 0, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}
function primaryBigBtn() {
  return {
    padding: "12px 22px", borderRadius: 10,
    background: "var(--ink-900)", color: "var(--paper)",
    fontSize: 14.5, fontWeight: 600, border: 0, cursor: "pointer",
    minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8,
  };
}
function secondaryBtn() {
  return {
    padding: "12px 22px", borderRadius: 10,
    background: "var(--reading-light)", color: "var(--reading-deep)",
    fontSize: 14.5, fontWeight: 600, border: "1px solid var(--reading)", cursor: "pointer",
    minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8,
  };
}
function ghostBtn() {
  return {
    padding: "9px 14px", borderRadius: 8,
    background: "transparent", color: "var(--ink-700)",
    fontSize: 13, fontWeight: 500, border: "1px solid var(--ink-200)", cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}
function chipBtn(active) {
  return {
    padding: "7px 14px", borderRadius: 999,
    background: active ? "var(--ink-900)" : "var(--paper)",
    color: active ? "var(--paper)" : "var(--ink-700)",
    fontSize: 12.5, fontWeight: 500,
    border: active ? "1px solid var(--ink-900)" : "1px solid var(--ink-200)",
    cursor: "pointer",
  };
}
function catchupActionBtn() {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 12px", borderRadius: 6,
    background: "transparent", color: "var(--ink-900)", fontSize: 14, fontWeight: 500,
    border: 0, textAlign: "left", cursor: "pointer",
  };
}

// ───────────────────────────────────────────────────────────────────
// 16 · Export
// ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  SimpleLessonCard, SimpleCheck, SimpleStatusPill, SimpleResCount, SimpleStdCount,
  SimpleMyVersionPill, SimpleMovedNote,
  SimpleTaskRow, SimpleAddCell, SimpleTopBar, SimpleSectionHead, ModePill, ModeFrame,
  ABSimpleLessonCard, ABSimpleWeekly, ABSimpleDaily, ABSimpleSchedule,
  ABSimpleSubject, ABSimpleTaskList, ABSimpleCatchup, ABSimpleCore, ABSimpleStandards,
});
