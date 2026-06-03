/* Weekly view — the gold-standard surface: a 5-day grid of lesson cards. */

function StatusMark({ status }) {
  if (status === "done") return <span className="ring done"><Icon name="check" sw={3} /></span>;
  if (status === "prog") return <span className="ring prog" />;
  return <span className="ring idle" />;
}

function LessonCard({ l, onClick }) {
  const s = window.SUBJ[l.subject];
  return (
    <div className={"lcard" + (l.modified ? " modified" : "")} style={window.sv(l.subject)} onClick={onClick}>
      <div className="meta">
        <span className="sd" />
        {s.name}
        <span className="tm">{l.time}</span>
      </div>
      <h4>{l.title}</h4>
      {l.desc && <div className="desc">{l.desc}</div>}
      <div className="foot">
        {l.std && <span className="std">{l.std}</span>}
        {l.modified && <span className="badge b-warn" style={{ marginLeft: l.std ? 0 : "auto" }}><Icon name="pencil" style={{ width: 11, height: 11 }} />Edited</span>}
        {l.moved && <span className="mv" title="Moved this week"><Icon name="move" /></span>}
        <span style={{ marginLeft: "auto" }}><StatusMark status={l.status} /></span>
      </div>
    </div>
  );
}

function WeeklyView({ setView }) {
  const [grid, setGrid] = React.useState(true);
  return (
    <div className="canvaspad">
      <div className="pagehead">
        <div>
          <span className="eyebrow"><Icon name="grid" style={{ width: 13, height: 13 }} /> This week</span>
          <h1>Weekly plan</h1>
          <div className="lead">Every lesson, color-coded by subject. Drag to reschedule; click to open.</div>
        </div>
        <div className="headactions">
          <div className="seg">
            <button className={grid ? "on" : ""} onClick={() => setGrid(true)}><Icon name="grid" /> Grid</button>
            <button className={!grid ? "on" : ""} onClick={() => setGrid(false)}><Icon name="list" /> List</button>
          </div>
          <button className="btn btn-secondary"><Icon name="printer" /> Print</button>
          <button className="btn btn-primary"><Icon name="plus" /> Add lesson</button>
        </div>
      </div>

      {grid ? (
        <div className="weekgrid">
          {window.DAYS.map((d, i) => (
            <div className="daycol" key={d.dn}>
              <div className={"dayhead" + (d.today ? " today" : "")}>
                <span className="dn">{d.dn}</span><span className="dd">{d.dd}</span>
              </div>
              {window.WEEK[i].map((l, j) =>
                l.event
                  ? <div className="evcard" key={j}><Icon name="flag" /> {l.title}</div>
                  : <LessonCard key={j} l={l} onClick={() => setView && setView("subject")} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <WeeklyList setView={setView} />
      )}
    </div>
  );
}

/* List mode — the phone-default layout, grouped by day. */
function WeeklyList({ setView }) {
  return (
    <div style={{ maxWidth: 760 }}>
      {window.DAYS.map((d, i) => (
        <div key={d.dn} style={{ marginBottom: 22 }}>
          <div className={"dayhead" + (d.today ? " today" : "")} style={{ marginBottom: 10 }}>
            <span className="dn">{d.dn}</span><span className="dd">{d.dd}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {window.WEEK[i].map((l, j) =>
              l.event
                ? <div className="evcard" key={j}><Icon name="flag" /> {l.title}</div>
                : <LessonRow key={j} l={l} onClick={() => setView && setView("subject")} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LessonRow({ l, onClick }) {
  const s = window.SUBJ[l.subject];
  return (
    <div className={"lcard" + (l.modified ? " modified" : "")} style={{ ...window.sv(l.subject), display: "flex", alignItems: "center", gap: 13, padding: "11px 15px" }} onClick={onClick}>
      <span className="std" style={{ flex: "0 0 auto" }}>{l.time}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="meta" style={{ marginBottom: 2 }}><span className="sd" />{s.name}</div>
        <h4 style={{ marginTop: 2 }}>{l.title}</h4>
      </div>
      {l.std && <span className="std">{l.std}</span>}
      <StatusMark status={l.status} />
    </div>
  );
}

Object.assign(window, { WeeklyView, LessonCard, StatusMark });
