// shared.jsx — Small primitives reused across every artboard:
// icons, the lesson card itself (used in 7+ places), badges, chips, avatars.
// Names are uniquely prefixed (CP*) so the global babel scope doesn't collide.

// ── Icons (16px stroke, currentColor) ─────────────────────────────────
const CPIcon = ({ name, size = 14 }) => {
  const paths = {
    check:     <path d="M3 8l3 3 7-7" />,
    chevron:   <path d="M5 4l5 4-5 4" />,
    chevronD:  <path d="M4 5l4 5 4-5" />,
    chevronU:  <path d="M4 9l4-5 4 5" />,
    dots:      <g><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></g>,
    flame:     <path d="M8 1.5c.5 2 2.5 3 2.5 5.5a2.5 2.5 0 0 1-5 0c0-1 .5-1.5.5-2 .5 1 1 1 1 1S6.5 4 8 1.5z M5.5 10.5a2.5 2.5 0 0 0 5 0" />,
    plus:      <g><path d="M8 3v10M3 8h10"/></g>,
    x:         <path d="M4 4l8 8M12 4l-8 8" />,
    search:    <g><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/></g>,
    filter:    <path d="M2 3h12l-4.5 5v5l-3-1.5V8L2 3z" />,
    print:     <g><path d="M4 6V2h8v4M4 11H2V6h12v5h-2M5 9h6v5H5z"/></g>,
    edit:      <path d="M2 14h3l8-8-3-3-8 8v3z" />,
    pdf:       <g><rect x="3" y="1.5" width="9" height="13" rx="1"/><path d="M5 7h5M5 9.5h5M5 12h3"/></g>,
    youtube:   <g><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M7 6l3 2-3 2z" fill="currentColor" stroke="none"/></g>,
    slides:    <g><rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5v2M5.5 13.5h5"/></g>,
    image:     <g><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><circle cx="5.5" cy="6" r="1.3"/><path d="M2 12l4-4 3 3 2-2 3 3"/></g>,
    doc:       <g><path d="M3 1.5h6l3 3V14H3z M9 1.5V4.5H12"/><path d="M5 8h6M5 10.5h6M5 13h3"/></g>,
    website:   <g><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12c-2-2-2-10 0-12z"/></g>,
    drag:      <g><circle cx="5" cy="3" r=".9"/><circle cx="5" cy="8" r=".9"/><circle cx="5" cy="13" r=".9"/><circle cx="11" cy="3" r=".9"/><circle cx="11" cy="8" r=".9"/><circle cx="11" cy="13" r=".9"/></g>,
    calendar:  <g><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6h12M5 1.5v3M11 1.5v3"/></g>,
    list:      <g><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></g>,
    grid:      <g><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></g>,
    bell:      <path d="M4 11V7a4 4 0 0 1 8 0v4l1 2H3l1-2z M6.5 13.5a1.5 1.5 0 0 0 3 0" />,
    clock:     <g><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 1.5"/></g>,
    book:      <path d="M2 3h5a2 2 0 0 1 2 2v9a2 2 0 0 0-2-2H2zM14 3H9a2 2 0 0 0-2 2v9a2 2 0 0 1 2-2h5z" />,
    eye:       <g><path d="M1 8c2-3.5 4.5-5 7-5s5 1.5 7 5c-2 3.5-4.5 5-7 5s-5-1.5-7-5z"/><circle cx="8" cy="8" r="2"/></g>,
    link:      <path d="M6.5 9.5l3-3M5 11l-1 1a2.5 2.5 0 1 1-3.5-3.5l1-1M11 5l1-1a2.5 2.5 0 1 1 3.5 3.5l-1 1" />,
    arrowR:    <path d="M3 8h10M9 4l4 4-4 4" />,
    lock:      <g><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></g>,
    sparkle:   <path d="M8 1l1.5 4L13 6 9.5 7.5 8 11 6.5 7.5 3 6l3.5-1z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
};

// Resource type → icon name
const CP_RES_ICON = { pdf:"pdf", youtube:"youtube", slides:"slides", image:"image", doc:"doc", website:"website", other:"link" };

// Resource type → tinted color (for the Weekly/Daily inline type-icon row).
// Painted in their canonical Google/Microsoft brand-adjacent hues so a
// teacher scanning the grid can read "this lesson has 2 PDFs and 1 video"
// at a glance, without opening the card.
const CP_RES_TINT = {
  pdf:     { bg: "color-mix(in oklch, var(--urgent) 16%, white)",   fg: "var(--urgent)" },        // red — PDF
  youtube: { bg: "color-mix(in oklch, #e53935 18%, white)",          fg: "#c62828" },              // red — video
  slides:  { bg: "color-mix(in oklch, var(--important) 22%, white)", fg: "var(--important)" },    // amber — slides
  image:   { bg: "color-mix(in oklch, var(--writing) 18%, white)",   fg: "var(--writing-deep)" }, // purple — image
  doc:     { bg: "color-mix(in oklch, var(--fyi) 18%, white)",       fg: "var(--fyi)" },          // blue — doc
  website: { bg: "color-mix(in oklch, var(--grammar) 18%, white)",   fg: "var(--grammar-deep)" }, // teal — link
  other:   { bg: "var(--ink-100)", fg: "var(--ink-500)" },
};

// Row of resource-type chips with counts, e.g.  [▶ 1] [📄 2] [🔗 1]
// Replaces the old "render-first-4-as-bare-icons" approach. Mirrors how
// Padlet shows a quick by-type summary on a board tile.
const CPResourceTypeRow = ({ resources, size = 12, dense, max = 6, withPreview = true }) => {
  if (!resources || resources.length === 0) return null;
  const counts = {};
  const sampleByType = {};
  for (const r of resources) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (!sampleByType[r.type]) sampleByType[r.type] = r;
  }
  const entries = Object.entries(counts).slice(0, max);
  const Chip = ({ type, n }) => {
    const tint = CP_RES_TINT[type] || CP_RES_TINT.other;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 2,
        padding: dense ? "0 4px 0 3px" : "1px 5px 1px 4px",
        background: tint.bg, color: tint.fg, borderRadius: 3,
        fontSize: dense ? 9.5 : 10, fontWeight: 600,
        lineHeight: 1.3, fontVariantNumeric: "tabular-nums",
      }}>
        <CPIcon name={CP_RES_ICON[type] || "link"} size={size - 1} />
        {n > 1 && <span>{n}</span>}
      </span>
    );
  };
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }} title={`${resources.length} ${resources.length === 1 ? "resource" : "resources"}`}>
      {entries.map(([type, n]) => withPreview ? (
        <CPWithPreview key={type} resource={sampleByType[type]}>
          <Chip type={type} n={n} />
        </CPWithPreview>
      ) : <Chip key={type} type={type} n={n} />)}
    </span>
  );
};

