// widgets530-p5.jsx — Panel 5: Regulation & Teacher Tools
const { I } = window;
const { WHead, Face, FootNote } = window;

/* 1 — BRAIN BREAK */
function ResetCard({ label, hue }) {
  return (
    <div className="sub" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:9, padding:"16px 6px" }}>
      <span style={{ color:`hsl(${hue} 60% 52%)` }}>{I.figure({ s:30 })}</span>
      <span style={{ fontSize:12.5, fontWeight:700 }}>{label}</span>
    </div>
  );
}
function BrainBreak() {
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <WHead label="Brain Break" />
      <div className="sub" style={{ padding:"18px 20px", display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
        <span style={{ color:"var(--purple-accent)", flex:"none" }}>{I.figure({ s:46 })}</span>
        <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-.3px", lineHeight:1.2, minWidth:0 }}>Take a quick brain break!</div>
        <span style={{ marginLeft:"auto", width:60, height:60, borderRadius:"50%", border:"4px solid var(--purple-soft)", borderTopColor:"var(--purple-accent)", display:"grid", placeItems:"center", flex:"none", fontSize:16, fontWeight:800 }}>2:00</span>
      </div>
      <div style={{ fontSize:14.5, fontWeight:700, color:"var(--ink-soft)", marginBottom:12 }}>Choose a quick reset:</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:16 }}>
        <ResetCard label="Stretch" hue={262} /><ResetCard label="Jump" hue={145} />
        <ResetCard label="Shake It Out" hue={212} /><ResetCard label="Reach Up" hue={42} />
      </div>
      <button className="btn btn-solid" style={{ width:"100%", background:"var(--purple-accent)" }}>{I.play({ s:15 })} Start Brain Break</button>
    </div>
  );
}

/* 2 — CALM CORNER / REGULATION */
function CalmCorner() {
  const feels = [
    { mood:"happy",   hue:145, label:"Happy" }, { mood:"calm", hue:160, label:"Calm" },
    { mood:"meh",     hue:42,  label:"Okay" },  { mood:"worried", hue:28, label:"Worried" },
    { mood:"sad",     hue:2,   label:"Upset" },
  ];
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Calm Corner / Regulation" />
      <div className="sub" style={{ padding:"18px 20px", display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
        <span style={{ color:"var(--pink-accent)", flex:"none" }}>{I.lotus({ s:48, sw:1.7 })}</span>
        <div style={{ fontSize:21, fontWeight:800, letterSpacing:"-.4px", lineHeight:1.2 }}>Take a breath.<br/>You've got this.</div>
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:"var(--ink-soft)", marginBottom:12 }}>Breathing: 4-4-4-4 Box Breathing</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:18 }}>
        {["Inhale","Hold","Exhale","Hold"].map((l,i)=>(
          <React.Fragment key={i}>
            <div className="sub" style={{ flex:1, padding:"12px 4px", textAlign:"center", background:"var(--blue-soft)", boxShadow:"none" }}>
              <div style={{ fontSize:24, fontWeight:800, color:"var(--blue-accent)" }}>4</div>
              <div style={{ fontSize:11.5, fontWeight:700, color:"var(--ink-mute)", marginTop:2 }}>{l}</div>
            </div>
            {i<3 && <span style={{ color:"var(--blue-accent)", flex:"none" }}>{I.arrowR({ s:18 })}</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:"var(--ink-soft)", marginBottom:12 }}>How are you feeling right now?</div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        {feels.map((f,i)=>(
          <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <Face mood={f.mood} hue={f.hue} s={38} /><span style={{ fontSize:12, fontWeight:700, color:"var(--ink-soft)" }}>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 3 — BEHAVIOR / CLASS POINTS */
function ClassPoints() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Behavior / Class Points" />
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:18 }}>
        <span style={{ position:"relative", flex:"none" }}>
          <span style={{ color:"#f2b417" }}>{I.trophy({ s:50, sw:1.8 })}</span>
          <span style={{ position:"absolute", top:-4, left:-8, color:"#f6c34d" }}>{I.spark({ s:13 })}</span>
          <span style={{ position:"absolute", top:0, right:-10, color:"#f6c34d" }}>{I.spark({ s:11 })}</span>
        </span>
        <div style={{ fontSize:21, fontWeight:800, letterSpacing:"-.4px", lineHeight:1.2 }}>We're working together!</div>
      </div>
      <div style={{ fontSize:14.5, fontWeight:800, marginBottom:12 }}>Class Goal Progress</div>
      <div className="sub" style={{ padding:"16px 18px", marginBottom:14, display:"flex", alignItems:"center", gap:14, background:"var(--green-soft)", boxShadow:"none" }}>
        <span style={{ width:48, height:48, borderRadius:"50%", background:"var(--green-accent)", color:"#fff", display:"grid", placeItems:"center", flex:"none" }}>{I.star({ s:24 })}</span>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:24, fontWeight:800, letterSpacing:"-.5px" }}>7 <span style={{ color:"var(--ink-faint)" }}>/ 10</span></div>
          <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:600 }}>points toward our reward</div>
        </div>
        <span style={{ marginLeft:"auto", color:"var(--purple-accent)", flex:"none" }}>{I.gift({ s:30 })}</span>
      </div>
      <div style={{ height:12, borderRadius:99, background:"#d9ecdf", marginBottom:4 }}>
        <div style={{ width:"70%", height:"100%", borderRadius:99, background:"linear-gradient(90deg,#2fa45f,#37b86a)" }} />
      </div>
      <FootNote tone="green" icon={I.star({ s:16 })}>Keep it up! We can do it! 🌟</FootNote>
    </div>
  );
}

