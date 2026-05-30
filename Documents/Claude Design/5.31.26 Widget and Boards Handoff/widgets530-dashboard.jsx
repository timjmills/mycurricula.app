// widgets530-dashboard.jsx — recreation of the "All-in-One Classroom Dashboard" (image 1)
const { I, DieFace, Chrome } = window;

/* ---- small shared bits ---- */
function Avatar({ hue, s = 30 }) {
  return (
    <span style={{ width:s, height:s, borderRadius:"50%", background:`hsl(${hue} 60% 86%)`,
      border:"2px solid #fff", boxShadow:"0 1px 2px rgba(16,23,41,.12)", display:"grid", placeItems:"center", flex:"none" }}>
      <span style={{ color:`hsl(${hue} 45% 45%)` }}>{I.user({ s: s*0.6, sw:2.2 })}</span>
    </span>
  );
}
function DashAvatars({ hues }) {
  return (
    <span style={{ display:"flex", alignItems:"center", gap:6 }}>
      {hues.map((h,i)=> <Avatar key={i} hue={h} />)}
      <span style={{ width:30, height:30, borderRadius:"50%", border:"1.5px dashed #c3c8d2",
        display:"grid", placeItems:"center", color:"#a3a9b5", flex:"none" }}>{I.plus({ s:15 })}</span>
    </span>
  );
}

/* ===== TEXT ===== */
function WText() {
  return (
    <div className="w" style={{ background:"var(--yellow-grad)" }}>
      <div className="w-head">
        <span className="w-label">Text</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <div style={{ padding:"10px 6px 14px", textAlign:"center" }}>
        <div style={{ fontSize:25, fontWeight:800, lineHeight:1.28, letterSpacing:"-.4px" }}>
          Read pages 24–26,<br/>then answer in your journal.
        </div>
      </div>
    </div>
  );
}

/* ===== WORK SOUND ===== */
function WWorkSound() {
  const [sel, setSel] = React.useState("Partner");
  const opts = [
    { k:"Silent",  ico:I.volMute },
    { k:"Whisper", ico:I.vol1 },
    { k:"Partner", ico:I.users },
    { k:"Group",   ico:I.users },
  ];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <div className="w-head">
        <span className="w-label">Work Sound</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <div className="sub" style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 22px",
        background:"#dbe9fd", boxShadow:"none", marginBottom:14 }}>
        <span style={{ color:"var(--blue-accent)" }}>{I.headph({ s:54, sw:1.9 })}</span>
        <div>
          <div style={{ fontSize:34, fontWeight:800, letterSpacing:"-.6px", lineHeight:1 }}>Partner</div>
          <div style={{ fontSize:14.5, color:"#4e5a72", fontWeight:500, marginTop:6 }}>Keep voices low and stay on task.</div>
        </div>
      </div>
      <div className="sub" style={{ padding:"14px 10px 16px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:4 }}>
          {opts.map(o=>{
            const on = sel===o.k;
            return (
              <button key={o.k} onClick={()=>setSel(o.k)} style={{ display:"flex", flexDirection:"column",
                alignItems:"center", gap:8, padding:"12px 4px", borderRadius:12,
                background:on?"#cfe1fc":"transparent", color:on?"var(--blue-accent)":"#556" }}>
                <span style={{ color:on?"var(--blue-accent)":"#8089a0" }}>{o.ico({ s:24 })}</span>
                <span style={{ fontSize:13.5, fontWeight:700, color:on?"var(--blue-accent)":"#445" }}>{o.k}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginTop:12,
          color:"#5b6270", fontSize:14, fontWeight:600 }}>
          {I.hand({ s:19 })} Ask teacher
        </div>
      </div>
    </div>
  );
}

/* ===== QUICK POLL (compact) ===== */
function PollRow({ label, count, pct }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"baseline", marginBottom:7 }}>
        <span style={{ fontSize:14.5, fontWeight:700 }}>{label}</span>
        <span style={{ marginLeft:"auto", fontSize:14, fontWeight:700 }}>{count}</span>
        <span style={{ marginLeft:12, fontSize:13, color:"var(--ink-mute)", fontWeight:600, width:36, textAlign:"right" }}>{pct}%</span>
      </div>
      <div style={{ height:7, borderRadius:99, background:"#e6e1f5" }}>
        <div style={{ width:pct+"%", height:"100%", borderRadius:99, background:"var(--purple-accent)" }} />
      </div>
    </div>
  );
}
function WQuickPollCompact() {
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <div className="w-head">
        <span className="w-label">Quick Poll</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <div style={{ display:"flex", alignItems:"flex-start", marginBottom:18 }}>
        <div style={{ fontSize:18, fontWeight:800, letterSpacing:"-.3px", lineHeight:1.3, maxWidth:230 }}>
          How are we feeling<br/>about today's work?
        </div>
        <button className="w-actionlink" style={{ marginLeft:"auto" }}>{I.refresh({ s:15 })} Reset</button>
      </div>
      <PollRow label="Option A" count={3} pct={60} />
      <PollRow label="Option B" count={1} pct={20} />
      <PollRow label="Option C" count={1} pct={20} />
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:16, color:"var(--ink-mute)", fontSize:13.5, fontWeight:600 }}>
        {I.bars({ s:16 })} 5 votes
      </div>
    </div>
  );
}