// ── Tag pill ──────────────────────────────────────────────────────────
const CPTag = ({ tag, dim }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    background: `var(--${tag.color})`, color: "#fff",
    fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 999,
    lineHeight: 1.5, letterSpacing: 0.1, opacity: dim ? 0.5 : 1,
  }}>{tag.name}</span>
);

const CPTagDot = ({ tag }) => (
  <span style={{ width: 7, height: 7, borderRadius: 999, background: `var(--${tag.color})`, display: "inline-block", flex: "0 0 auto" }} />
);

// ── Standards badge ───────────────────────────────────────────────────
// Mouse over to surface a popover with the full description of the first
// standard. For the inline expanded form (Daily detail, Catch-up screen)
// use CPStandardChip directly so each code carries its own popover.
const CPStandardsBadge = ({ count, codes }) => {
  const ref = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);
  if (count === 0) return null;
  const first = codes && codes[0];
  return (
    <>
      <span ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setTimeout(() => setHovered(false), 60)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 10, fontWeight: 500,
          color: "var(--ink-500)", background: "var(--ink-100)",
          padding: "1px 6px", borderRadius: 3, letterSpacing: 0.2,
          cursor: "default",
        }}>
        <span className="cp-mono" style={{ fontSize: 10, fontWeight: 500 }}>CCSS</span>·{count}
      </span>
      {hovered && first && ref.current && ReactDOM.createPortal(
        <CPStandardPopover anchor={ref.current} code={first} desc={STANDARDS[first] || ""} onClose={() => setHovered(false)} />, document.body
      )}
    </>
  );
};

// ── Avatar ────────────────────────────────────────────────────────────
const CP_AVATAR_BG = { lh:"#4a6cf7", sk:"#e26a3a", ma:"#149a8e", jd:"#8b48d4", om:"#d4488f" };
const CPAvatar = ({ teacher, size = 22 }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: size, height: size, borderRadius: 999,
    background: CP_AVATAR_BG[teacher.id] || "var(--ink-400)", color: "#fff",
    fontSize: Math.round(size * 0.42), fontWeight: 600, letterSpacing: 0.2,
    flex: "0 0 auto",
  }}>{teacher.initials}</span>
);

// ── Subject chip (for filter rail) ────────────────────────────────────
const CPSubjectChip = ({ subject, active, onClick, count }) => (
  <button onClick={onClick} className={`cp-subj ${subject.cls}`}
    style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "5px 8px", borderRadius: 4, textAlign: "left",
      background: active ? "var(--cl)" : "transparent",
      color: active ? "var(--cd)" : "var(--ink-700)",
      fontWeight: active ? 500 : 400, fontSize: 13,
    }}>
    <span style={{ width: 3, height: 14, background: "var(--c)", borderRadius: 1, flex: "0 0 auto" }} />
    <span style={{ flex: 1 }}>{subject.name}</span>
    {typeof count === "number" && <span style={{ color: "var(--ink-400)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{count}</span>}
  </button>
);

// ── Personalized / Core dot indicator on cards ────────────────────────────
const CPForkDot = ({ pending }) => (
  <span style={{
    width: 6, height: 6, borderRadius: 999,
    background: pending ? "var(--important)" : "var(--ink-700)",
    boxShadow: pending ? "0 0 0 1.5px var(--important-bg)" : "none",
    flex: "0 0 auto",
  }} title={pending ? "Personal copy — Core has pending changes" : "Personal copy"} />
);

// ── Global view-mode + chrome preferences ────────────────────────────
// "Last clicked wins" across the whole site. Stored in localStorage so
// reload keeps the teacher's last preference. Components subscribe via
// useViewMode() and re-render when it flips.
window.CP_PREF_LISTENERS = window.CP_PREF_LISTENERS || new Set();
function loadPref(key, def) { try { return localStorage.getItem(key) ?? def; } catch { return def; } }
function savePref(key, v) { try { localStorage.setItem(key, v); } catch {} window.CP_PREF_LISTENERS.forEach(fn => fn()); }
window.CP_VIEW_MODE = window.CP_VIEW_MODE || loadPref("cp:viewMode", "grid"); // grid | tasks | simple
window.CP_RES_ICON_STYLE = window.CP_RES_ICON_STYLE || loadPref("cp:resIconStyle", "tinted"); // tinted | mono
window.CP_FIRST_RUN_SEEN = loadPref("cp:firstRunSeen", "");
const setViewMode = (m) => { window.CP_VIEW_MODE = m; savePref("cp:viewMode", m); };
const setResIconStyle = (m) => { window.CP_RES_ICON_STYLE = m; savePref("cp:resIconStyle", m); };
// Components inside a CPViewModeContext.Provider read its value first;
// otherwise we fall back to the global window-scoped pref. This lets
// the "Simple mode" tab force every nested artboard into simple without
// changing the global setting or leaking across tabs.
const CPViewModeContext = React.createContext(null);
const useViewMode = () => {
  const ctx = React.useContext(CPViewModeContext);
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { window.CP_PREF_LISTENERS.add(force); return () => window.CP_PREF_LISTENERS.delete(force); }, []);
  return ctx ?? window.CP_VIEW_MODE;
};
const useResIconStyle = () => {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { window.CP_PREF_LISTENERS.add(force); return () => window.CP_PREF_LISTENERS.delete(force); }, []);
  return window.CP_RES_ICON_STYLE;
};
Object.assign(window, { setViewMode, useViewMode, setResIconStyle, useResIconStyle, CPViewModeContext });

