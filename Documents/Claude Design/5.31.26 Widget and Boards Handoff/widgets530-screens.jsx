// widgets530-screens.jsx — app bar, 5 panel screens, Widget Library browser, main App
const { I } = window;
const {
  LearningTarget, NowNextThen, Directions, MaterialsNeeded, WorkCompleted,
  Transition, AttentionSignal, VoiceMovement, WhenDone, StudentJobs,
  ExitTicket, UnderstandingCheck, HelpQueue, ParticipationTracker, QuestionParkingLot,
  CenterRotation, TeacherTable, Vocabulary, SentenceFrames, DiscussionProtocol,
  BrainBreak, CalmCorner, ClassPoints, TeacherNotes, MiniWhiteboard, PadletNote
} = window;

const HouseLogo = () =>
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9h14v-9" /></svg>;

function TeacherAvatar({ s = 34 }) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span className="av" style={{ width: s, height: s, background: "linear-gradient(160deg,#f3d9c4,#e8b894)" }}>
        <span style={{ color: "#9a6b46" }}>{I.user({ s: s * 0.6 })}</span>
      </span>
      <span style={{ position: "absolute", right: 0, bottom: 0, width: 9, height: 9, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff" }} />
    </span>);

}

function AppBar({ title, panel }) {
  return (
    <div className="appbar">
      <button style={{ color: "var(--ink-soft)" }}>{I.menu({ s: 24 })}</button>
      <span className="logo" style={{ background: "#d9f0e0" }}><span style={{ color: "var(--green-accent)" }}><HouseLogo /></span></span>
      <div className="name">{title} <span className="chev">{I.chevD({ s: 18 })}</span></div>
      {panel && <span className="panel-pill" style={{ marginLeft: 24 }}>{panel}</span>}
      <div className="right">
        <button className="boxbtn">{I.moreH({ s: 18 })}</button>
        <button>{I.pin({ s: 19 })}</button>
        <button>{I.expand({ s: 19 })}</button>
        <button>{I.sun({ s: 19 })}</button>
        <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}><TeacherAvatar s={34} /><span className="chev">{I.chevD({ s: 16 })}</span></span>
      </div>
    </div>);

}
/* center the panel pill: appbar uses margin-auto trick via spacer */
function PanelScreen({ title, panel, children }) {
  return (
    <div className="screen">
      <div className="appbar">
        <button style={{ color: "var(--ink-soft)" }}>{I.menu({ s: 24 })}</button>
        <span className="logo" style={{ background: "#d9f0e0" }}><span style={{ color: "var(--green-accent)" }}><HouseLogo /></span></span>
        <div className="name">{title} <span className="chev">{I.chevD({ s: 18 })}</span></div>
        <span className="panel-pill" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>{panel}</span>
        <div className="right" style={{ position: "relative" }}>
          <button className="boxbtn">{I.moreH({ s: 18 })}</button>
          <button>{I.pin({ s: 19 })}</button><button>{I.expand({ s: 19 })}</button><button>{I.sun({ s: 19 })}</button>
          <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}><TeacherAvatar s={34} /><span className="chev">{I.chevD({ s: 16 })}</span></span>
        </div>
      </div>
      <div className="screen-body">{children}</div>
    </div>);

}

const G = ({ cols, children, mb }) => <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20, alignItems: "start", marginBottom: mb ? 20 : 0 }}>{children}</div>;
const C2 = "minmax(0,1.4fr) minmax(0,1fr)";
const C3 = "repeat(3,minmax(0,1fr))";

/* ── Widget Library browser ───────────────────────────────────── */
const LIB = [
{ name: "Learning Target", desc: "Share the learning goal for the lesson.", fam: "yellow", icon: I.target, added: true },
{ name: "Now–Next–Then", desc: "Show students the plan for the lesson.", fam: "blue", icon: I.list },
{ name: "Directions", desc: "Display step-by-step instructions.", fam: "green", icon: I.clipChk },
{ name: "Materials Needed", desc: "List the materials students will use.", fam: "purple", icon: I.backpack, star: false },
{ name: "Work Completed", desc: "Track and celebrate student progress.", fam: "orange", icon: I.clipChk, fav: true },
{ name: "Transition", desc: "Keep transitions smooth and on track.", fam: "green", icon: I.clock, fav: true },
{ name: "Attention Signal", desc: "Get attention quickly and kindly.", fam: "blue", icon: I.mega, fav: true },
{ name: "Student Jobs", desc: "Assign and display student responsibilities.", fam: "yellow", icon: I.flag, star: false },
{ name: "Exit Ticket", desc: "Collect quick responses at the end of class.", fam: "purple", icon: I.ticket, fav: true },
{ name: "Understanding Check", desc: "Check for understanding in real time.", fam: "green", icon: I.target, star: false },
{ name: "Help Queue", desc: "Manage student needs and support.", fam: "pink", icon: I.users, fav: true },
{ name: "Vocabulary", desc: "Highlight and review key words.", fam: "blue", icon: I.book, star: false }];

