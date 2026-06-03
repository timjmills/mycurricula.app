/* Teach board — the projector-facing teaching surface with live widgets. */
const { useEffect, useRef } = React;

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function TimerWidget() {
  const [sec, setSec] = React.useState(600);
  const [run, setRun] = React.useState(false);
  const ref = useRef();
  useEffect(() => {
    if (run) {
      ref.current = setInterval(() => setSec((s) => (s > 0 ? s - 1 : (setRun(false), 0))), 1000);
      return () => clearInterval(ref.current);
    }
  }, [run]);
  const low = sec <= 30;
  return (
    <div className="widget">
      <div className="wh"><span className="wi" style={{ background: "var(--grad-mint)" }}><Icon name="clock" style={{ color: "#1A6B72" }} /></span><span className="wt">Timer</span></div>
      <div className="w-timer">
        <div className="clock" style={{ color: low ? "var(--danger)" : "var(--ink)" }}>{fmt(sec)}</div>
        <div className="ctl">
          <button className="btn btn-primary btn-sm" onClick={() => setRun(!run)}><Icon name={run ? "pause" : "play"} /> {run ? "Pause" : "Start"}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setRun(false); setSec(600); }}><Icon name="rotate" /></button>
        </div>
      </div>
    </div>
  );
}

function TrafficWidget() {
  const [on, setOn] = React.useState("amber");
  return (
    <div className="widget">
      <div className="wh"><span className="wi" style={{ background: "var(--honey-50)" }}><Icon name="bell" style={{ color: "var(--honey-600)" }} /></span><span className="wt">Noise level</span></div>
      <div className="w-traffic">
        <div className="lamp">
          {["r", "a", "g"].map((k) => (
            <i key={k} className={k + (on === ({ r: "red", a: "amber", g: "green" }[k]) ? " on" : "")}
              onClick={() => setOn({ r: "red", a: "amber", g: "green" }[k])} style={{ cursor: "pointer" }} />
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-soft)", textTransform: "capitalize" }}>{on === "amber" ? "Partner talk" : on === "green" ? "Group work" : "Silent / focus"}</div>
      </div>
    </div>
  );
}

const ROSTER = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Eli", "Ivy", "Kai", "Luna", "Omar", "Nia", "Theo"];
function NamesWidget() {
  const [pick, setPick] = React.useState(null);
  return (
    <div className="widget">
      <div className="wh"><span className="wi" style={{ background: "var(--grad-dawn)" }}><Icon name="users" style={{ color: "#fff" }} /></span><span className="wt">Pick a student</span></div>
      <div className="w-names">
        {ROSTER.map((n) => (
          <span key={n} style={pick === n ? { background: "var(--brand-500)", color: "#fff", boxShadow: "var(--sh-brand)" } : null}>{n}</span>
        ))}
      </div>
      <button className="btn btn-honey btn-sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
        onClick={() => setPick(ROSTER[Math.floor(Math.random() * ROSTER.length)])}>
        <Icon name="sparkle" /> {pick ? `It's ${pick}!` : "Pick a name"}
      </button>
    </div>
  );
}

function WorkModeWidget() {
  const [m, setM] = React.useState(1);
  const modes = [
    { t: "Solo", c: "var(--subj-10)", icon: "pencil" },
    { t: "Partner", c: "var(--subj-13)", icon: "users" },
    { t: "Group", c: "var(--subj-5)", icon: "users" },
    { t: "Hands up", c: "var(--honey-500)", icon: "hand" },
  ];
  return (
    <div className="widget">
      <div className="wh"><span className="wi" style={{ background: "var(--grad-brand)" }}><Icon name="hand" style={{ color: "var(--brand-600)" }} /></span><span className="wt">How we work</span></div>
      <div className="worksym">
        {modes.map((w, i) => (
          <div className="ws" key={i} onClick={() => setM(i)} style={{ cursor: "pointer", opacity: m === i ? 1 : 0.4 }}>
            <span className="wb" style={{ background: w.c, boxShadow: m === i ? "0 8px 18px -8px " + w.c : "none" }}><Icon name={w.icon} /></span>
            {w.t}
          </div>
        ))}
      </div>
    </div>
  );
}

function NowNextWidget() {
  return (
    <div className="widget wide">
      <div className="wh"><span className="wi" style={{ background: "var(--brand-50)" }}><Icon name="play" style={{ color: "var(--brand-600)" }} /></span><span className="wt">Now &amp; next</span></div>
      <div className="nownext">
        <div className="nn" style={window.sv("reading")}>
          <span className="ni"><Icon name="book" /></span>
          <div><div className="nl">Now · 11:00</div><div className="nt">Reading — Inferring character traits</div></div>
          <span className="badge b-prog" style={{ marginLeft: "auto" }}>Live</span>
        </div>
        <div className="nn" style={window.sv("grammar")}>
          <span className="ni"><Icon name="list" /></span>
          <div><div className="nl">Next · 2:30</div><div className="nt">Grammar — Coordinating conjunctions</div></div>
        </div>
      </div>
    </div>
  );
}

function ObjectiveWidget() {
  return (
    <div className="widget wide">
      <div className="wh"><span className="wi" style={{ background: "var(--reading-tint)" }}><Icon name="target" style={{ color: "var(--reading-ink)" }} /></span><span className="wt">Today's goal</span></div>
      <div className="w-obj">
        <div className="big">I can infer a character's traits using evidence from the text.</div>
        <ul>
          <li>Find a clue in what the character says or does</li>
          <li>Name the trait it shows</li>
          <li>Write it as “I think ___ because ___”</li>
        </ul>
      </div>
    </div>
  );
}

function TeachView() {
  return (
    <div className="teach">
      <div className="teach-bar">
        <span className="brand"><span className="glyph"><Icon name="book" style={{ color: "#fff" }} /></span></span>
        <h2>Teaching board</h2>
        <span className="badge b-prog"><span className="d" style={{ background: "var(--progress)" }} /> Tuesday · Period 3</span>
        <span className="spacer" />
        <button className="btn btn-secondary btn-sm"><Icon name="grid" /> Add widget</button>
        <button className="btn btn-primary btn-sm"><Icon name="sun" /> Fullscreen</button>
      </div>
      <div className="tboard">
        <NowNextWidget />
        <TimerWidget />
        <TrafficWidget />
        <ObjectiveWidget />
        <NamesWidget />
        <WorkModeWidget />
      </div>
    </div>
  );
}

window.TeachView = TeachView;