// Reusable three-way switch — drops into any top bar
const CPViewModeSwitch = ({ scheduleView }) => {
  const m = useViewMode();
  // "Advanced" is the canonical name for the full-chrome mode. In the
  // Weekly context that mode renders as a subject×day grid; in the
  // Schedule context it renders as a time-blocked timeline. Same mode,
  // same indicators — just different layouts. We label it consistently.
  const modes = scheduleView
    ? [["simple","Simple","sparkle"], ["tasks","Task list","list"], ["grid","Advanced","clock"]]
    : [["simple","Simple","sparkle"], ["tasks","Task list","list"], ["grid","Advanced","grid"]];
  return (
    <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-50)", borderRadius: 6, gap: 1 }}>
      {modes.map(([id, lbl, icon]) => (
        <button key={id} onClick={() => setViewMode(id)} title={
          id === "simple" ? "Simple — big targets, plain language, one action" :
          id === "tasks"  ? "Task list — flat checklist with multi-select" :
                            (scheduleView ? "Advanced — time-blocked timeline" : "Advanced — full chrome, all indicators")
        } style={{
          padding: "4px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 4,
          background: m === id ? "var(--paper)" : "transparent",
          color: m === id ? "var(--ink-900)" : "var(--ink-500)",
          boxShadow: m === id ? "0 1px 2px rgba(0,0,0,.06)" : "none",
          display: "inline-flex", alignItems: "center", gap: 5,
        }}>
          <CPIcon name={icon} size={11} /> {lbl}
        </button>
      ))}
    </div>
  );
};
Object.assign(window, { CPViewModeSwitch });
// Two-state completion toggle:
//   tick → done · tick again → not done
// Partial / Skipped / Carried go through the right-click status submenu.
const CP_NEXT_STATUS = { not_done: "done", done: "not_done", partial: "done" };
const cycleStatus = (s) => CP_NEXT_STATUS[s] || "done";

// ── Completion checkbox ───────────────────────────────────────────────
const CPCheck = ({ status, size = 16, onClick, onCycle }) => {
  const filled = status === "done";
  const partial = status === "partial";
  const skipped = status === "skipped";
  const carried = status === "carried";
  let bg = "transparent", border = "1.4px solid var(--ink-300)", glyph = null;
  if (filled)  { bg = "var(--done)"; border = "1.4px solid var(--done)"; glyph = <CPIcon name="check" size={size - 4} />; }
  if (partial) {
    // Two-tone fill: half-green / half-white to read "partially done".
    bg = "linear-gradient(135deg, var(--done) 50%, var(--paper) 50%)";
    border = "1.4px solid var(--done)";
    glyph = <CPIcon name="check" size={size - 4} />;
  }
  if (skipped) { border = "1.4px solid var(--ink-300)"; glyph = <span style={{ fontSize: size * 0.7, color: "var(--ink-400)", lineHeight: 1 }}>—</span>; }
  if (carried) { border = "1.4px solid var(--catchup)"; glyph = <span style={{ fontSize: size * 0.7, color: "var(--catchup)", lineHeight: 1 }}>↻</span>; }
  // Anyone passing `onCycle` gets the three-state cycle for free:
  // click → done → partial → not_done. `onClick` keeps the old behavior
  // (custom handler with explicit toggle logic) so existing callers don't break.
  const handler = onCycle
    ? (e) => { e.stopPropagation(); onCycle(cycleStatus(status)); }
    : (onClick ? (e) => { e.stopPropagation(); onClick(e); } : undefined);
  const Tag = handler ? "button" : "span";
  return (
    <Tag onClick={handler} title={
      status === "done"     ? "Done — click for Partial" :
      status === "partial"  ? "Partial — click to clear" :
      status === "skipped"  ? "Skipped" :
      status === "carried"  ? "Carried over" :
                              "Not done — click for Done"
    } style={{
      width: size, height: size, borderRadius: 3,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: bg, border, color: filled || partial ? "#fff" : "var(--ink-700)", flex: "0 0 auto",
      padding: 0, cursor: handler ? "pointer" : "default",
    }} aria-label={status} role={handler ? undefined : "img"}>
      {glyph}
    </Tag>
  );
};

