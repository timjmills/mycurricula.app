// widgets530-expanded-a.jsx — richer "Participation & Games" widget forms (image 2)
const { I, DieFace, Chip } = window;

/* shared expanded header: icon chip + title + subtitle, optional right action */
function ExHead({ family, icon, title, sub, right, chrome }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:18 }}>
      <Chip family={family}>{icon}</Chip>
      <div style={{ minWidth:0 }}>
        <div className="w-title">{title}</div>
        {sub && <div className="w-sub">{sub}</div>}
      </div>
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>{right}</div>
    </div>
  );
}
function ResetBtn({ label = "Reset", onClick }) {
  return (
    <button onClick={onClick} className="btn-ghost" style={{ display:"inline-flex", alignItems:"center", gap:7,
      padding:"9px 15px", borderRadius:11, fontSize:14, fontWeight:700, color:"var(--ink-soft)" }}>
      {I.refresh({ s:15 })} {label}
    </button>
  );
}

/* emoji faces from basic shapes */
function Face({ mood, hue }) {
  return (
    <span style={{ width:28, height:28, borderRadius:"50%", background:`hsl(${hue} 70% 88%)`, display:"grid",
      placeItems:"center", flex:"none" }}>
      <svg width="18" height="18" viewBox="0 0 24 24">
        <circle cx="8.5" cy="9.5" r="1.5" fill={`hsl(${hue} 55% 38%)`} />
        <circle cx="15.5" cy="9.5" r="1.5" fill={`hsl(${hue} 55% 38%)`} />
        {mood==="happy" && <path d="M7.5 14.5a5 5 0 0 0 9 0" fill="none" stroke={`hsl(${hue} 55% 38%)`} strokeWidth="1.8" strokeLinecap="round"/>}
        {mood==="meh"   && <line x1="8" y1="15.5" x2="16" y2="15.5" stroke={`hsl(${hue} 55% 38%)`} strokeWidth="1.8" strokeLinecap="round"/>}
        {mood==="sad"   && <path d="M7.5 16.5a5 5 0 0 1 9 0" fill="none" stroke={`hsl(${hue} 55% 38%)`} strokeWidth="1.8" strokeLinecap="round"/>}
      </svg>
    </span>
  );
}

/* ===== NAME PICKER (big) ===== */
function NamePickerBig() {
  const NAMES = ["Maya","Liam","Aisha","Noah","Sofia","Ethan","Priya","Diego","Zoe","Omar"];
  const [name,setName]=React.useState(null);
  const [tick,setTick]=React.useState(0);
  const pick=()=>{ setName(NAMES[Math.floor(Math.random()*NAMES.length)]); setTick(t=>t+1); };
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <ExHead family="orange" icon={I.user({ s:21 })} title="Name Picker" sub="Randomly select a student."
        right={<ResetBtn onClick={()=>setName(null)} />} />
      <div style={{ border:"2px dashed var(--orange-line)", borderRadius:18, background:"var(--orange-soft)",
        padding:"34px 20px", textAlign:"center" }}>
        {name ? (
          <div key={tick} className="pop">
            <div style={{ fontSize:13.5, fontWeight:700, color:"var(--orange-accent)", letterSpacing:".04em", marginBottom:6 }}>SELECTED</div>
            <div style={{ fontSize:44, fontWeight:800, letterSpacing:"-1px", marginBottom:18 }}>{name}</div>
          </div>
        ) : (
          <>
            <div style={{ color:"var(--orange-accent)", display:"flex", justifyContent:"center", marginBottom:12 }}>{I.users({ s:46, sw:1.8 })}</div>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>No name selected yet</div>
            <div style={{ fontSize:14.5, color:"var(--ink-mute)", fontWeight:500, marginBottom:20 }}>Pick a student to get started.</div>
          </>
        )}
        <button onClick={pick} className="btn btn-solid" style={{ background:"var(--orange-accent)", width:"min(280px,100%)" }}>
          {I.handPt({ s:19 })} Pick a name
        </button>
      </div>
    </div>
  );
}

/* ===== QUICK POLL (big, emoji) ===== */
function QPollRow({ mood, hue, label, count, pct }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:"#fff",
      borderRadius:12, marginBottom:8, boxShadow:"var(--shadow-inner)" }}>
      <Face mood={mood} hue={hue} />
      <span style={{ fontSize:15, fontWeight:700, width:78 }}>{label}</span>
      <div style={{ flex:1, height:9, borderRadius:99, background:"#ece7f7" }}>
        <div style={{ width:pct+"%", height:"100%", borderRadius:99, background:"var(--purple-accent)" }} />
      </div>
      <span style={{ fontSize:15, fontWeight:800, width:16, textAlign:"right" }}>{count}</span>
      <span style={{ fontSize:14, fontWeight:600, color:"var(--ink-mute)", width:42, textAlign:"right" }}>{pct}%</span>
    </div>
  );
}
function QuickPollBig() {
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <ExHead family="purple" icon={I.bars({ s:21 })} title="Quick Poll" sub="Ask a question and see results live."
        right={<ResetBtn />} />
      <div style={{ background:"#ece7f7", borderRadius:14, padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, padding:"4px 4px 12px", fontSize:16, fontWeight:800 }}>
          <span style={{ color:"var(--purple-accent)" }}>{I.msg({ s:19 })}</span>
          How are we feeling about today's work?
        </div>
        <QPollRow mood="happy" hue={140} label="Option A" count={3} pct={60} />
        <QPollRow mood="meh"   hue={45}  label="Option B" count={1} pct={20} />
        <QPollRow mood="sad"   hue={210} label="Option C" count={1} pct={20} />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:14, color:"var(--ink-mute)", fontSize:14, fontWeight:600 }}>
        {I.users({ s:17 })} 5 responses
      </div>
    </div>
  );
}

