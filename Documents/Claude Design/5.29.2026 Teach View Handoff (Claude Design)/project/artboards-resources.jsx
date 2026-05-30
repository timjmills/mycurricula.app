// artboards-resources.jsx — Padlet-style Lesson Event Resources board
// Replaces the team's Padlet boards (one per unit per subject). Sections
// group resources; each section header is subject-tinted. Cards show
// thumbnails — image previews, video embeds, PDF/PPTX badges, website
// favicons. Authoring via a slide-up composer (matches screenshot 3).
// Floating "+ Post" FAB pinned to bottom-right.

// ─────────────────────────────────────────────────────────────────────
// Resource data — realistic, matches the screenshots' density
// ─────────────────────────────────────────────────────────────────────
const RES_SECTIONS = [
  {
    id: "general", name: "General Resources", subjectId: "math",
    description: "Year-long math reference materials. Tag → all year.",
    cards: [
      { id: "g1", kind: "pdf",   title: "Daily 10 Math Worksheet", caption: "Student Worksheet · 1–10 × 8", thumb: "worksheet" },
      { id: "g2", kind: "pdf",   title: "Number Talks Pack",       caption: "Wodb prompts · grade 5 set",   thumb: "worksheet-grid" },
      { id: "g3", kind: "image", title: "Multiplication Chart",    caption: "12 × 12 anchor chart",         thumb: "mult-chart" },
      { id: "g4", kind: "link",  title: "Khan Academy — Grade 5",  caption: "khanacademy.org · self-paced", thumb: "link-khan" },
    ],
  },
  {
    id: "wk1", name: "Week 1 · Divisibility, Factors & Multiples", subjectId: "math",
    description: "Lesson 1 of Unit 2. Anchor charts + sort decks.",
    cards: [
      { id: "w1-1", kind: "image", title: "Day 1–2 Divisibility Rules Anchor Chart", caption: "Wall reference. Print at 11×17.", thumb: "div-rules" },
      { id: "w1-2", kind: "pdf",   title: "Day 1: Divisibility Rules Lesson Plan",   caption: "Lesson 1 · Divisibility 2, 4, 8, 5, 10", thumb: "lesson-plan" },
      { id: "w1-3", kind: "pptx",  title: "Day 1 Divisibility Rules Visuals",        caption: "Divisibility 2, 5, 10, 4, 8 · 14 slides", thumb: "keywords" },
      { id: "w1-4", kind: "pdf",   title: "Day 1: Divisibility by 2, 4, 5, 10, 8",   caption: "Divisibility Rule Sort · Day 1 & 2", thumb: "sort-cards" },
      { id: "w1-5", kind: "doc",   title: "Day 2 Exit Ticket",                       caption: "Quick 6-question check", thumb: "doc-mini" },
    ],
  },
  {
    id: "wk2", name: "Week 2 · Prime Factorisation", subjectId: "math",
    description: "Factor trees and tree-of-products methods.",
    cards: [
      { id: "w2-1", kind: "youtube", title: "Prime Factorisation in 3 minutes", caption: "Math Antics · 3:14",            thumb: "yt-primes" },
      { id: "w2-2", kind: "image",   title: "Factor Tree Anchor",               caption: "Annotated example w/ 36",       thumb: "factor-tree" },
      { id: "w2-3", kind: "pdf",     title: "Practice Set B",                   caption: "20 problems w/ scaffolds",      thumb: "practice-b" },
    ],
  },
];

// Subject tint helper — Padlet-style header pills
function CPResSectionHeader({ section, onAdd, onMenu, open, onToggle }) {
  const subj = SUBJECT_BY_ID[section.subjectId];
  return (
    <div className={`cp-subj ${subj.cls}`} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <button onClick={onToggle} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 14px 5px 12px", borderRadius: 6,
        background: "var(--c)", color: "var(--paper)",
        fontSize: 14, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.2,
        boxShadow: "0 1px 0 rgba(20,22,32,0.04)",
      }}>
        <span style={{ display: "inline-flex", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s", opacity: 0.8 }}>
          <CPIcon name="chevron" size={11} />
        </span>
        {section.name}
      </button>
      <button onClick={onAdd} title="Add resource" style={{
        width: 28, height: 28, borderRadius: 6, background: "var(--c)", color: "var(--paper)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: 0.92,
      }}>
        <CPIcon name="plus" size={13} />
      </button>
      <button onClick={onMenu} title="Section options" style={{
        width: 28, height: 28, borderRadius: 6, background: "var(--c)", color: "var(--paper)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: 0.92,
      }}>
        <CPIcon name="dots" size={12} />
      </button>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{section.cards.length} {section.cards.length === 1 ? "resource" : "resources"}</span>
    </div>
  );
}