// ── Lesson card — the atomic unit ─────────────────────────────────────
// States: default | hover | selected | expanded | dragging
// Three-tier mod system (§3.4):
//   unedited from Core   → solid stripe, no marker
//   personally modified    → dashed stripe + "Modified" pill (top-right)
//   personally moved       → solid stripe + ↔ (same-week) or ⤴ (across-weeks)
//   both                   → dashed stripe + Modified pill + arrow
// Slots: stripe, header (check + title + meta), preview, footer (resources + standards + dots)
const CPLessonCard = ({ lesson, state = "default", inGrid = true, onClick, onContextMenu, narrow }) => {
  const subj = SUBJECT_BY_ID[lesson.subject];
  const viewMode = useViewMode();
  const simple = viewMode === "simple";
  const selected = state === "selected";
  const expanded = state === "expanded";
  const hovered  = state === "hover";
  const dragging = state === "dragging";
  // In Simple mode the dashed-stripe / Modified pill / move-arrow / Core↑ /
  // tasks pill / I-Can / comment count all hide. Only solid stripe + title +
  // check + resource count + standards count remain.
  const dashed = !simple && !!lesson.modified;

  return (
    <div className={`cp-subj ${subj.cls} cp-lesson-card`} onClick={onClick} onContextMenu={onContextMenu}
      style={{
        position: "relative", background: "var(--paper)",
        border: selected ? "1.5px solid var(--c)" : "1px solid var(--ink-150)",
        borderRadius: 4, paddingLeft: 0, overflow: "hidden",
        boxShadow: dragging
          ? "0 12px 28px rgba(20,22,32,0.18), 0 0 0 1.5px var(--c)"
          : hovered ? "0 2px 6px rgba(20,22,32,0.08)" : "none",
        transform: dragging ? "rotate(-1.2deg)" : "none",
        cursor: dragging ? "grabbing" : "pointer",
        transition: "box-shadow .15s, border-color .15s",
      }}>
      {/* subject stripe — solid OR dashed for personally-modified */}
      {dashed ? (
        <div style={{
          position: "absolute", inset: "0 auto 0 0", width: 4,
          backgroundImage: "repeating-linear-gradient(to bottom, var(--c) 0 4px, transparent 4px 8px)",
          backgroundSize: "100% 8px",
        }} aria-label="personally modified" />
      ) : (
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4, background: "var(--c)" }} />
      )}

      {/* Top-right indicators — Modified pill / move arrow / ⋯ */}
      <div style={{ position: "absolute", top: 5, right: 5, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
        {!simple && lesson.moved && (
          <span title={lesson.moved === "across-weeks" ? "Moved across weeks" : "Moved within week"} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 16, height: 16, borderRadius: 3,
            background: "var(--cl)", color: "var(--cd)", fontSize: 10, fontWeight: 600,
          }}>{lesson.moved === "across-weeks" ? "⤴" : "↔"}</span>
        )}
        {!simple && lesson.modified && (
          <span title="Personally modified" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
            padding: "1px 6px", borderRadius: 999,
            background: "var(--c)", color: "var(--paper)",
          }}>Modified</span>
        )}
        {/* ⋯ always visible on touch (hover-only on desktop) */}
        <button onClick={(e)=>{e.stopPropagation(); onContextMenu && onContextMenu(e);}}
          className="cp-affordance"
          title="More" style={{
          color: "var(--ink-500)", padding: 2,
          background: "var(--paper)", borderRadius: 3, border: "1px solid var(--ink-200)",
          display: "inline-flex",
          opacity: hovered || expanded ? 1 : 0.5,
          transition: "opacity .12s",
        }}>
          <CPIcon name="dots" size={12} />
        </button>
      </div>

      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 9px 4px 12px" }}>
        <div style={{ marginTop: 1 }}>
          <CPCheck status={lesson.status} size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: lesson.modified || lesson.moved ? 70 : (hovered || expanded ? 22 : 0) }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: "var(--ink-900)",
            lineHeight: 1.3, textWrap: "pretty",
            textDecoration: lesson.status === "done" ? "line-through" : "none",
            textDecorationColor: "var(--ink-300)",
          }}>
            <CPEditableText
              value={useTitleOverride(lesson.id, lesson.title)}
              onChange={(html) => setTitleOverride(lesson.id, html)}
              style={{ display: "inline" }} />
          </div>
        </div>
      </div>

      {/* preview paragraph + objective */}
      {!narrow && (
        <div style={{ padding: "0 9px 5px 12px" }}>
          {/* In Simple mode hide the I Can pill (title stays primary); in
              Tasks/Grid show it. */}
          {!simple && lesson.objective && (
            <div title="Lesson objective (I Can statement)" style={{
              display: "flex", alignItems: "flex-start", gap: 5,
              fontSize: 11, lineHeight: 1.4, color: "var(--cd)",
              fontStyle: "italic", marginBottom: 3, textWrap: "pretty",
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "1px 4px", borderRadius: 3, background: "var(--cl)", color: "var(--cd)", fontStyle: "normal", flex: "0 0 auto", marginTop: 1, textTransform: "uppercase" }}>I can</span>
              <span style={{ flex: 1 }}>{lesson.objective.replace(/^I can\s+/i, "")}</span>
            </div>
          )}
          {!simple && (
            <div style={{
              fontSize: 12, lineHeight: 1.45, color: "var(--ink-500)",
              display: "-webkit-box", WebkitLineClamp: expanded ? 6 : 2, WebkitBoxOrient: "vertical",
              overflow: "hidden", textWrap: "pretty",
            }}>{lesson.preview}</div>
          )}
        </div>
      )}

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px 7px 12px", flexWrap: "wrap" }}>
        {lesson.standards.length > 0 && <CPStandardsBadge count={lesson.standards.length} codes={lesson.standards} />}
        {simple
          ? (lesson.resources.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--ink-500)" }}><CPIcon name="link" size={11} />{lesson.resources.length}</span>)
          : <CPResourceTypeRow resources={lesson.resources} />}
        {!simple && lesson.tasks && lesson.tasks.length >= 2 && (
          <span title={`${lesson.tasks.length} lesson task${lesson.tasks.length === 1 ? "" : "s"} inside this lesson`} style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "1px 6px 1px 4px", borderRadius: 999,
            background: "var(--cl)", color: "var(--cd)",
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
          }}>
            <svg viewBox="0 0 9 9" width="9" height="9" fill="currentColor"><rect x="0" y="0" width="9" height="2.6" rx="0.5"/><rect x="0" y="3.2" width="9" height="2.6" rx="0.5" opacity="0.7"/><rect x="0" y="6.4" width="9" height="2.6" rx="0.5" opacity="0.45"/></svg>
            {lesson.tasks.length} task{lesson.tasks.length === 1 ? "" : "s"}
          </span>
        )}
        {!simple && lesson.commentCount > 0 && (
          <span title={`${lesson.commentCount} comments`} style={{
            display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--ink-500)",
            position: "relative",
          }}>
            <span style={{ fontSize: 11 }}>💬</span>{lesson.commentCount}
            {lesson.unreadComments > 0 && (
              <span style={{ position: "absolute", top: -2, right: -3, width: 5, height: 5, borderRadius: 999, background: "var(--urgent)" }} />
            )}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!simple && lesson.pendingMaster && (
          <span title="Core curriculum has updates" style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase",
            padding: "1px 5px", borderRadius: 3,
            background: "var(--important-bg)", color: "var(--important)",
          }}>Core ↑</span>
        )}
        {lesson.status === "carried" && (
          <span style={{ fontSize: 10, color: "var(--catchup)", fontWeight: 500 }}>carry-over</span>
        )}
      </div>
      {/* "Why not done" note — only when the teacher recorded a reason */}
      {!simple && lesson.reasonNotDone && lesson.status !== "done" && (
        <div style={{ padding: "0 9px 8px 12px", marginTop: -3 }}>
          <CPReasonNotDone reason={lesson.reasonNotDone} inline />
        </div>
      )}
    </div>
  );
};

// ── Right-click context menu ──────────────────────────────────────────
const CPContextMenu = ({ x = 0, y = 0, items, style }) => (
  <div style={{
    position: "absolute", top: y, left: x,
    background: "var(--paper)", borderRadius: 6,
    boxShadow: "var(--shadow-popover)", border: "1px solid var(--ink-150)",
    padding: 4, minWidth: 180, zIndex: 10, fontSize: 13, ...style,
  }}>
    {items.map((it, i) =>
      it.divider ? <div key={i} style={{ height: 1, background: "var(--ink-150)", margin: "4px 2px" }} /> :
      <button key={i} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "6px 10px", borderRadius: 4, textAlign: "left",
        color: it.danger ? "var(--urgent)" : "var(--ink-900)",
      }} onMouseEnter={(e)=>e.currentTarget.style.background="var(--ink-50)"} onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
        <span style={{ flex: 1 }}>{it.label}</span>
        {it.chevron && <CPIcon name="chevron" size={10} />}
        {it.kbd && <span style={{ color: "var(--ink-400)", fontSize: 11 }}>{it.kbd}</span>}
      </button>
    )}
  </div>
);

