/* Daily · Year · Subject · Catch-up · Settings surfaces. */
const StatusMark = window.StatusMark;

/* ---------- DAILY ---------- */
function DailyView({ setView }) {
  const day = window.WEEK[1]; // Tuesday
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow"><Icon name="calendar-day" style={{ width: 13, height: 13 }} /> Tuesday · Mar 10</span>
          <h1>Today at a glance</h1>
          <div className="lead">Your full teaching day, period by period.</div>
        </div>
        <div className="headactions">
          <button className="btn btn-secondary"><Icon name="present" /> Teach mode</button>
          <button className="btn btn-primary"><Icon name="plus" /> Add to today</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 22, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {day.map((l, j) =>
            l.event
              ? <div className="evcard" key={j} style={{ padding: "13px 16px" }}><Icon name="flag" /> {l.title}</div>
              : <DailyLesson key={j} l={l} onClick={() => setView && setView("subject")} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel" style={{ padding: 18 }}>
            <div className="col-h" style={{ marginBottom: 12 }}><Icon name="flag" style={{ width: 13, height: 13 }} /> Don't miss</div>
            <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>Picture-day retakes at 10:30 — send the list with your line leader.</div>
          </div>
          <div className="panel" style={{ padding: 18 }}>
            <div className="col-h" style={{ marginBottom: 12 }}><Icon name="check" style={{ width: 13, height: 13 }} /> Progress today</div>
            <Metric v="2 / 5" l="lessons taught" name="check" bg="var(--done-tint)" fg="var(--done)" />
            <div style={{ height: 12 }} />
            <Metric v="62%" l="week complete" name="bolt" bg="var(--brand-50)" fg="var(--brand-600)" />
          </div>
        </div>
      </div>
    </div>
  );
}
function Metric({ v, l, name, bg, fg }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: bg, color: fg, display: "grid", placeItems: "center", flex: "0 0 auto" }}><Icon name={name} style={{ width: 19, height: 19 }} /></span>
      <div><div style={{ fontFamily: "var(--font-display-sm)", fontWeight: 800, fontSize: 22, color: "var(--ink)", lineHeight: 1 }}>{v}</div><div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>{l}</div></div>
    </div>
  );
}
function DailyLesson({ l, onClick }) {
  const s = window.SUBJ[l.subject];
  return (
    <div className={"lcard" + (l.modified ? " modified" : "")} style={{ ...window.sv(l.subject), padding: "15px 17px" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--c)", color: "#fff", display: "grid", placeItems: "center", flex: "0 0 auto", fontFamily: "var(--font-display-sm)", fontWeight: 800, fontSize: 13 }}>{l.time}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="meta" style={{ marginBottom: 0 }}><span className="sd" />{s.name}{l.std && <span className="std" style={{ marginLeft: 8 }}>{l.std}</span>}</div>
          <h4 style={{ fontSize: 15, marginTop: 5 }}>{l.title}</h4>
          <div className="desc" style={{ fontSize: 12.5 }}>{l.desc}</div>
        </div>
        <StatusMark status={l.status} />
      </div>
    </div>
  );
}

/* ---------- YEAR / ROADMAP ---------- */
function YearView() {
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow"><Icon name="layers" style={{ width: 13, height: 13 }} /> 2025–26 · Grade 5</span>
          <h1>Year roadmap</h1>
          <div className="lead">Every subject's units across the year. Color flows from subject to unit.</div>
        </div>
        <div className="headactions">
          <div className="seg"><button className="on">By unit</button><button>By week</button></div>
          <button className="btn btn-secondary"><Icon name="printer" /> Export</button>
        </div>
      </div>
      <div className="yearlanes">
        {window.YEAR.map((lane) => {
          const s = window.SUBJ[lane.subject];
          const pct = Math.round((lane.done / lane.total) * 100);
          return (
            <div className="lane" key={lane.subject} style={window.sv(lane.subject)}>
              <div className="lanehead">
                <span className="lic"><Icon name={iconFor(lane.subject)} style={{ width: 18, height: 18 }} /></span>
                <div><div className="ln">{s.name}</div><div className="lmeta">{lane.done} of {lane.total} units · {pct}% complete</div></div>
                <div className="lbar"><div className="miniprog" style={{ width: 110 }}><i style={{ width: pct + "%" }} /></div></div>
              </div>
              <div className="lanetrack">
                {lane.units.map((u, i) => (
                  <div className={"uchip" + (u.active ? " active" : "")} key={i}>
                    <span className="uic">{u.n}</span>
                    <div className="ut"><div className="un">{u.name}</div><div className="us">{u.sub}</div>
                      {u.prog > 0 && u.prog < 100 && <div className="miniprog" style={{ marginTop: 6 }}><i style={{ width: u.prog + "%" }} /></div>}
                    </div>
                  </div>
                ))}
                <div className="uchip" style={{ minWidth: 0, background: "var(--surface-warm)", border: "1.5px dashed var(--border)", color: "var(--muted)", boxShadow: "none" }}>
                  <Icon name="plus" /> <span style={{ fontSize: 12.5, fontWeight: 700 }}>Add unit</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function iconFor(id) {
  return { math: "grid", reading: "book", writing: "pencil", grammar: "list", spelling: "sparkle", ufli: "book", explorers: "compass", sel: "heart" }[id] || "book";
}

/* ---------- SUBJECT / CURRICULUM ---------- */
function SubjectView() {
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow" style={{ color: "var(--reading-ink)", background: "var(--reading-tint)", borderColor: "var(--reading-tint)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--reading)" }} /> Reading · Unit 8
          </span>
          <h1>Inference &amp; theme</h1>
          <div className="lead"><i>Esperanza Rising</i> · 3 weeks · 10 lessons · weeks cascade the subject color down to every lesson.</div>
        </div>
        <div className="headactions">
          <button className="btn btn-secondary"><Icon name="repeat" /> Compare to Team</button>
          <button className="btn btn-primary"><Icon name="plus" /> Add lesson</button>
        </div>
      </div>
      <div className="colwrap">
        {window.UNIT_WEEKS.map((w, i) => (
          <div key={i} style={window.sv("reading")}>
            <div className="col-h">{w.n} · {w.d}<span className="n">{w.lessons.length}</span></div>
            <div className={"wchip" + (w.active ? " active" : "")} style={{ marginBottom: 12 }}>
              <span className="wic"><Icon name="calendar" /></span>
              <div><div className="wn">{w.n}</div><div className="wd">{w.d}</div></div>
              {w.active && <span className="badge b-prog" style={{ marginLeft: "auto" }}>Current</span>}
            </div>
            {w.lessons.map((ls, j) => (
              <div className="lchip" key={j}>
                <span className="ld" />
                <span className="ls">{ls.t}</span>
                <span className="lst"><StatusMark status={ls.st} /></span>
              </div>
            ))}
            <div className="lchip" style={{ background: "var(--surface-warm)", border: "1.5px dashed var(--border)", boxShadow: "none", color: "var(--muted)" }}>
              <Icon name="plus" style={{ width: 13, height: 13 }} /> <span className="ls" style={{ color: "var(--muted)", fontWeight: 700 }}>Add lesson</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- CATCH-UP ---------- */
function CatchUpView() {
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow"><Icon name="flag" style={{ width: 13, height: 13 }} /> 3 to reschedule</span>
          <h1>Catch-up</h1>
          <div className="lead">Lessons that slipped this week. Reschedule, skip, or merge into the next session.</div>
        </div>
      </div>
      <div className="cu-grid">
        {window.CATCHUP.map((c, i) => {
          const s = window.SUBJ[c.subject];
          return (
            <div className="cu-row" key={i} style={window.sv(c.subject)}>
              <span className="cu-ic"><Icon name={iconFor(c.subject)} /></span>
              <div className="cu-b">
                <div className="cu-t">{c.title}</div>
                <div className="cu-m">{s.name} · {c.meta}</div>
              </div>
              {c.urgent && <span className="badge b-warn"><Icon name="alert" style={{ width: 11, height: 11 }} /> Urgent</span>}
              <div className="cu-a">
                <button className="btn btn-secondary btn-sm">Skip</button>
                <button className="btn btn-primary btn-sm"><Icon name="arrowR" /> Reschedule</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- SETTINGS ---------- */
function SettingsView() {
  const [style, setStyle] = React.useState("calm");
  const [bright, setBright] = React.useState(true);
  const [toggles, setToggles] = React.useState({ a: true, b: false, c: true });
  const styles = [["quiet", "Quiet"], ["calm", "Calm"], ["vivid", "Vivid"]];
  const palette = ["--subj-1", "--subj-10", "--subj-2", "--subj-7", "--subj-5", "--subj-3", "--subj-13", "--subj-9"];
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow"><Icon name="settings" style={{ width: 13, height: 13 }} /> Settings</span>
          <h1>Appearance</h1>
          <div className="lead">Tune how dense and how colorful the planner feels for your eyes.</div>
        </div>
      </div>
      <div className="set-wrap">
        <nav className="set-nav">
          <a className="sn on">Appearance</a>
          <a className="sn">Curriculum &amp; subjects</a>
          <a className="sn">Catch-up rules</a>
          <a className="sn">Lesson templates</a>
          <a className="sn">Team &amp; sharing</a>
        </nav>
        <div>
          <div className="set-card">
            <h3>Card style</h3>
            <div className="sd">How much subject color each lesson card carries.</div>
            <div className="seg" style={{ marginBottom: 4 }}>
              {styles.map(([k, lbl]) => <button key={k} className={style === k ? "on" : ""} onClick={() => setStyle(k)}>{lbl}</button>)}
            </div>
          </div>
          <div className="set-card">
            <h3>Subject palette</h3>
            <div className="sd">The hue assigned to each subject in the cascade.</div>
            <div className="set-row">
              <div><div className="srt">Brighter accents</div><div className="srd">Use the bright variant on chip outlines &amp; dots</div></div>
              <div className={"toggle" + (bright ? " on" : "")} onClick={() => setBright(!bright)} />
            </div>
            <div className="set-row">
              <div><div className="srt">Subject hues</div><div className="srd">Tap a swatch to recolor the selected subject</div></div>
              <div className="swatchpick">
                {palette.map((p, i) => <span key={i} className={"sp" + (i === 1 ? " on" : "")} style={{ background: `var(${p})` }} />)}
              </div>
            </div>
          </div>
          <div className="set-card">
            <h3>Planner behavior</h3>
            <div className="sd">Defaults for new lessons and the weekly grid.</div>
            {[["a", "Show standards codes", "Display the standard on every lesson card"], ["b", "Auto-roll catch-up", "Move skipped lessons to the next open slot"], ["c", "Highlight modified lessons", "Dashed edge on lessons changed from the Team plan"]].map(([k, t, d]) => (
              <div className="set-row" key={k}>
                <div><div className="srt">{t}</div><div className="srd">{d}</div></div>
                <div className={"toggle" + (toggles[k] ? " on" : "")} onClick={() => setToggles({ ...toggles, [k]: !toggles[k] })} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DailyView, YearView, SubjectView, CatchUpView, SettingsView });