/* ===== SCOREBOARD (big, vs) ===== */
function BigScoreCard({ team, val, accentVar, set }) {
  return (
    <div className="sub" style={{ flex:1, padding:"16px 16px 16px", position:"relative" }}>
      <button style={{ position:"absolute", top:12, right:12, color:"var(--ink-faint)" }}>{I.x({ s:16 })}</button>
      <div style={{ textAlign:"center", fontSize:18, fontWeight:800, color:`var(${accentVar})`, marginBottom:2 }}>{team}</div>
      <div style={{ textAlign:"center", fontSize:62, fontWeight:800, letterSpacing:"-2px", lineHeight:1.05,
        color:`var(${accentVar})` }}>{val}</div>
      <div style={{ display:"flex", gap:10, marginTop:10 }}>
        <button onClick={()=>set(Math.max(0,val-1))} style={{ flex:1, padding:"11px", borderRadius:12,
          background:"#eef0f5", color:"var(--ink-soft)" }}>{I.minus({ s:18 })}<span style={{ display:"none" }} /></button>
        <button onClick={()=>set(val+1)} style={{ flex:1, padding:"11px", borderRadius:12,
          background:`var(${accentVar})`, color:"#fff", display:"grid", placeItems:"center" }}>{I.plus({ s:18 })}</button>
      </div>
    </div>
  );
}
function ScoreboardBig() {
  const [a,setA]=React.useState(12), [b,setB]=React.useState(8);
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <ExHead family="purple" icon={I.trophy({ s:20 })} title="Scoreboard" sub="Track points for class games."
        right={<ResetBtn label="Reset scores" onClick={()=>{setA(0);setB(0);}} />} />
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <BigScoreCard team="Team 1" val={a} accentVar="--purple-accent" set={setA} />
        <span style={{ width:38, height:38, borderRadius:"50%", background:"#fff", boxShadow:"var(--shadow-inner)",
          display:"grid", placeItems:"center", fontSize:13, fontWeight:800, color:"var(--ink-mute)", flex:"none" }}>vs</span>
        <BigScoreCard team="Team 2" val={b} accentVar="--blue-accent" set={setB} />
      </div>
      <div style={{ display:"flex", alignItems:"center", marginTop:16 }}>
        <button className="w-actionlink" style={{ color:"var(--purple-accent)" }}>{I.plus({ s:16 })} Add team</button>
        <button className="w-actionlink" style={{ marginLeft:"auto" }} onClick={()=>{setA(0);setB(0);}}>{I.refresh({ s:15 })} Reset all scores</button>
      </div>
    </div>
  );
}

/* ===== DICE (big) ===== */
function DiceBig() {
  const [dice,setDice]=React.useState([2,3,1,4]);
  const [spin,setSpin]=React.useState(0);
  const roll=()=>{ setDice(dice.map(()=>1+Math.floor(Math.random()*6))); setSpin(s=>s+1); };
  const sum=dice.reduce((a,b)=>a+b,0);
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <ExHead family="orange" icon={I.cube({ s:20 })} title="Dice" sub="Roll the dice and add the numbers."
        right={<ResetBtn onClick={()=>setDice([1,1,1,1])} />} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12, textAlign:"center",
        color:"var(--ink-faint)", fontSize:15, fontWeight:700, marginBottom:8 }}>
        <span>1</span><span>2</span><span>3</span><span>4</span>
      </div>
      <div key={spin} style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 }}>
        {dice.map((d,i)=>(
          <div key={i} className="sub pop" style={{ display:"grid", placeItems:"center", padding:"14px 0",
            animationDelay:`${i*0.04}s` }}><DieFace value={d} size={62} /></div>
        ))}
      </div>
      <div className="sub" style={{ background:"var(--orange-soft)", boxShadow:"none", textAlign:"center",
        padding:"11px", margin:"14px 0 12px", fontSize:17, fontWeight:700 }}>
        Sum <span style={{ color:"var(--orange-accent)", marginLeft:6 }}>{sum}</span>
      </div>
      <div style={{ position:"relative", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:"var(--orange-accent)", display:"flex", flexDirection:"column", gap:3, opacity:.85 }}>
          <span style={{ width:14, height:2.5, borderRadius:9, background:"currentColor", transform:"rotate(-25deg)" }} />
          <span style={{ width:14, height:2.5, borderRadius:9, background:"currentColor" }} />
        </span>
        <button onClick={roll} className="btn btn-solid" style={{ background:"var(--orange-accent)", flex:1 }}>
          {I.cube({ s:19 })} Roll
        </button>
        <span style={{ color:"var(--orange-accent)", display:"flex", flexDirection:"column", gap:3, opacity:.85, alignItems:"flex-end" }}>
          <span style={{ width:14, height:2.5, borderRadius:9, background:"currentColor", transform:"rotate(25deg)" }} />
          <span style={{ width:14, height:2.5, borderRadius:9, background:"currentColor" }} />
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { ExHead, ResetBtn, NamePickerBig, QuickPollBig, ScoreboardBig, DiceBig });