// ── Lesson context menu (universal — Weekly, Daily, Subject, Unit, Schedule) ──
// Single canonical menu shape, plus a submenu shim. Pass `lesson` for tailored labels.
const CPLessonContextMenu = ({ lesson, x = 0, y = 0, isMaster = false, onClose, style }) => {
  const [sub, setSub] = React.useState(null); // "move" | "status" | null
  const subj = lesson && SUBJECT_BY_ID[lesson.subject];

  const moveItems = [
    { kind: "head", label: "Move to day" },
    ...["Sun","Mon","Tue","Wed","Thu"].map(d => ({ label: d, kbd: d === "Mon" ? "↓ today" : "" })),
    { divider: true },
    { kind: "head", label: "Move to week" },
    { label: "← Week 11 (last week)" },
    { label: "→ Week 13 (next week)" },
    { label: "Pick a week…", chevron: true },
    { divider: true },
    { kind: "head", label: "Move to unit" },
    { label: subj ? `${subj.name} · current unit` : "Current unit" },
    { label: "Choose another unit…", chevron: true },
  ];
  const statusItems = [
    { label: "Done",         kbd: "1" },
    { label: "Partial",      kbd: "2" },
    { label: "Skipped",      kbd: "3" },
    { label: "Carried over", kbd: "4" },
    { label: "Not done",     kbd: "0" },
  ];

  const items = sub === "move" ? moveItems
             : sub === "status" ? statusItems
             : [
    { label: "Move to…", chevron: true, onClick: () => setSub("move") },
    { label: "Duplicate", kbd: "⌘D" },
    { label: lesson?.isPersonal ? "Reset to Core" : "Copy to my Personalized" },
    { label: "Mark status…", chevron: true, onClick: () => setSub("status") },
    { divider: true },
    { label: "Add to to-do list" },
    { label: "See standards" },
    { label: "Print this lesson", kbd: "⌘P" },
    ...(isMaster ? [{ divider: true }, { label: "Delete from Core", danger: true }] : []),
  ];

  return (
    <div style={{
      position: "absolute", top: y, left: x,
      background: "var(--paper)", borderRadius: 6,
      boxShadow: "var(--shadow-popover)", border: "1px solid var(--ink-150)",
      padding: 4, minWidth: 200, zIndex: 50, fontSize: 13, ...style,
    }}>
      {sub && (
        <button onClick={()=>setSub(null)} style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "5px 10px", borderRadius: 4, color: "var(--ink-500)",
          fontSize: 11, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase",
        }}>
          <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><CPIcon name="chevron" size={9} /></span>
          Back
        </button>
      )}
      {items.map((it, i) =>
        it.divider ? <div key={i} style={{ height: 1, background: "var(--ink-100)", margin: "4px 2px" }} /> :
        it.kind === "head" ? <div key={i} style={{ fontSize: 10, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, padding: "6px 10px 2px" }}>{it.label}</div> :
        <button key={i} onClick={it.onClick} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "6px 10px", borderRadius: 4, textAlign: "left",
          color: it.danger ? "var(--urgent)" : "var(--ink-900)",
        }} onMouseEnter={(e)=>e.currentTarget.style.background="var(--ink-50)"}
           onMouseLeave={(e)=>e.currentTarget.style.background="transparent"}>
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.chevron && <CPIcon name="chevron" size={10} />}
          {it.kbd && <span style={{ color: "var(--ink-400)", fontSize: 11 }}>{it.kbd}</span>}
        </button>
      )}
    </div>
  );
};

// ── Inline comment thread (lesson detail bottom) ─────────────────────
const CPCommentThread = ({ comments, compact, onSeeAll }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {comments.map(c => (
        <div key={c.id} style={{ display: "flex", gap: 9 }}>
          <CPAvatar teacher={c.author} size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-900)" }}>{c.author.name}</span>
              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{c.time}</span>
              {c.edited && <span style={{ fontSize: 10, color: "var(--ink-300)" }}>· edited</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5, marginTop: 2, textWrap: "pretty" }}>{c.body}</div>
            {!compact && (
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--ink-400)" }}>
                <button>Reply</button>
                {c.mine && <><button>Edit</button><button>Delete</button></>}
              </div>
            )}
            {c.replies && c.replies.length > 0 && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid var(--ink-100)", display: "flex", flexDirection: "column", gap: 8 }}>
                {c.replies.map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 7 }}>
                    <CPAvatar teacher={r.author} size={20} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.author.name}</span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-400)" }}>{r.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5, marginTop: 1 }}>{r.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 4 }}>
        <CPAvatar teacher={ME} size={24} />
        <input placeholder="Add a comment…" style={{
          flex: 1, padding: "7px 10px", border: "1px solid var(--ink-200)", borderRadius: 6,
          background: "var(--paper)", outline: "none", fontSize: 12.5,
        }} />
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll} style={{ fontSize: 11.5, color: "var(--fyi)", fontWeight: 500, alignSelf: "flex-start", padding: "2px 0" }}>
          View all comments →
        </button>
      )}
    </div>
  );
};

// ── Day Shoutbox — flat team thread under Daily Notes ────────────────
const CPShoutbox = ({ messages, compact }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 7 }}>
    {messages.map(m => (
      <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <CPAvatar teacher={m.author} size={22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-900)" }}>{m.author.name.split(" ")[0]}</span>
            <span style={{ fontSize: 10.5, color: "var(--ink-400)" }}>{m.time}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.45, marginTop: 1, textWrap: "pretty" }}>{m.body}</div>
        </div>
      </div>
    ))}
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
      <CPAvatar teacher={ME} size={22} />
      <input placeholder="Say something to the team…" style={{
        flex: 1, padding: "6px 9px", border: "1px solid var(--ink-200)", borderRadius: 999,
        background: "var(--paper)", outline: "none", fontSize: 12, color: "var(--ink-700)",
      }} />
    </div>
  </div>
);