/* 4 — TEACHER NOTES (PRIVATE) */
function TeacherNotes() {
  const notes = [
    { tone:"#e3457f", text:"Reinforce our listening signal before group work." },
    { tone:"#e8a91a", text:"Use visuals + timers to support transitions." },
    { tone:"#7c5cf6", text:"Celebrate effort and kindness throughout the day!" },
  ];
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <WHead label="Teacher Notes (Private)" />
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
        <span style={{ position:"relative", flex:"none", color:"var(--pink-accent)" }}>
          {I.note({ s:42 })}
          <span style={{ position:"absolute", right:-3, bottom:-3, width:18, height:18, borderRadius:"50%", background:"var(--pink-accent)", color:"#fff", display:"grid", placeItems:"center" }}>{I.lock({ s:10 })}</span>
        </span>
        <div style={{ fontSize:19, fontWeight:800, letterSpacing:"-.3px" }}>My Teaching Reminders</div>
        <span className="pill" style={{ marginLeft:"auto", background:"var(--orange-soft)", color:"var(--orange-accent)" }}>{I.lock({ s:13 })} Private</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
        {notes.map((n,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 16px" }}>
            <span style={{ width:26, height:26, borderRadius:"50%", background:n.tone, color:"#fff", display:"grid", placeItems:"center", flex:"none" }}>{I.check({ s:15 })}</span>
            <span style={{ fontSize:14.5, fontWeight:600, color:"var(--ink-soft)" }}>{n.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:14, padding:"12px", background:"var(--orange-soft)", borderRadius:13, color:"var(--orange-accent)", fontSize:13.5, fontWeight:700 }}>
        {I.lock({ s:15 })} Only you can see these notes.
      </div>
    </div>
  );
}

/* 5 — MINI WHITEBOARD */
function StarDoodle() {
  return (
    <span style={{ position:"relative", display:"inline-block" }}>
      <svg width="92" height="92" viewBox="0 0 24 24" fill="#ffd23f" stroke="#e6a700" strokeWidth="1" strokeLinejoin="round">
        <path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z"/>
        <circle cx="9.5" cy="11" r=".8" fill="#7a5b00" stroke="none"/><circle cx="14.5" cy="11" r=".8" fill="#7a5b00" stroke="none"/>
        <path d="M9.5 13.5a3 3 0 0 0 5 0" fill="none" stroke="#7a5b00" strokeWidth="1"/>
      </svg>
    </span>
  );
}
function MiniWhiteboard() {
  const pens = ["#1f2430","#2e6be6","#1fa85a","#7c5cf6","#e8a91a"];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Mini Whiteboard" />
      <div className="sub" style={{ padding:"22px 24px", minHeight:170, position:"relative" }}>
        <div className="hand" style={{ fontSize:30, color:"var(--blue-accent)", fontWeight:700, marginBottom:6 }}>Let's solve together!<span style={{ display:"block", width:200, height:3, background:"var(--blue-accent)", borderRadius:9, marginTop:2 }} /></div>
        <div style={{ display:"flex", alignItems:"flex-start", gap:30, marginTop:8 }}>
          <div className="hand" style={{ fontSize:34, color:"#1f2430", fontWeight:700 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              23 + 17 = <span style={{ border:"2.5px solid var(--blue-accent)", borderRadius:8, padding:"0 12px", color:"var(--blue-accent)" }}>40</span>
            </div>
            <div style={{ display:"flex", gap:40, fontSize:27, marginTop:10 }}>
              <div style={{ textAlign:"center", color:"var(--blue-accent)" }}>
                <span style={{ color:"#1f2430" }}>↙ ↘</span><div style={{ display:"flex", gap:18 }}><span>20</span><span>3</span></div>
              </div>
              <div style={{ textAlign:"center", color:"var(--green-accent)" }}>
                <span style={{ color:"#1f2430" }}>↙ ↘</span><div style={{ display:"flex", gap:18 }}><span>10</span><span>7</span></div>
              </div>
            </div>
            <div style={{ fontSize:28, marginTop:12 }}><span style={{ color:"var(--blue-accent)" }}>30</span> + <span style={{ color:"var(--green-accent)" }}>10</span> = <span style={{ color:"var(--blue-accent)" }}>40</span></div>
          </div>
          <span style={{ marginLeft:"auto" }}><StarDoodle /></span>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:14, padding:"10px 14px", background:"#fff", borderRadius:13, boxShadow:"var(--shadow-inner)" }}>
        {pens.map((c,i)=><span key={i} style={{ width:14, height:26, borderRadius:"4px 4px 6px 6px", background:c, flex:"none" }} />)}
        <span style={{ width:1, height:22, background:"var(--line)" }} />
        <span style={{ color:"var(--ink-soft)" }}>{I.eraser({ s:20 })}</span>
        <span style={{ width:20, height:20, borderRadius:"50%", border:"2px dashed var(--ink-faint)" }} />
        <span style={{ marginLeft:"auto", display:"flex", gap:14, color:"var(--ink-soft)" }}>
          {I.undo({ s:19 })}{I.redo({ s:19 })}<span style={{ color:"var(--ink-faint)" }}>{I.trash({ s:19 })}</span>
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { BrainBreak, CalmCorner, ClassPoints, TeacherNotes, MiniWhiteboard });
