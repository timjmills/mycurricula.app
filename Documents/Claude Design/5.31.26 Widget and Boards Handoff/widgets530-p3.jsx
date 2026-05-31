// widgets530-p3.jsx — Panel 3: Assessment & Support
const { I } = window;
const { WHead, Avatar, Face, Pill, FootNote } = window;

/* 1 — EXIT TICKET */
function ExitTicket() {
  const opts = [
    { icon:I.bulb,   text:"I learned something new." },
    { icon:I.puzzle, text:"I practiced a skill." },
    { icon:I.msg,    text:"I'm still confused about something." },
  ];
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <WHead label="Exit Ticket" />
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
        <span style={{ width:54, height:54, borderRadius:15, background:"var(--purple-chip)", color:"var(--purple-accent)", display:"grid", placeItems:"center", flex:"none" }}>{I.ticket({ s:28 })}</span>
        <div style={{ fontSize:20, fontWeight:800, lineHeight:1.2, letterSpacing:"-.3px" }}>What is one thing you learned today?</div>
        <span style={{ marginLeft:"auto", color:"var(--purple-accent)", flex:"none" }}>{I.star({ s:18 })}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:11, marginBottom:16 }}>
        {opts.map((o,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 16px" }}>
            <span style={{ width:34, height:34, borderRadius:"50%", background:"var(--purple-soft)", color:"var(--purple-accent)", display:"grid", placeItems:"center", flex:"none" }}>{o.icon({ s:18 })}</span>
            <span style={{ fontSize:14.5, fontWeight:600, color:"var(--ink-soft)" }}>{o.text}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-solid" style={{ width:"100%", background:"var(--purple-accent)" }}>
        <span style={{ display:"grid", placeItems:"center", width:20, height:20, borderRadius:"50%", border:"2px solid #fff" }}>{I.check({ s:13 })}</span> Submit
      </button>
    </div>
  );
}

/* 2 — UNDERSTANDING CHECK */
function FaceCard({ mood, hue, count, label, bg }) {
  return (
    <div className="sub" style={{ flex:1, padding:"16px 6px 13px", textAlign:"center", background:bg, boxShadow:"none", border:`1px solid hsl(${hue} 50% 88%)` }}>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}><Face mood={mood} hue={hue} s={40} /></div>
      <div style={{ fontSize:30, fontWeight:800, color:`hsl(${hue} 60% 40%)` }}>{count}</div>
      <div style={{ fontSize:13, fontWeight:700, color:`hsl(${hue} 45% 42%)`, marginTop:2 }}>{label}</div>
    </div>
  );
}
function UnderstandingCheck() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Understanding Check" />
      <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-.3px", lineHeight:1.25, marginBottom:16 }}>How are you feeling about today's lesson?</div>
      <div style={{ display:"flex", gap:12, marginBottom:20 }}>
        <FaceCard mood="happy" hue={145} count={18} label="Got it!" bg="#eef8f0" />
        <FaceCard mood="meh"   hue={42}  count={7}  label="Almost there" bg="#fdf6e3" />
        <FaceCard mood="sad"   hue={2}   count={3}  label="Need help" bg="#fdeeee" />
      </div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:10 }}>Class Summary</div>
      <div style={{ display:"flex", height:11, borderRadius:99, overflow:"hidden", marginBottom:10 }}>
        <span style={{ width:"60%", background:"#2fa45f" }} /><span style={{ width:"23%", background:"#e8a91a" }} /><span style={{ width:"17%", background:"#e35454" }} />
      </div>
      <div style={{ display:"flex", textAlign:"center" }}>
        {[["60%","Got it!","#2fa45f"],["23%","Almost there","#c08a1e"],["17%","Need help","#d44b4b"]].map(([p,l,c],i)=>(
          <div key={i} style={{ flex:1 }}><div style={{ fontSize:18, fontWeight:800, color:c }}>{p}</div><div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:600 }}>{l}</div></div>
        ))}
      </div>
    </div>
  );
}