const FAVS = [
{ name: "Learning Target", fam: "purple", icon: I.target },
{ name: "Timer", fam: "green", icon: I.clock },
{ name: "Student Groups", fam: "blue", icon: I.users },
{ name: "Exit Ticket", fam: "purple", icon: I.ticket },
{ name: "Work Completed", fam: "green", icon: I.clipChk },
{ name: "Help Queue", fam: "pink", icon: I.users }];

function Star({ on }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "#f6b51e" : "none"} stroke={on ? "#f6b51e" : "#c4c9d2"} strokeWidth="2" strokeLinejoin="round"><path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z" /></svg>;
}
function LibCard({ it }) {
  const added = it.added;
  return (
    <div style={{ position: "relative", border: added ? "1.5px solid var(--green-accent)" : "1px solid var(--line)", borderRadius: 18,
      background: added ? "var(--yellow-grad)" : "#fff", padding: 16, boxShadow: "var(--shadow-card)" }}>
      <span style={{ position: "absolute", top: 14, right: 14 }}><Star on={it.fav || added} /></span>
      <div style={{ borderRadius: 12, background: `var(--${it.fam}-soft)`, padding: "16px 14px", marginBottom: 13, display: "flex", alignItems: "center", gap: 12, minHeight: 78 }}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: `var(--${it.fam}-chip)`, color: `var(--${it.fam}-accent)`, display: "grid", placeItems: "center", flex: "none" }}>{it.icon({ s: 22 })}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: 7, width: "80%", borderRadius: 9, background: `var(--${it.fam}-line)`, marginBottom: 7 }} />
          <div style={{ height: 7, width: "55%", borderRadius: 9, background: `var(--${it.fam}-line)`, opacity: .7 }} />
        </div>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 3 }}>{it.name}</div>
      <div style={{ fontSize: 13, color: "var(--ink-mute)", fontWeight: 500, lineHeight: 1.4, marginBottom: 14, minHeight: 36 }}>{it.desc}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {added ?
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--green-accent)", fontWeight: 800, fontSize: 14 }}>Added {I.check({ s: 16 })}</span> :
        <button style={{ padding: "9px 26px", borderRadius: 11, border: "1.5px solid var(--blue-line)", color: "var(--blue-accent)", fontWeight: 700, fontSize: 14, background: "#fff" }}>Add</button>}
      </div>
    </div>);

}
function SideItem({ icon, label, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 11, cursor: "pointer",
      background: active ? "#efe9fb" : "transparent", color: active ? "var(--purple-accent)" : "var(--ink-soft)", fontWeight: active ? 700 : 600, fontSize: 14.5 }}>
      <span style={{ color: active ? "var(--purple-accent)" : "var(--ink-faint)" }}>{icon({ s: 19 })}</span>{label}
    </div>);

}
function WidgetLibrary() {
  const filters = ["All", "Lesson", "Management", "Assessment", "Language"];
  return (
    <div className="screen">
      <AppBar title="Widget Library" />
      <div style={{ display: "flex", borderTop: "1px solid var(--line)" }}>
        {/* sidebar */}
        <div style={{ width: 226, flex: "none", borderRight: "1px solid var(--line)", padding: "22px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--ink-faint)", padding: "0 12px 8px" }}>BROWSE</div>
          <SideItem icon={I.grid} label="All Widgets" />
          <SideItem icon={I.star} label="Favorites" active />
          <SideItem icon={I.clock} label="Recently Used" />
          <SideItem icon={I.spark} label="Suggested" />
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--ink-faint)", padding: "22px 12px 8px" }}>CATEGORIES</div>
          <SideItem icon={I.book} label="Lesson" />
          <SideItem icon={I.clipChk} label="Management" />
          <SideItem icon={I.target} label="Assessment" />
          <SideItem icon={I.msg} label="Language" />
          <SideItem icon={I.heart} label="Well-Being" />
          <SideItem icon={I.wrench} label="Utilities" />
          <div style={{ marginTop: "auto", background: "var(--purple-grad)", border: "1px solid var(--purple-line)", borderRadius: 16, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 8, color: "var(--purple-accent)" }}>{I.boxIco({ s: 34 })}<span style={{ color: "#f6c34d" }}>{I.spark({ s: 14 })}</span></div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--purple-accent)", marginBottom: 5 }}>Customize your board</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-mute)", fontWeight: 500, lineHeight: 1.45 }}>Add the widgets you use the most to build the perfect classroom flow.</div>
          </div>
        </div>
        {/* main */}
        <div style={{ flex: 1, minWidth: 0, padding: "22px 24px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 13, border: "1px solid var(--line)", color: "var(--ink-faint)" }}>
              {I.search({ s: 18 })}<span style={{ fontSize: 14.5, fontWeight: 500 }}>Search widgets</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {filters.map((f, i) =>
              <span key={f} style={{ padding: "8px 15px", borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                background: i === 0 ? "var(--purple-accent)" : "#eef0f4", color: i === 0 ? "#fff" : "var(--ink-soft)" }}>{f}</span>
              )}
              <span style={{ padding: "8px 15px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, background: "#fbe8cf", color: "#b9842a", display: "inline-flex", alignItems: "center", gap: 6 }}>{I.star({ s: 14 })} Favorites</span>
            </div>
          </div>
          {/* favorites band */}
          <div style={{ background: "linear-gradient(180deg,#fdf6e3,#fdf1d4)", border: "1px solid #f3e3b4", borderRadius: 18, padding: "16px 18px", marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 800 }}><span style={{ color: "#f6b51e" }}>{I.star({ s: 18 })}</span> Favorites</span>
              <button style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 11, background: "#fff", boxShadow: "var(--shadow-inner)", fontSize: 13.5, fontWeight: 700, color: "var(--ink-soft)" }}>{I.gear({ s: 15 })} Manage Favorites</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 12 }}>
              {FAVS.map((f, i) =>
              <div key={i} style={{ position: "relative", background: "#fff", borderRadius: 13, padding: "16px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, boxShadow: "var(--shadow-inner)" }}>
                  <span style={{ position: "absolute", top: 8, right: 8 }}><Star on /></span>
                  <span style={{ width: 40, height: 40, borderRadius: 11, background: `var(--${f.fam}-chip)`, color: `var(--${f.fam}-accent)`, display: "grid", placeItems: "center" }}>{f.icon({ s: 21 })}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{f.name}</span>
                </div>
              )}
            </div>
          </div>
          {/* widget grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
            {LIB.map((it, i) => <LibCard key={i} it={it} />)}
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px dashed var(--purple-line)", padding: "16px", textAlign: "center", color: "var(--ink-soft)", fontSize: 14.5, fontWeight: 600, background: "var(--purple-grad)" }}>
        <span style={{ color: "var(--purple-accent)", marginRight: 6 }}>✦</span> Drag widgets onto your board or tap <strong style={{ color: "var(--ink)" }}>Add</strong>. 🎉
      </div>
    </div>);

}

/* ── main App ─────────────────────────────────────────────────── */
function App() {
  return (
    <div className="page">
      <div className="page-head"><h1>Widget Library &amp; Panels</h1><span className="sub">5.30.26 · full widget catalogue + 5 board panels</span></div>
      <p className="page-note">The browsable widget library plus every board panel — Lesson Essentials, Routines &amp; Classroom Management, Assessment &amp; Support, Small Groups &amp; Language Support, and Regulation &amp; Teacher Tools — each widget named and built in the same pastel system. Plus a Note / View widget that enlarges into a slideshow with notes.</p>

      <div className="section-label"><span className="t">Widget Library</span><span className="ln" /></div>
      <WidgetLibrary />

      <div className="section-label"><span className="t">Panel 1 · Lesson Essentials</span><span className="ln" /></div>
      <PanelScreen title="Lesson Essentials" panel="Panel 1 of 5">
        <G cols={C2} mb><LearningTarget /><NowNextThen /></G>
        <G cols={C3}><Directions /><MaterialsNeeded /><WorkCompleted /></G>
      </PanelScreen>

      <div className="section-label"><span className="t">Panel 2 · Routines &amp; Classroom Management</span><span className="ln" /></div>
      <PanelScreen title="Routines &amp; Classroom Management" panel="Panel 2 of 5">
        <G cols={C2} mb><Transition /><AttentionSignal /></G>
        <G cols={C3}><VoiceMovement /><WhenDone /><StudentJobs /></G>
      </PanelScreen>

      <div className="section-label"><span className="t">Panel 3 · Assessment &amp; Support</span><span className="ln" /></div>
      <PanelScreen title="Assessment &amp; Support" panel="Panel 3 of 5">
        <G cols={C3} mb><ExitTicket /><UnderstandingCheck /><HelpQueue /></G>
        <G cols="minmax(0,1fr) minmax(0,1.1fr)"><ParticipationTracker /><QuestionParkingLot /></G>
      </PanelScreen>

      <div className="section-label"><span className="t">Panel 4 · Small Groups &amp; Language Support</span><span className="ln" /></div>
      <PanelScreen title="Small Groups &amp; Language Support" panel="Panel 4 of 5">
        <G cols={C2} mb><CenterRotation /><TeacherTable /></G>
        <G cols={C3}><Vocabulary /><SentenceFrames /><DiscussionProtocol /></G>
      </PanelScreen>

      <div className="section-label"><span className="t">Panel 5 · Regulation &amp; Teacher Tools</span><span className="ln" /></div>
      <PanelScreen title="Regulation &amp; Teacher Tools" panel="Panel 5 of 5">
        <G cols={C3} mb><BrainBreak /><CalmCorner /><ClassPoints /></G>
        <G cols="minmax(0,1fr) minmax(0,1.35fr)"><TeacherNotes /><MiniWhiteboard /></G>
      </PanelScreen>

      <div className="section-label"><span className="t">Note / View Widget</span><span className="ln" /></div>
      <p className="page-note" style={{ marginBottom: 18 }}>A note that can hold multiple photos , texts, links, PDF pages, or other resources. Tap the expand icon (or the preview) to open the slideshow with notes on the right — arrow keys page through, Esc closes.</p>
      <div style={{ maxWidth: 420 }}><PadletNote /></div>
    </div>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);