// Sample comments + shoutbox messages for prototype reuse
const CP_SAMPLE_COMMENTS = [
  { id: "c1", author: { id: "sk", name: "Sarah Khouri", initials: "SK" }, time: "Mon · 7:42 AM",
    body: "I tried this anchor problem last year — about half the class jumped to long division before modeling. Worth slowing them down.",
    replies: [
      { id: "c1r1", author: { id: "lh", name: "Lena Haddad", initials: "LH" }, time: "Mon · 7:58 AM",
        body: "Good call. I'll force the bar-model first round, then release for division on the second problem." },
    ]},
  { id: "c2", author: { id: "ma", name: "Maya Al-Rashid", initials: "MA" }, time: "Sun · 4:14 PM",
    body: "Reminder to pull the exit ticket from last week's folder — three of mine still owe it.", edited: true, mine: true },
];

const CP_SAMPLE_SHOUTS = [
  { id: "s1", author: { id: "om", name: "Omar Bishara", initials: "OM" }, time: "8:14 AM",
    body: "Fire drill at 9:45 sharp today — please end whatever you're in 2 min early." },
  { id: "s2", author: { id: "sk", name: "Sarah Khouri", initials: "SK" }, time: "8:31 AM",
    body: "Anyone seen the laminator key? Last had it Friday afternoon." },
  { id: "s3", author: { id: "ma", name: "Maya Al-Rashid", initials: "MA" }, time: "9:02 AM",
    body: "Tariq came in upset — heads-up if he's in your group later." },
];

// ─────────────────────────────────────────────────────────────────────
// Lesson task row — shared component used inside a parent lesson's
// expanded body (Weekly, Daily, Subject views). Each task surfaces just
// like a mini-lesson but is flagged as a TASK of the parent.
// ─────────────────────────────────────────────────────────────────────
// ── Lesson note pill ──────────────────────────────────────────────
// Surfaces on any card / row whose status isn't `done` AND has a note.
// Soft rust tint — reads as "the teacher left a note here", not as an
// accusation. The teacher writes the note voluntarily; it's optional.
const CPReasonNotDone = ({ reason, inline }) => {
  if (!reason) return null;
  return (
    <div title="Teacher note" style={{
      display: inline ? "inline-flex" : "flex",
      alignItems: "flex-start", gap: 6,
      padding: inline ? "1px 7px 1px 5px" : "6px 9px",
      borderRadius: inline ? 999 : 4,
      background: "var(--catchup-bg)", color: "var(--catchup)",
      fontSize: inline ? 10.5 : 12, lineHeight: 1.45, fontWeight: 500,
      borderLeft: inline ? "none" : "3px solid var(--catchup)",
    }}>
      <span style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", fontSize: inline ? 9 : 10, padding: inline ? 0 : "1px 0", flex: "0 0 auto" }}>Note</span>
      <span style={{ flex: 1, textWrap: "pretty" }}>{reason}</span>
    </div>
  );
};
Object.assign(window, { CPReasonNotDone });
// everywhere. (In production this lives in a store / Supabase row; for
// the prototype window-scope is enough.) Keyed by lesson id → HTML string.
window.CP_TITLE_OVERRIDES = window.CP_TITLE_OVERRIDES || {};
// Re-render bus — components can subscribe to re-render when an override changes.
window.CP_TITLE_LISTENERS = window.CP_TITLE_LISTENERS || new Set();
const useTitleOverride = (id, fallback) => {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    window.CP_TITLE_LISTENERS.add(force);
    return () => window.CP_TITLE_LISTENERS.delete(force);
  }, []);
  return window.CP_TITLE_OVERRIDES[id] ?? fallback;
};
const setTitleOverride = (id, html) => {
  window.CP_TITLE_OVERRIDES[id] = html;
  window.CP_TITLE_LISTENERS.forEach(fn => fn());
};

Object.assign(window, { useTitleOverride, setTitleOverride });

// ── Standards chip with hover preview ────────────────────────────────
// Wraps a standards code in a hover popover showing the full description
// and a quick "see lessons tagged with this" affordance.
const CPStandardChip = ({ code, dense, onClick }) => {
  const ref = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);
  const desc = STANDARDS[code] || "No description available for this standard.";
  return (
    <>
      <span ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setTimeout(() => setHovered(false), 60)}
        onClick={onClick}
        className="cp-mono"
        style={{
          fontSize: dense ? 9.5 : 10, color: "var(--ink-700)",
          background: "var(--ink-100)", padding: "1px 6px", borderRadius: 3,
          cursor: onClick ? "pointer" : "default",
          display: "inline-block",
        }}>{code}</span>
      {hovered && ref.current && ReactDOM.createPortal(
        <CPStandardPopover anchor={ref.current} code={code} desc={desc} onClose={() => setHovered(false)} />, document.body
      )}
    </>
  );
};

const CPStandardPopover = ({ anchor, code, desc, onClose }) => {
  const r = anchor.getBoundingClientRect();
  const above = r.top > 180;
  return (
    <div onMouseEnter={() => {}} onMouseLeave={onClose} style={{
      position: "fixed", zIndex: 1000,
      top: above ? r.top - 10 : r.bottom + 8,
      left: Math.max(8, Math.min(window.innerWidth - 340, r.left - 10)),
      transform: above ? "translateY(-100%)" : "none",
      width: 320, background: "var(--paper)", borderRadius: 8,
      border: "1px solid var(--ink-150)",
      boxShadow: "0 10px 32px rgba(20,22,32,.14), 0 1px 3px rgba(20,22,32,.08)",
      padding: "11px 13px", pointerEvents: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span className="cp-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>{code}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-400)", letterSpacing: 0.4, textTransform: "uppercase" }}>CCSS</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-700)", textWrap: "pretty" }}>{desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--ink-100)" }}>
        <button style={{ fontSize: 11, color: "var(--math)", padding: "2px 8px", borderRadius: 4, background: "var(--math-light)", fontWeight: 500 }}>
          See all lessons tagged →
        </button>
        <div style={{ flex: 1 }} />
        <button style={{ fontSize: 11, color: "var(--ink-500)", padding: "2px 8px" }}>Copy code</button>
      </div>
    </div>
  );
};