// Drawn thumbnails — different by kind. Keeps the prototype self-contained.
function CPResThumb({ card }) {
  const k = card.kind;
  if (k === "youtube") {
    return (
      <div style={{
        aspectRatio: "16/10", background: "linear-gradient(135deg, #1a1a23 0%, #2a3344 100%)",
        position: "relative", overflow: "hidden",
      }}>
        {/* fake video frame: planets */}
        <div style={{ position: "absolute", inset: 0,
          background: "radial-gradient(circle at 30% 60%, #5b8df1 12px, transparent 13px), radial-gradient(circle at 65% 45%, #f5a447 18px, transparent 19px), radial-gradient(circle at 85% 30%, #67c79b 10px, transparent 11px), radial-gradient(ellipse at 50% 100%, rgba(255,255,255,0.06), transparent 60%)",
        }} />
        <span style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          width: 36, height: 36, borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, paddingLeft: 3,
        }}>▶</span>
        <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 10, fontWeight: 600,
          color: "#fff", background: "rgba(0,0,0,.6)", padding: "2px 6px", borderRadius: 2 }}>YouTube</span>
      </div>
    );
  }
  if (k === "pdf") {
    return (
      <div style={{ aspectRatio: "16/12", background: "var(--ink-50)", position: "relative", overflow: "hidden",
        borderBottom: "1px solid var(--ink-150)" }}>
        {/* worksheet-like grid */}
        <div style={{ position: "absolute", inset: "10px 14px", background: "var(--paper)", padding: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, height: "100%" }}>
            {Array.from({length:8}).map((_,i)=>(
              <div key={i} style={{ background: "var(--ink-50)", border: "1px solid var(--ink-150)" }}>
                <div style={{ height: 6, background: "var(--ink-200)", margin: 3, opacity: 0.6 }} />
                <div style={{ height: 4, background: "var(--ink-150)", margin: 3, opacity: 0.5 }} />
              </div>
            ))}
          </div>
        </div>
        <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 10, fontWeight: 600,
          color: "#fff", background: "var(--urgent)", padding: "2px 6px", borderRadius: 2 }}>PDF</span>
      </div>
    );
  }
  if (k === "pptx") {
    return (
      <div style={{ aspectRatio: "16/12", background: "#2d6cc0", position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", overflow: "hidden" }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Keywords</span>
        <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 10, fontWeight: 600,
          color: "#fff", background: "rgba(0,0,0,.35)", padding: "2px 6px", borderRadius: 2 }}>PPTX</span>
      </div>
    );
  }
  if (k === "doc") {
    return (
      <div style={{ aspectRatio: "16/12", background: "var(--paper)", position: "relative",
        padding: "14px 18px", overflow: "hidden", borderBottom: "1px solid var(--ink-150)" }}>
        {Array.from({length:6}).map((_,i)=>(
          <div key={i} style={{ height: 4, background: "var(--ink-200)",
            margin: "5px 0", width: `${[90,70,80,55,75,50][i]}%`, opacity: 0.7 }} />
        ))}
        <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 10, fontWeight: 600,
          color: "#fff", background: "#2a6fdb", padding: "2px 6px", borderRadius: 2 }}>DOC</span>
      </div>
    );
  }
  if (k === "image") {
    // Custom thumbnail for the "div-rules" rainbow rules card
    if (card.thumb === "div-rules") {
      const rows = ["#ef4655","#f08443","#e8a91a","#9ec03b","#38b85a","#1ab1a3","#3580f0","#5660d8","#8b48d4","#e54b94","#6c7385","#a87f3e"];
      return (
        <div style={{ aspectRatio: "16/12", background: "var(--paper)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "8px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-900)", textAlign: "center", marginBottom: 3 }}>Divisibility Rules 1–12</div>
            {rows.map((bg, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, height: 10 }}>
                <div style={{ width: 14, background: bg, color: "white", fontSize: 8, fontWeight: 700, textAlign: "center", lineHeight: "10px" }}>{i+1}</div>
                <div style={{ flex: 1, height: 4, background: "var(--ink-100)", margin: "0 4px 0 0" }} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (card.thumb === "factor-tree") {
      return (
        <div style={{ aspectRatio: "16/12", background: "var(--paper)", position: "relative", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="80%" height="80%" viewBox="0 0 200 140">
            <g fontFamily="var(--font-sans)" textAnchor="middle">
              <circle cx="100" cy="20" r="14" fill="#e6efff" stroke="#2b6cff"/>
              <text x="100" y="24" fontSize="11" fill="#1a3f99">36</text>
              <line x1="100" y1="34" x2="60" y2="60" stroke="#2b6cff"/>
              <line x1="100" y1="34" x2="140" y2="60" stroke="#2b6cff"/>
              <circle cx="60" cy="70" r="13" fill="#e6efff" stroke="#2b6cff"/>
              <text x="60" y="74" fontSize="11" fill="#1a3f99">4</text>
              <circle cx="140" cy="70" r="13" fill="#e6efff" stroke="#2b6cff"/>
              <text x="140" y="74" fontSize="11" fill="#1a3f99">9</text>
              <line x1="60" y1="83" x2="40" y2="105" stroke="#2b6cff"/>
              <line x1="60" y1="83" x2="80" y2="105" stroke="#2b6cff"/>
              <line x1="140" y1="83" x2="120" y2="105" stroke="#2b6cff"/>
              <line x1="140" y1="83" x2="160" y2="105" stroke="#2b6cff"/>
              <text x="40" y="120" fontSize="10" fill="#1a3f99" fontWeight="600">2</text>
              <text x="80" y="120" fontSize="10" fill="#1a3f99" fontWeight="600">2</text>
              <text x="120" y="120" fontSize="10" fill="#1a3f99" fontWeight="600">3</text>
              <text x="160" y="120" fontSize="10" fill="#1a3f99" fontWeight="600">3</text>
            </g>
          </svg>
        </div>
      );
    }
    if (card.thumb === "mult-chart") {
      const colors = ["#e6efff","#fbe2d8","#fcefd0","#e2f3e8","#d8f1f0","#ece5fa","#fbe1ec","#ebedf1"];
      return (
        <div style={{ aspectRatio: "16/12", background: "var(--paper)", padding: 8,
          display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 1, overflow: "hidden" }}>
          {Array.from({length:96}).map((_,i)=>(
            <div key={i} style={{ aspectRatio: "1/1", background: colors[i%colors.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, color: "var(--ink-700)" }}>{(i%12)+1}</div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ aspectRatio: "16/12", background: "linear-gradient(180deg, var(--math-light), #fff)" }} />
    );
  }
  if (k === "link") {
    return (
      <div style={{ aspectRatio: "16/10", background: "linear-gradient(135deg, #f6f7f9, #eef0f4)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        color: "var(--ink-500)", fontSize: 12, fontWeight: 500, position: "relative" }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: "#14b87a", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>K</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>Khan Academy</span>
          <span style={{ fontSize: 10, color: "var(--ink-400)" }}>khanacademy.org</span>
        </div>
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Resource card
// ─────────────────────────────────────────────────────────────────────
function CPResCard({ card }) {
  return (
    <div style={{
      background: "var(--paper)", borderRadius: 8, overflow: "hidden",
      border: "1px solid var(--ink-150)",
      boxShadow: "0 1px 2px rgba(20,22,32,.04), 0 1px 3px rgba(20,22,32,.04)",
      display: "flex", flexDirection: "column",
      transition: "box-shadow .12s, transform .12s",
      cursor: "pointer", position: "relative",
    }} onMouseEnter={(e)=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(20,22,32,.10), 0 1px 3px rgba(20,22,32,.04)";}}
       onMouseLeave={(e)=>{e.currentTarget.style.boxShadow="0 1px 2px rgba(20,22,32,.04), 0 1px 3px rgba(20,22,32,.04)";}}>
      <CPResThumb card={card} />
      <button style={{
        position: "absolute", top: 8, right: 8, width: 22, height: 22,
        borderRadius: 5, background: "rgba(255,255,255,.92)", color: "var(--ink-500)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,.12)",
      }} title="Card options"><CPIcon name="dots" size={12} /></button>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.3, textWrap: "pretty" }}>{card.title}</div>
        {card.caption && (
          <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4, lineHeight: 1.4, textWrap: "pretty" }}>{card.caption}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Composer (matches screenshot 2)
// ─────────────────────────────────────────────────────────────────────
function CPResComposer({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: "absolute", right: 20, bottom: 20,
      width: 340, background: "var(--paper)", borderRadius: 14,
      boxShadow: "0 12px 40px rgba(20,22,32,.18), 0 1px 3px rgba(20,22,32,.06)",
      border: "1px solid var(--ink-150)",
      padding: "14px 14px 12px", zIndex: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <button onClick={onClose} style={{ padding: 4, color: "var(--ink-500)" }}><CPIcon name="x" size={14} /></button>
        <button title="Expand" style={{ padding: 4, color: "var(--ink-500)" }}><CPIcon name="arrowR" size={14} style={{ transform: "rotate(-45deg)" }} /></button>
        <button title="Minimize" style={{ padding: 4, color: "var(--ink-500)" }}><span style={{ display: "inline-block", width: 12, height: 1, background: "var(--ink-500)" }} /></button>
        <div style={{ flex: 1 }} />
        <button title="AI" style={{ padding: 4, color: "var(--ink-500)" }}><CPIcon name="sparkle" size={14} /></button>
        <button disabled style={{ padding: "5px 14px", background: "var(--ink-100)", color: "var(--ink-400)", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Publish</button>
      </div>
      <input placeholder="Subject" style={{
        width: "100%", padding: "6px 0", border: "none", outline: "none",
        fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: "var(--ink-900)",
        marginBottom: 10,
      }} />
      {/* Tool strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0,
        background: "var(--ink-50)",
        border: "1.5px dashed var(--ink-200)", borderRadius: 8, padding: "12px 6px",
        marginBottom: 10,
      }}>
        {[
          {icon:"upload", lbl:"Upload"},
          {icon:"camera", lbl:"Camera"},
          {icon:"sparkle", lbl:"AI image"},
          {icon:"link",   lbl:"Link"},
          {icon:"search", lbl:"Search"},
          {icon:"grid",   lbl:"All tools"},
        ].map((t,i)=>(
          <button key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: 4, color: "var(--ink-500)", fontSize: 9, fontWeight: 500,
            borderRight: i < 5 ? "1px solid var(--ink-150)" : "none",
          }}>
            <CPIcon name={t.icon === "upload" ? "arrowR" : t.icon === "camera" ? "image" : t.icon} size={15} />
            {i === 5 && <span>{t.lbl}</span>}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 12 }}>
        Add an image, video, audio, link, or file.
      </div>
      <textarea placeholder="Write something fantastic…" style={{
        width: "100%", minHeight: 80, padding: "4px 0", border: "none", outline: "none",
        fontSize: 16, color: "var(--ink-700)", resize: "none",
        fontFamily: "inherit",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 10, borderTop: "1px solid var(--ink-100)" }}>
        <button style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-700)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, border: "1px solid var(--ink-300)" }} /> White <CPIcon name="chevronD" size={9} />
        </button>
        <button style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-700)" }}>
          § Week 2: Multiplication 2 <CPIcon name="chevronD" size={9} />
        </button>
        <div style={{ flex: 1 }} />
        <button style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-500)" }}>
          <CPIcon name="plus" size={10} /> Fields
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ARTBOARD — Resources board for Unit 2 Math (Multiplication & Division)
// ─────────────────────────────────────────────────────────────────────
function ABResourcesBoard() {
  const [open, setOpen] = React.useState({ general: true, wk1: true, wk2: true });
  const [composer, setComposer] = React.useState(false);
  const [view, setView] = React.useState("masonry"); // masonry | list

  return (
    <div className="cp-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <CPTopBar view="subject" />

      {/* Resource board header */}
      <div style={{
        padding: "16px 22px 14px", borderBottom: "1px solid var(--ink-100)",
        display: "flex", alignItems: "flex-end", gap: 14,
      }}>
        <div className="cp-subj math" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 999, background: "var(--c)", color: "var(--paper)" }}>Math</span>
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>Unit 2 · Multi-digit Multiplication & Division</span>
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>· Wk 5–10</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Unit resources</h1>
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3 }}>
            All resources for this unit. Group by week, day, or activity. Drop files, paste links, embed videos.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "inline-flex", padding: 2, background: "var(--ink-100)", borderRadius: 5 }}>
            <button onClick={()=>setView("masonry")} style={{ padding: "4px 8px", fontSize: 11, fontWeight: 500, borderRadius: 4,
              background: view === "masonry" ? "var(--paper)" : "transparent", color: view === "masonry" ? "var(--ink-900)" : "var(--ink-500)",
              boxShadow: view === "masonry" ? "0 1px 2px rgba(0,0,0,.06)" : "none" }}>
              <CPIcon name="grid" size={12} />
            </button>
            <button onClick={()=>setView("list")} style={{ padding: "4px 8px", fontSize: 11, fontWeight: 500, borderRadius: 4,
              background: view === "list" ? "var(--paper)" : "transparent", color: view === "list" ? "var(--ink-900)" : "var(--ink-500)" }}>
              <CPIcon name="list" size={12} />
            </button>
          </div>
          <button style={{ padding: "5px 10px", border: "1px solid var(--ink-200)", borderRadius: 5, fontSize: 12, color: "var(--ink-700)",
            display: "inline-flex", alignItems: "center", gap: 5 }}>
            <CPIcon name="filter" size={11} /> Filter
          </button>
          <button style={{ padding: "5px 10px", border: "1px solid var(--ink-200)", borderRadius: 5, fontSize: 12, color: "var(--ink-700)" }}>
            Share
          </button>
        </div>
      </div>

      {/* Toolbar — subject scope, search, sort */}
      <div style={{ padding: "8px 22px", display: "flex", alignItems: "center", gap: 10, background: "var(--ink-50)",
        borderBottom: "1px solid var(--ink-100)" }}>
        <span style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>Scope</span>
        <button style={{ padding: "2px 9px", fontSize: 11, fontWeight: 500, background: "var(--paper)",
          color: "var(--ink-900)", border: "1px solid var(--ink-200)", borderRadius: 999 }}>Unit 2</button>
        <button style={{ padding: "2px 9px", fontSize: 11, color: "var(--ink-500)" }}>This subject (all year)</button>
        <button style={{ padding: "2px 9px", fontSize: 11, color: "var(--ink-500)" }}>Cross-subject…</button>
        <div style={{ flex: 1 }} />
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--ink-200)", borderRadius: 5, color: "var(--ink-500)", fontSize: 12, width: 240, background: "var(--paper)" }}>
          <CPIcon name="search" size={12} />
          <span style={{ flex: 1, textAlign: "left" }}>Search resources…</span>
        </button>
      </div>

      {/* Board body */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 90px", position: "relative" }}>
        {RES_SECTIONS.map(section => (
          <section key={section.id} style={{ marginBottom: 28 }}>
            <CPResSectionHeader section={section}
              open={open[section.id]}
              onToggle={()=>setOpen(o => ({ ...o, [section.id]: !o[section.id] }))}
              onAdd={()=>setComposer(true)}
              onMenu={()=>{}} />
            {open[section.id] && (
              <>
                {section.description && (
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: -6, marginBottom: 12, paddingLeft: 4 }}>{section.description}</div>
                )}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: view === "list" ? "1fr" : "repeat(4, minmax(190px, 1fr))",
                  gap: 12,
                }}>
                  {section.cards.map(c => <CPResCard key={c.id} card={c} />)}
                  {/* "+ Add" empty card */}
                  <button onClick={()=>setComposer(true)} style={{
                    aspectRatio: view === "list" ? "auto" : "16/14",
                    minHeight: view === "list" ? 56 : "auto",
                    border: "1.5px dashed var(--ink-200)", borderRadius: 8,
                    background: "transparent",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 4, color: "var(--ink-400)", fontSize: 12,
                  }} onMouseEnter={(e)=>{e.currentTarget.style.borderColor="var(--math)"; e.currentTarget.style.color="var(--math)";}}
                     onMouseLeave={(e)=>{e.currentTarget.style.borderColor="var(--ink-200)"; e.currentTarget.style.color="var(--ink-400)";}}>
                    <CPIcon name="plus" size={16} />
                    <span>Add resource</span>
                  </button>
                </div>
              </>
            )}
          </section>
        ))}

        {/* Add section CTA */}
        <button style={{
          padding: "8px 14px", border: "1.5px dashed var(--ink-200)", borderRadius: 7,
          color: "var(--ink-500)", fontSize: 12, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <CPIcon name="plus" size={12} /> Add section
        </button>
      </div>

      {/* FAB */}
      <button onClick={()=>setComposer(c=>!c)} style={{
        position: "absolute", right: 24, bottom: 22,
        padding: "9px 17px 9px 14px", background: "var(--urgent)", color: "var(--paper)",
        borderRadius: 999, fontSize: 13, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(217,43,60,.32), 0 1px 3px rgba(217,43,60,.18)",
        display: "inline-flex", alignItems: "center", gap: 6, zIndex: 10,
      }}>
        <CPIcon name="plus" size={14} /> Post
      </button>

      <CPResComposer open={composer} onClose={()=>setComposer(false)} />
    </div>
  );
}

Object.assign(window, { ABResourcesBoard, CPResCard, CPResThumb, CPResSectionHeader, RES_SECTIONS });
