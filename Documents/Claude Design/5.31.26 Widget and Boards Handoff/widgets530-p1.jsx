// widgets530-p1.jsx — Panel 1: Lesson Essentials
const { I } = window;
const { WHead, Avatar, Face, FootNote, StepNum } = window;

/* 1 — LEARNING TARGET */
function LearningTarget() {
  const crit = ["I can identify a character's important actions.",
    "I can explain how those actions change the plot.",
    "I can use text evidence to support my answer."];
  return (
    <div className="w" style={{ background:"var(--yellow-grad)" }}>
      <WHead label="Learning Target" />
      <div style={{ display:"flex", gap:18, alignItems:"flex-start" }}>
        <span style={{ position:"relative", flex:"none" }}>
          <span style={{ width:64, height:64, borderRadius:18, background:"var(--purple-chip)", color:"var(--purple-accent)", display:"grid", placeItems:"center" }}>{I.target({ s:38, sw:1.8 })}</span>
          <span style={{ position:"absolute", top:-6, left:-8, color:"#f6c34d" }}>{I.spark({ s:14 })}</span>
          <span style={{ position:"absolute", bottom:-4, right:-6, color:"var(--green-accent)" }}>{I.spark({ s:12 })}</span>
        </span>
        <div style={{ fontSize:23, fontWeight:800, lineHeight:1.25, letterSpacing:"-.4px", paddingTop:4 }}>
          I can explain how a character's actions affect the plot.
        </div>
      </div>
      <div style={{ borderTop:"1.5px dashed var(--yellow-line)", margin:"18px 0 14px" }} />
      <div style={{ fontSize:14, fontWeight:800, marginBottom:12 }}>Success Criteria:</div>
      <div style={{ display:"flex", flexDirection:"column", gap:11, position:"relative" }}>
        {crit.map((c,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:11 }}>
            <span style={{ width:24, height:24, borderRadius:"50%", background:"var(--green-accent)", color:"#fff", display:"grid", placeItems:"center", flex:"none" }}>{I.check({ s:14 })}</span>
            <span style={{ fontSize:14.5, fontWeight:600, color:"var(--ink-soft)" }}>{c}</span>
          </div>
        ))}
        <span style={{ position:"absolute", right:6, top:-2, color:"var(--purple-accent)", opacity:.55 }}>{I.book({ s:46, sw:1.6 })}</span>
      </div>
    </div>
  );
}

/* 2 — NOW / NEXT / THEN */
function NowNextThen() {
  const rows = [
    { tag:"NOW",  icon:I.book,   title:"Read the passage", n:1 },
    { tag:"NEXT", icon:I.msg,    title:"Turn and Talk",    n:2 },
    { tag:"THEN", icon:I.pencil, title:"Write your answer", n:3 },
  ];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Now–Next–Then" />
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {rows.map((r,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
            boxShadow: i===0 ? "inset 0 0 0 2px var(--blue-accent)" : "var(--shadow-inner)" }}>
            <span style={{ width:46, height:46, borderRadius:12, background:"var(--blue-chip)", color:"var(--blue-accent)", display:"grid", placeItems:"center", flex:"none" }}>{r.icon({ s:24 })}</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:800, letterSpacing:".06em", color:"var(--blue-accent)" }}>{r.tag}</div>
              <div style={{ fontSize:17, fontWeight:800, marginTop:1 }}>{r.title}</div>
            </div>
            <span style={{ marginLeft:"auto", width:34, height:34, borderRadius:"50%", background:"var(--blue-soft)", color:"var(--blue-accent)", display:"grid", placeItems:"center", fontWeight:800, fontSize:16, flex:"none" }}>{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 3 — DIRECTIONS */
function Directions() {
  const steps = [
    { icon:I.book,   text:"Read the passage carefully." },
    { icon:I.users,  text:"Turn and Talk with your partner." },
    { icon:I.pencil, text:"Write your answer in your journal." },
    { icon:I.clipChk,text:"Check your work and be ready to share." },
  ];
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Directions" />
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {steps.map((s,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:13, padding:"13px 15px" }}>
            <StepNum n={i+1} hue={145} s={30} />
            <span style={{ color:"var(--green-accent)" }}>{s.icon({ s:22 })}</span>
            <span style={{ fontSize:14.5, fontWeight:700 }}>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 4 — MATERIALS NEEDED */
function MatCard({ icon, name, big }) {
  return (
    <div className="sub" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:10, padding: big ? "22px 8px" : "16px 6px" }}>
      <span style={{ color:"var(--purple-accent)" }}>{icon({ s: big ? 40 : 30 })}</span>
      <span style={{ fontSize:13.5, fontWeight:700 }}>{name}</span>
    </div>
  );
}
function MaterialsNeeded() {
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <WHead label="Materials Needed" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12, marginBottom:12 }}>
        <MatCard icon={I.note} name="Journal" big />
        <MatCard icon={I.pencil} name="Pencil" big />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:12 }}>
        <MatCard icon={I.book} name="Reading Book" />
        <MatCard icon={I.boxIco} name="Folder" />
        <MatCard icon={I.marker} name="Highlighter" />
      </div>
      <FootNote tone="purple" icon={I.star({ s:16 })}>Make sure you have everything before we begin!</FootNote>
    </div>
  );
}

/* 5 — WORK COMPLETED */
function WorkCompleted() {
  const subs = [
    { name:"Reading", icon:I.book,   tone:"#e3457f" },
    { name:"Math",    icon:I.calc,   tone:"#2e6be6" },
    { name:"Writing", icon:I.pencil, tone:"#7c5cf6" },
    { name:"Science", icon:I.beaker, tone:"#1f9255" },
  ];
  // d = done(happy green), p = in progress(clock orange)
  const rows = [
    ["Ava",  ["d","d","p","d"]],
    ["Ben",  ["d","p","d","d"]],
    ["Chloe",["p","d","p","d"]],
    ["Diego",["d","d","d","p"]],
    ["Ella", ["p","d","d","d"]],
  ];
  const Cell = (s) => s==="d"
    ? <Face mood="happy" hue={145} s={26} />
    : <span style={{ color:"var(--orange-accent)" }}>{I.clock({ s:22 })}</span>;
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <WHead label="Work Completed" />
      <div className="sub" style={{ padding:"6px 10px 8px", overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr repeat(4,1fr)", alignItems:"center", padding:"10px 4px", borderBottom:"1px solid var(--line)" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--ink-mute)" }}>Student</span>
          {subs.map(s=>(
            <span key={s.name} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:s.tone }}>
              {s.icon({ s:18 })}<span style={{ fontSize:11.5, fontWeight:700, color:s.tone }}>{s.name}</span>
            </span>
          ))}
        </div>
        {rows.map(([name,cells],i)=>(
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1.3fr repeat(4,1fr)", alignItems:"center", padding:"9px 4px", borderBottom: i<4?"1px solid var(--line)":"none" }}>
            <span style={{ display:"flex", alignItems:"center", gap:9 }}><Avatar name={name} s={28} /><span style={{ fontSize:13.5, fontWeight:700 }}>{name}</span></span>
            {cells.map((c,j)=><span key={j} style={{ display:"grid", placeItems:"center" }}>{Cell(c)}</span>)}
          </div>
        ))}
      </div>
      <FootNote tone="orange" icon={I.users({ s:16 })}>Great work, class! Keep it up! 🎉</FootNote>
    </div>
  );
}

Object.assign(window, { LearningTarget, NowNextThen, Directions, MaterialsNeeded, WorkCompleted });
