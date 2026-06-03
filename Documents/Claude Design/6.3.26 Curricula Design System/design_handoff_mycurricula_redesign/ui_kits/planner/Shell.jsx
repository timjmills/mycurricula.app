/* Curricula Planner — app shell: banner, top bar, icon rail, view routing. */
const { useState } = React;

const NAV = [
  { id: "weekly",  name: "Weekly",  icon: "grid" },
  { id: "daily",   name: "Daily",   icon: "calendar-day" },
  { id: "year",    name: "Year",    icon: "layers" },
  { id: "subject", name: "Subject", icon: "book" },
];
const RAIL = [
  { id: "weekly", icon: "grid", t: "Weekly" },
  { id: "daily", icon: "calendar-day", t: "Daily" },
  { id: "year", icon: "layers", t: "Year" },
  { id: "subject", icon: "book", t: "Subject" },
  { id: "catchup", icon: "flag", t: "Catch-up" },
  { id: "teach", icon: "present", t: "Teach" },
];

function MasterBanner({ onExit }) {
  return (
    <div className="banner">
      <Icon name="users" />
      <span>Editing the <b>Team Curriculum</b> — changes affect every teacher on the Grade 5 team.</span>
      <span className="spacer" />
      <button onClick={onExit}>Done editing</button>
    </div>
  );
}

function TopBar({ view, setView, personal, setPersonal, mode, setMode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="glyph"><Icon name="book" style={{ color: "#fff" }} sw={2} /></span>
        <div><b>mycurricula<span style={{ color: "#C9871A" }}>.app</span></b><span className="sub">Grade 5 · Rivera</span></div>
      </div>
      <div className="weeknav">
        <button className="iconbtn"><Icon name="chevL" /></button>
        <div><div className="wk">Week 28</div><div className="dt">Mar 9 – 13</div></div>
        <button className="iconbtn"><Icon name="chevR" /></button>
      </div>
      <div className="topspace" />
      <nav className="viewtabs">
        {NAV.map((n) => (
          <button key={n.id} className={"viewtab" + (view === n.id ? " on" : "")} onClick={() => setView(n.id)}>
            <Icon name={n.icon} /> {n.name}
          </button>
        ))}
      </nav>
      <div className="topspace" />
      <div className="seg">
        <button className={!personal ? "" : "on"} onClick={() => setPersonal(true)}>Personal</button>
        <button className={personal ? "" : "on"} onClick={() => setPersonal(false)}><Icon name="users" /> Team</button>
      </div>
      <button className="iconbtn" title="Undo"><Icon name="undo" /></button>
      <button className="iconbtn" title="Notifications"><Icon name="bell" /></button>
      <span className="avatar">RM</span>
    </header>
  );
}

function App() {
  const [view, setView] = useState("weekly");
  const [personal, setPersonal] = useState(true);

  const Views = {
    weekly: window.WeeklyView,
    daily: window.DailyView,
    year: window.YearView,
    subject: window.SubjectView,
    catchup: window.CatchUpView,
    settings: window.SettingsView,
    teach: window.TeachView,
  };
  const Current = Views[view] || (() => null);
  const isTeach = view === "teach";

  return (
    <div id="app">
      {!personal && <MasterBanner onExit={() => setPersonal(true)} />}
      <TopBar view={view} setView={setView} personal={personal} setPersonal={setPersonal} />
      <div className="bodyrow">
        <nav className="rail">
          {RAIL.map((r) => (
            <button key={r.id} className={"ri" + (view === r.id ? " on" : "")} title={r.t} onClick={() => setView(r.id)}>
              <Icon name={r.icon} />
            </button>
          ))}
          <span className="sp" />
          <button className={"ri" + (view === "settings" ? " on" : "")} title="Settings" onClick={() => setView("settings")}>
            <Icon name="settings" />
          </button>
        </nav>
        <main className="canvas" style={isTeach ? { overflow: "hidden" } : null}>
          <Current personal={personal} setView={setView} />
        </main>
      </div>
    </div>
  );
}
window.App = App;