/* 3 — HELP QUEUE */
function HelpQueue() {
  const rows = [
    { name:"Ben",   tag:["Stuck","red"],          act:<span style={{ color:"var(--purple-accent)", display:"inline-flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13.5 }}>{I.user({ s:16 })} Helping now</span> },
    { name:"Ella",  tag:["Finished Early","amber"], act:<span style={{ color:"var(--orange-accent)", display:"inline-flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13.5 }}>{I.clock({ s:15 })} Next up</span> },
    { name:"Diego", tag:["Tech Help","blue"],      act:<span style={{ color:"var(--orange-accent)", display:"inline-flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13.5 }}>{I.clock({ s:15 })} Next up</span> },
    { name:"Mia",   tag:["Stuck","red"],           act:<span style={{ color:"var(--orange-accent)", display:"inline-flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13.5 }}>{I.clock({ s:15 })} Next up</span> },
    { name:"Liam",  tag:["Tech Help","blue"],      act:<span style={{ color:"var(--ink-faint)", display:"inline-flex", alignItems:"center", gap:6, fontWeight:700, fontSize:13.5 }}>{I.moreH({ s:16 })} After that</span> },
  ];
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <WHead label="Help Queue" />
      <div className="sub" style={{ padding:"4px 16px" }}>
        {rows.map((r,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 0", borderBottom: i<4?"1px solid var(--line)":"none" }}>
            <Avatar name={r.name} s={34} />
            <span style={{ fontSize:15, fontWeight:700, width:54 }}>{r.name}</span>
            <Pill tone={r.tag[1]}>{r.tag[0]}</Pill>
            <span style={{ marginLeft:"auto" }}>{r.act}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:13, padding:"12px", background:"var(--orange-soft)", borderRadius:13, color:"var(--orange-accent)", fontSize:14, fontWeight:700 }}>
        {I.users({ s:17 })} 5 students waiting
      </div>
    </div>
  );
}

/* 4 — PARTICIPATION TRACKER */
function AvCluster({ names, extra, extraTone }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
      {names.map((n,i)=><Avatar key={i} name={n} s={36} />)}
      {extra && <span style={{ width:36, height:36, borderRadius:"50%", background: extraTone==="pink"?"#fbdce8":"#dbe7fb", color: extraTone==="pink"?"#e3457f":"#2e6be6", display:"grid", placeItems:"center", fontSize:13, fontWeight:800 }}>{extra}</span>}
    </div>
  );
}
function ParticipationTracker() {
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Participation Tracker" />
      <div className="sub" style={{ padding:"16px 18px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1px 1fr", gap:16 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
              <span style={{ color:"var(--blue-accent)" }}>{I.msg({ s:18 })}</span>
              <span style={{ fontSize:15, fontWeight:800 }}>Shared Today</span>
              <span style={{ marginLeft:"auto", width:28, height:28, borderRadius:"50%", background:"var(--blue-soft)", color:"var(--blue-accent)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800 }}>13</span>
            </div>
            <AvCluster names={["Mia","Ben","Zoe","Sam","Kai","Ava","Leo","Ivy","Tom"]} extra="+4" extraTone="blue" />
          </div>
          <div style={{ background:"var(--line)" }} />
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
              <span style={{ color:"var(--pink-accent)" }}>{I.msg({ s:18 })}</span>
              <span style={{ fontSize:15, fontWeight:800 }}>Not Yet Shared</span>
              <span style={{ marginLeft:"auto", width:28, height:28, borderRadius:"50%", background:"var(--pink-soft)", color:"var(--pink-accent)", display:"grid", placeItems:"center", fontSize:13, fontWeight:800 }}>6</span>
            </div>
            <AvCluster names={["Ras","Mei","Jon","Ned"]} extra="+1" extraTone="pink" />
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:13 }}>
        <FootNote tone="blue" icon={I.star({ s:16 })}>Awesome sharing! Keep it up! 🎉</FootNote>
        <FootNote tone="pink" icon={I.users({ s:16 })}>Everyone has something valuable to share!</FootNote>
      </div>
    </div>
  );
}

/* 5 — QUESTION PARKING LOT */
function QuestionParkingLot() {
  const rows = [
    { name:"Chloe", q:"Why do we need parentheses in that step?", tag:["Answered","green",I.check] },
    { name:"Ava",   q:"Can you show another example using decimals?", tag:["Discuss Later","amber",I.clock] },
    { name:"Diego", q:"How does this connect to real life?", tag:["Teach Next","purple",I.book] },
    { name:"Liam",  q:"What happens if the variable is negative?", tag:["Discuss Later","amber",I.clock] },
    { name:"Ben",   q:"Is there a shortcut for solving this?", tag:["Teach Next","purple",I.book] },
  ];
  return (
    <div className="w" style={{ background:"var(--pink-grad)" }}>
      <WHead label="Question Parking Lot" />
      <div className="sub" style={{ padding:"4px 16px" }}>
        {rows.map((r,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom: i<4?"1px solid var(--line)":"none" }}>
            <span style={{ width:30, height:30, borderRadius:"50%", background:"var(--pink-soft)", color:"var(--pink-accent)", display:"grid", placeItems:"center", flex:"none", fontWeight:800, fontSize:15 }}>?</span>
            <span style={{ fontSize:14, fontWeight:700, width:54, flex:"none" }}>{r.name}</span>
            <span style={{ fontSize:13.5, fontWeight:500, color:"var(--ink-soft)", flex:1, minWidth:0 }}>{r.q}</span>
            <Pill tone={r.tag[1]} icon={<span style={{ display:"grid", placeItems:"center" }}>{r.tag[2]({ s:13 })}</span>}>{r.tag[0]}</Pill>
          </div>
        ))}
      </div>
      <FootNote tone="pink" icon={I.star({ s:16 })}>Great questions! We'll tackle these together.</FootNote>
    </div>
  );
}

Object.assign(window, { ExitTicket, UnderstandingCheck, HelpQueue, ParticipationTracker, QuestionParkingLot });