Object.assign(window, { CPStandardChip, CPStandardPopover });
// Wrap any title or text run with CPEditableText. Focus the element →
// a small floating toolbar appears above it with text-color + highlight
// swatches. Works in any view, any mode. Persists the formatted runs
// via inline <span> stylings inside the contentEditable region.
const CP_TEXT_COLORS = [
  { id: "default", lbl: "Default", color: "currentColor" },
  { id: "math",    lbl: "Blue",    color: "var(--math)" },
  { id: "reading", lbl: "Green",   color: "var(--reading)" },
  { id: "writing", lbl: "Purple",  color: "var(--writing)" },
  { id: "ufli",    lbl: "Orange",  color: "var(--ufli)" },
  { id: "urgent",  lbl: "Red",     color: "var(--urgent)" },
  { id: "important", lbl: "Amber", color: "var(--important)" },
];
const CP_HIGHLIGHTS = [
  { id: "none",     lbl: "None",     bg: "transparent" },
  // Soft pastels — for everyday highlighting
  { id: "yellow",   lbl: "Yellow",   bg: "#fdf3c0" },
  { id: "green",    lbl: "Green",    bg: "#d8f0d8" },
  { id: "blue",     lbl: "Blue",     bg: "#dfeaff" },
  { id: "pink",     lbl: "Pink",     bg: "#fce0eb" },
  { id: "amber",    lbl: "Amber",    bg: "#fde8c8" },
  // Bright neons — for "look at this NOW" emphasis
  { id: "neon-yel", lbl: "Neon yellow", bg: "#fff700" },
  { id: "neon-grn", lbl: "Neon green",  bg: "#7dff5b" },
  { id: "neon-cyn", lbl: "Neon cyan",   bg: "#3ff1ff" },
  { id: "neon-mag", lbl: "Neon pink",   bg: "#ff5bd1" },
  { id: "neon-org", lbl: "Neon orange", bg: "#ff8a3d" },
  { id: "neon-vio", lbl: "Neon violet", bg: "#c069ff" },
];

const CPEditableText = ({ value, onChange, style, tag = "span", placeholder, multiline }) => {
  const ref = React.useRef(null);
  const [focused, setFocused] = React.useState(false);
  const [coords, setCoords] = React.useState(null);

  // Surface toolbar above the editor when focused.
  const recomputeCoords = React.useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ left: r.left, top: r.top - 8 });
  }, []);

  React.useEffect(() => {
    if (!focused) return;
    recomputeCoords();
    const onScroll = () => recomputeCoords();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [focused, recomputeCoords]);

  // Apply a color / highlight to the current selection by wrapping it
  // in a <span style="…">. Uses document.execCommand which all major
  // browsers still support inside contentEditable regions (good enough
  // for a prototype; production would use a real editor lib).
  const applyColor = (color) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (color === "currentColor") {
      document.execCommand("removeFormat", false);
      return;
    }
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, getComputedColor(color));
  };
  const applyHighlight = (bg) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, true);
    if (bg === "transparent") {
      document.execCommand("hiliteColor", false, "transparent");
    } else {
      document.execCommand("hiliteColor", false, bg);
    }
  };

  const Tag = tag;
  return (
    <>
      <Tag ref={ref} contentEditable suppressContentEditableWarning
        onFocus={() => { setFocused(true); }}
        onBlur={(e) => {
          // Defer so toolbar clicks can refocus first
          setTimeout(() => {
            const ae = document.activeElement;
            if (!ae || !ae.closest("[data-cp-edit-toolbar]")) {
              setFocused(false);
              onChange && onChange(e.currentTarget.innerHTML);
            }
          }, 60);
        }}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        }}
        data-placeholder={placeholder}
        style={{
          outline: "none", display: "inline-block", minWidth: 24,
          borderRadius: 3,
          boxShadow: focused ? "0 0 0 2px var(--math-light), 0 0 0 3px var(--math)" : "none",
          ...style,
        }}
        dangerouslySetInnerHTML={{ __html: value || "" }}
      />
      {focused && coords && ReactDOM.createPortal(
        <div data-cp-edit-toolbar
          onMouseDown={(e) => e.preventDefault() /* keep selection alive */}
          style={{
            position: "fixed", zIndex: 9999,
            top: coords.top, left: coords.left, transform: "translateY(-100%)",
            display: "flex", alignItems: "center", gap: 6,
            background: "#1a1d24", color: "#fff",
            padding: "6px 8px", borderRadius: 7,
            boxShadow: "0 6px 18px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.12)",
            fontFamily: "var(--font-sans)", fontSize: 11,
          }}>
          <button onClick={() => document.execCommand("bold")}
            title="Bold" style={ttBtn()}><strong>B</strong></button>
          <button onClick={() => document.execCommand("italic")}
            title="Italic" style={{ ...ttBtn(), fontStyle: "italic" }}>I</button>
          <button onClick={() => document.execCommand("underline")}
            title="Underline" style={{ ...ttBtn(), textDecoration: "underline" }}>U</button>
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,.18)" }} />
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>Color</span>
          {CP_TEXT_COLORS.map(c => (
            <button key={c.id} onClick={() => applyColor(c.color)} title={c.lbl} style={{
              width: 16, height: 16, borderRadius: 3, background: "transparent",
              border: "1px solid rgba(255,255,255,.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: getComputedColor(c.color) || "#fff", fontSize: 11, fontWeight: 700, padding: 0,
            }}>A</button>
          ))}
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,.18)" }} />
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>Highlight</span>
          {CP_HIGHLIGHTS.map(h => (
            <button key={h.id} onClick={() => applyHighlight(h.bg)} title={h.lbl} style={{
              width: 16, height: 16, borderRadius: 3, padding: 0,
              background: h.bg === "transparent" ? "rgba(255,255,255,.06)" : h.bg,
              border: "1px solid rgba(255,255,255,.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#1a1d24", fontSize: 10, fontWeight: 700,
            }}>{h.bg === "transparent" ? "—" : ""}</button>
          ))}
        </div>, document.body
      )}
    </>
  );
};

function ttBtn() {
  return {
    width: 22, height: 20, borderRadius: 3,
    background: "transparent", color: "#fff",
    fontSize: 11.5, fontWeight: 600, lineHeight: 1, padding: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,.18)",
  };
}