/* ===== COUNTDOWN ===== */
function FlipCell({ n, unit }) {
  return (
    <div className="sub" style={{ background:"var(--pink-soft)", boxShadow:"none", padding:"16px 4px 12px",
      textAlign:"center", flex:1 }}>
      <div style={{ fontSize:46, fontWeight:800, letterSpacing:"-1.5px", lineHeight:1 }}>{n}</div>
      <div style={{ fontSize:12.5, fontWeight:700, letterSpacing:".08em", color:"#9a5174", marginTop:8 }}>{unit}</div>
    </div>
  );
}
function WCountdown() {
  return (
    <div className="w" style={{ background:"var(--pink-grad)" }}>
      <div className="w-head">
        <span className="w-label">Countdown</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:20, fontWeight:800, letterSpacing:"-.3px" }}>Pack up</span>
        <button className="w-actionlink" style={{ marginLeft:"auto" }}>{I.sun({ s:15 })} Edit</button>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <FlipCell n="06" unit="DAYS" />
        <FlipCell n="05" unit="HOURS" />
        <FlipCell n="22" unit="MIN" />
      </div>
    </div>
  );
}

/* ===== SCOREBOARD (compact) ===== */
function ScoreCard({ team, val, onAdd, onSub }) {
  return (
    <div className="sub" style={{ padding:"18px 16px 14px", flex:1 }}>
      <div style={{ textAlign:"center", fontSize:16, fontWeight:800, marginBottom:6 }}>{team}</div>
      <div style={{ textAlign:"center", fontSize:46, fontWeight:800, letterSpacing:"-1.5px", lineHeight:1.05 }}>{val}</div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, color:"var(--ink-faint)" }}>
        <button onClick={onSub} style={{ padding:"4px 10px" }}>{I.minus({ s:18 })}</button>
        <button onClick={onAdd} style={{ padding:"4px 10px" }}>{I.plus({ s:18 })}</button>
      </div>
    </div>
  );
}
function WScoreboardCompact() {
  const [a,setA]=React.useState(18), [b,setB]=React.useState(14);
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <div className="w-head">
        <span className="w-label">Scoreboard</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <div style={{ display:"flex", gap:12 }}>
        <ScoreCard team="Team 1" val={a} onAdd={()=>setA(a+1)} onSub={()=>setA(Math.max(0,a-1))} />
        <ScoreCard team="Team 2" val={b} onAdd={()=>setB(b+1)} onSub={()=>setB(Math.max(0,b-1))} />
      </div>
      <div style={{ display:"flex", alignItems:"center", marginTop:16 }}>
        <button className="w-actionlink">{I.plus({ s:15 })} Add team</button>
        <button className="w-actionlink" style={{ marginLeft:"auto" }} onClick={()=>{setA(0);setB(0);}}>{I.refresh({ s:15 })} Reset scores</button>
      </div>
    </div>
  );
}

/* ===== DICE (compact) ===== */
function WDiceCompact() {
  const [dice,setDice]=React.useState([3,4]);
  const [spin,setSpin]=React.useState(0);
  const roll=()=>{ setDice(dice.map(()=>1+Math.floor(Math.random()*6))); setSpin(s=>s+1); };
  const sum=dice.reduce((a,b)=>a+b,0);
  return (
    <div className="w" style={{ background:"var(--orange-grad)", padding:18 }}>
      <div className="w-head" style={{ marginBottom:12 }}>
        <span className="w-label" style={{ fontSize:11 }}>Dice</span>
        <Chrome items={["moreH","pin","expand","x"]} dense />
      </div>
      <div style={{ display:"flex", gap:18, justifyContent:"center", color:"var(--ink-faint)", fontSize:14, fontWeight:700, marginBottom:8 }}>
        <span>1</span><span>2</span><span>3</span><span>4</span>
      </div>
      <div key={spin} style={{ display:"flex", gap:12, justifyContent:"center" }}>
        {dice.map((d,i)=>(
          <div key={i} className="sub pop" style={{ padding:8 }}><DieFace value={d} size={64} /></div>
        ))}
      </div>
      <div style={{ textAlign:"center", fontSize:16, fontWeight:700, margin:"14px 0 10px" }}>Sum {sum}</div>
      <button onClick={roll} className="btn-ghost" style={{ display:"block", width:"100%", padding:"10px",
        borderRadius:12, fontWeight:700, fontSize:14.5 }}>Roll</button>
    </div>
  );
}

/* ===== SOUND INPUT (compact) ===== */
function WSoundInput() {
  return (
    <div className="w" style={{ background:"var(--yellow-grad)", padding:18 }}>
      <div className="w-head" style={{ marginBottom:14 }}>
        <span className="w-label" style={{ fontSize:11 }}>Sound Input</span>
        <Chrome items={["moreH","pin","expand","x"]} dense />
      </div>
      <div className="sub" style={{ padding:"14px 14px", marginBottom:16, display:"flex",
        alignItems:"center", gap:3 }}>
        {Array.from({length:22}).map((_,i)=>(
          <span key={i} style={{ flex:1, height:5, borderRadius:99, background: i<3 ? "var(--blue-accent)" : "#d7dbe3" }} />
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontSize:14,
        fontWeight:600, color:"#444", marginBottom:18 }}>
        {I.mic({ s:18 })} Turn on microphone
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:11.5, fontWeight:700, letterSpacing:".08em", color:"var(--ink-mute)" }}>LOUD AT</span>
        <div style={{ position:"relative", flex:1, height:6, borderRadius:99, background:"#d7dbe3" }}>
          <div style={{ position:"absolute", left:0, top:0, width:"60%", height:"100%", borderRadius:99, background:"var(--blue-accent)" }} />
          <span style={{ position:"absolute", left:"60%", top:"50%", transform:"translate(-50%,-50%)",
            width:14, height:14, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,.25)" }} />
        </div>
        <span style={{ fontSize:17, fontWeight:800 }}>60</span>
      </div>
    </div>
  );
}

/* ===== LESSON FLOW (compact) ===== */
function FlowRow({ n, hue, title, time }) {
  return (
    <div className="sub" style={{ display:"flex", alignItems:"center", gap:14, padding:"15px 16px",
      background:`hsl(${hue} 70% 96%)`, boxShadow:"none", marginBottom:10 }}>
      <span style={{ width:34, height:34, borderRadius:"50%", background:`hsl(${hue} 65% 55%)`, color:"#fff",
        display:"grid", placeItems:"center", fontWeight:800, fontSize:16, flex:"none" }}>{n}</span>
      <span style={{ fontSize:16, fontWeight:700 }}>{title}</span>
      <span style={{ marginLeft:"auto", fontSize:14, fontWeight:600, color:"var(--ink-mute)" }}>{time}</span>
      <span style={{ color:"var(--ink-faint)" }}>{I.grip({ s:18 })}</span>
    </div>
  );
}
function WLessonFlowCompact() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <div className="w-head">
        <span className="w-label">Lesson Flow</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <FlowRow n="1" hue={210} title="Centers" time="20 min" />
      <FlowRow n="2" hue={330} title="Exit Ticket" time="5 min" />
      <button style={{ display:"flex", width:"100%", justifyContent:"center", alignItems:"center", gap:8,
        padding:"15px", borderRadius:14, border:"1.5px dashed #c3c8d2", color:"var(--ink-soft)", fontWeight:700,
        fontSize:14.5, marginTop:2 }}>{I.plus({ s:16 })} Add activity</button>
    </div>
  );
}