// Resolve a CSS variable to its actual hex so execCommand("foreColor", …)
// receives a value the engine can paint (it won't accept "var(--math)").
function getComputedColor(value) {
  if (!value || value === "currentColor") return value;
  if (!value.startsWith("var(")) return value;
  const name = value.slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

Object.assign(window, { CPEditableText, CP_TEXT_COLORS, CP_HIGHLIGHTS });
// Hover any resource chip / icon / link to surface a Padlet-style
// preview tile (thumbnail + caption + open-in / copy-link / open-in-tab).
// Used inside CPResourceTypeRow and anywhere resource links surface.
const CPResourcePreview = ({ resource, anchor, onClose }) => {
  if (!resource || !anchor) return null;
  const r = anchor.getBoundingClientRect();
  // Position above the anchor if there's room; otherwise below.
  const above = r.top > 220;
  const card = { id: "rp", kind: resource.type === "website" ? "link" : resource.type, title: resource.label, caption: "Hover preview · click to open" };
  return ReactDOM.createPortal(
    <div onMouseLeave={onClose} style={{
      position: "fixed", zIndex: 1000,
      top: above ? r.top - 12 : r.bottom + 8,
      left: Math.max(8, Math.min(window.innerWidth - 260, r.left + r.width / 2 - 120)),
      transform: above ? "translateY(-100%)" : "none",
      width: 240, background: "var(--paper)", borderRadius: 8,
      border: "1px solid var(--ink-150)",
      boxShadow: "0 10px 32px rgba(20,22,32,.14), 0 1px 3px rgba(20,22,32,.08)",
      overflow: "hidden", pointerEvents: "auto",
    }}>
      {typeof window.CPResThumb === "function" && <window.CPResThumb card={card} />}
      <div style={{ padding: "8px 11px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: "var(--ink-900)", textWrap: "pretty" }}>{resource.label}</div>
        <div style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>{resource.type}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
          <button style={{ flex: 1, padding: "4px 8px", fontSize: 11, fontWeight: 500, background: "var(--ink-900)", color: "var(--paper)", borderRadius: 4 }}>Open</button>
          <button style={{ padding: "4px 8px", fontSize: 11, color: "var(--ink-700)", border: "1px solid var(--ink-200)", borderRadius: 4 }}><CPIcon name="link" size={10} /></button>
        </div>
      </div>
    </div>, document.body);
};

// Hook helper: wrap any element to surface a preview on mouseenter.
const CPWithPreview = ({ resource, children }) => {
  const [anchor, setAnchor] = React.useState(null);
  const ref = React.useRef(null);
  return (
    <>
      <span ref={ref}
        onMouseEnter={() => setAnchor(ref.current)}
        onMouseLeave={() => setTimeout(() => setAnchor(null), 80)}
        style={{ display: "inline-flex" }}>
        {children}
      </span>
      {anchor && <CPResourcePreview resource={resource} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
};

// ── Catch-up filter pill — reusable across all views ────────────────
// Slim chip that "turns on" the catch-up filter for whatever view it's in.
// Three states: off (gray outline), on (flame red), dismissed-this-week
// (small flame badge with count, hides the bar).
const CPCatchupChip = ({ active, count = 7, onClick, dense }) => (
  <button onClick={onClick} title={active ? "Catch-up filter ON — showing only uncovered events" : "Show only uncovered events"}
    style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: dense ? "2px 8px 2px 6px" : "3px 10px 3px 7px",
      borderRadius: 999, fontSize: dense ? 11 : 12, fontWeight: 600,
      border: `1px solid ${active ? "var(--catchup)" : "var(--ink-200)"}`,
      background: active ? "color-mix(in oklch, var(--catchup) 12%, var(--paper))" : "var(--paper)",
      color: active ? "var(--catchup)" : "var(--ink-700)",
    }}>
    <CPIcon name="flame" size={dense ? 10 : 11} />
    {active ? "Catch-up · ON" : "Catch-up"}
    {count > 0 && (
      <span style={{
        fontSize: 9.5, fontWeight: 700, padding: "0 5px", borderRadius: 999,
        background: active ? "var(--catchup)" : "var(--ink-100)",
        color: active ? "var(--paper)" : "var(--ink-500)",
        fontVariantNumeric: "tabular-nums",
      }}>{count}</span>
    )}
  </button>
);

Object.assign(window, { CPResourcePreview, CPWithPreview, CPCatchupChip });

const CPLessonTaskRow = ({ task, parentSubjectId, dense, onCycle }) => {
  const tintSubject = task.subjectHint
    ? (SUBJECT_BY_ID[task.subjectHint] || SUBJECT_BY_ID[parentSubjectId])
    : SUBJECT_BY_ID[parentSubjectId];
  return (
    <div className={`cp-subj ${tintSubject.cls}`} style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: dense ? "4px 8px" : "6px 9px",
      background: "var(--paper)",
      border: "1px solid var(--ink-150)", borderLeft: "3px solid var(--c)",
      borderRadius: 4,
      position: "relative",
    }}>
      <CPCheck status={task.status} size={12} onCycle={onCycle} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, lineHeight: 1.3, fontWeight: 500, color: "var(--ink-900)",
          textDecoration: task.status === "done" ? "line-through" : "none",
          textDecorationColor: "var(--ink-300)", textWrap: "pretty",
        }}>{task.title}</div>
      </div>
      <span title="Lesson task inside the parent lesson" style={{
        fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
        padding: "1px 5px", borderRadius: 2,
        background: "var(--cl)", color: "var(--cd)",
        flex: "0 0 auto",
      }}>Task</span>
      {task.isPersonal && (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          padding: "1px 5px", borderRadius: 2,
          background: "var(--ink-900)", color: "var(--paper)",
        }}>Personalized</span>
      )}
      <CPResourceTypeRow resources={task.resources} dense />
      {task.standards.length > 0 && (
        <span className="cp-mono" style={{ fontSize: 9, color: "var(--ink-500)" }}>{task.standards[0]}</span>
      )}
    </div>
  );
};

// (CPLessonTaskRow registers itself via its own Object.assign above)
Object.assign(window, {
  CPIcon, CP_RES_ICON, CP_RES_TINT, CPResourceTypeRow,
  CPTag, CPTagDot, CPStandardsBadge, CPAvatar, CPSubjectChip,
  CPForkDot, CPCheck, cycleStatus, CP_NEXT_STATUS,
  CPLessonCard, CPContextMenu, CPLessonContextMenu,
  CPCommentThread, CPShoutbox, CP_SAMPLE_COMMENTS, CP_SAMPLE_SHOUTS,
});