/* ===== STUDENT GROUPS (compact) ===== */
function GroupRow({ name, hues }) {
  return (
    <div style={{ display:"flex", alignItems:"center", padding:"14px 2px" }}>
      <div>
        <div style={{ fontSize:16, fontWeight:700 }}>{name}</div>
        <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:500, marginTop:1 }}>4 students</div>
      </div>
      <span style={{ marginLeft:"auto" }}><DashAvatars hues={hues} /></span>
    </div>
  );
}
function WStudentGroupsCompact() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <div className="w-head">
        <span className="w-label">Student Groups</span>
        <Chrome items={["moreH","pin","expand","sun","x"]} dense />
      </div>
      <GroupRow name="Group 1" hues={[20,200,340,40]} />
      <div style={{ height:1, background:"var(--green-line)" }} />
      <GroupRow name="Group 2" hues={[260,30,190,140]} />
      <div style={{ height:1, background:"var(--green-line)" }} />
      <GroupRow name="Group 3" hues={[15,210,330,50]} />
      <div style={{ height:1, background:"var(--green-line)" }} />
      <GroupRow name="Group 4" hues={[200,25,160,300]} />
      <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:500, marginTop:14, lineHeight:1.5 }}>
        Add names in the Groups panel — kept private
      </div>
    </div>
  );
}

/* ===== Dashboard top bar ===== */
function DashTopBar() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, padding:"4px 6px 22px" }}>
      <button style={{ color:"var(--ink-soft)" }}>{I.menu({ s:24 })}</button>
      <span style={{ width:40, height:40, borderRadius:12, background:"var(--green-accent)", display:"grid",
        placeItems:"center", color:"#fff" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h14v-9"/></svg>
      </span>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:20, fontWeight:800, letterSpacing:"-.4px" }}>All-in-One Classroom Dashboard</span>
        <span style={{ color:"var(--ink-faint)" }}>{I.chevD({ s:18 })}</span>
      </div>
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, color:"var(--chrome)" }}>
        <button style={{ width:38, height:30, borderRadius:9, border:"1px solid var(--line)", background:"#fff",
          display:"grid", placeItems:"center" }}>{I.moreH({ s:18 })}</button>
        <button style={{ padding:6 }}>{I.pin({ s:19 })}</button>
        <button style={{ padding:6 }}>{I.expand({ s:19 })}</button>
        <button style={{ padding:6 }}>{I.sun({ s:19 })}</button>
        <span style={{ display:"flex", alignItems:"center", gap:4, marginLeft:4 }}>
          <Avatar hue={20} s={34} />
          <span style={{ color:"var(--ink-faint)" }}>{I.chevD({ s:16 })}</span>
        </span>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div>
      <div className="section-label"><span className="t">Live Dashboard</span><span className="ln" /></div>
      <div style={{ background:"#fff", borderRadius:26, padding:"22px 24px 26px", boxShadow:"var(--shadow-card)",
        border:"1px solid var(--line)" }}>
        <DashTopBar />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:20, alignItems:"start" }}>
          {/* col 1 */}
          <div style={{ display:"flex", flexDirection:"column", gap:20, minWidth:0 }}>
            <WText />
            <WWorkSound />
            <WQuickPollCompact />
          </div>
          {/* col 2 */}
          <div style={{ display:"flex", flexDirection:"column", gap:20, minWidth:0 }}>
            <WCountdown />
            <WScoreboardCompact />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:20 }}>
              <WDiceCompact />
              <WSoundInput />
            </div>
          </div>
          {/* col 3 */}
          <div style={{ display:"flex", flexDirection:"column", gap:20, minWidth:0 }}>
            <WLessonFlowCompact />
            <WStudentGroupsCompact />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Avatar, DashAvatars });
