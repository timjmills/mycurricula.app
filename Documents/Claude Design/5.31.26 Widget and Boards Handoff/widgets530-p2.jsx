// widgets530-p2.jsx — Panel 2: Routines & Classroom Management
const { I } = window;
const { WHead, Avatar, FootNote, StepNum } = window;

/* 1 — TRANSITION */
function Transition() {
  const steps = [
    { icon:I.bell,    text:"Wrap up your current work." },
    { icon:I.chair,   text:"Push in your chair." },
    { icon:I.backpack,text:"Bring needed materials." },
    { icon:I.users,   text:"Move quietly to your center." },
  ];
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Transition: To Centers" />
      <div style={{ display:"flex", gap:18 }}>
        <div style={{ flex:"1 1 0", minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
            <span style={{ position:"relative", flex:"none" }}>
              <span style={{ color:"var(--green-accent)" }}>{I.clock({ s:52, sw:1.8 })}</span>
              <span style={{ position:"absolute", top:-4, left:-8, color:"var(--purple-accent)" }}>{I.spark({ s:13 })}</span>
              <span style={{ position:"absolute", top:2, right:-10, color:"#f6c34d" }}>{I.spark({ s:12 })}</span>
            </span>
            <div>
              <div style={{ fontSize:21, fontWeight:800, letterSpacing:"-.4px" }}>Transitioning to Centers</div>
              <div style={{ fontSize:14, color:"var(--ink-mute)", fontWeight:500 }}>Let's move with purpose!</div>
            </div>
          </div>
          <div className="sub" style={{ padding:"14px 16px", marginBottom:12, display:"flex", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".08em", color:"var(--ink-mute)" }}>TIME REMAINING</div>
              <div style={{ fontSize:34, fontWeight:800, letterSpacing:"-1.5px", color:"var(--green-accent)", lineHeight:1.1 }}>02:45</div>
            </div>
            <span style={{ marginLeft:"auto", width:42, height:42, borderRadius:"50%", background:"#eef0f4", color:"var(--ink-soft)", display:"grid", placeItems:"center" }}>{I.pause({ s:18 })}</span>
          </div>
          <div className="sub" style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:11 }}>
            <span style={{ color:"var(--green-accent)" }}>{I.vol2({ s:20 })}</span>
            <div>
              <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".08em", color:"var(--ink-mute)" }}>VOICE LEVEL</div>
              <div style={{ fontSize:15, fontWeight:800, color:"var(--green-accent)" }}>Level 1 – Whisper</div>
            </div>
          </div>
        </div>
        <div style={{ width:1, background:"var(--green-line)", flex:"none" }} />
        <div style={{ flex:"1 1 0", minWidth:0, display:"flex", flexDirection:"column", justifyContent:"center", gap:16 }}>
          {steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:13 }}>
              <StepNum n={i+1} hue={145} s={28} />
              <span style={{ color:"var(--green-accent)" }}>{s.icon({ s:22 })}</span>
              <span style={{ fontSize:14.5, fontWeight:600, color:"var(--ink-soft)" }}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 2 — ATTENTION SIGNAL */
function AttentionSignal() {
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Attention Signal" />
      <div className="sub" style={{ padding:"26px 22px", display:"flex", alignItems:"center", gap:18 }}>
        <span style={{ position:"relative", flex:"none", color:"var(--blue-accent)" }}>{I.mega({ s:54, sw:1.8 })}</span>
        <div style={{ fontSize:30, fontWeight:800, letterSpacing:"-.6px", lineHeight:1.1, minWidth:0 }}>Eyes here • Voices off</div>
        <span style={{ marginLeft:"auto", width:78, height:78, borderRadius:"50%", border:"5px solid var(--blue-soft)", borderTopColor:"var(--blue-accent)", borderRightColor:"var(--blue-accent)", display:"grid", placeItems:"center", flex:"none", transform:"rotate(45deg)" }}>
          <span style={{ transform:"rotate(-45deg)", textAlign:"center", lineHeight:1 }}>
            <span style={{ fontSize:26, fontWeight:800 }}>5</span><br/><span style={{ fontSize:11, fontWeight:700, color:"var(--ink-mute)" }}>sec</span>
          </span>
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:9, marginTop:14, padding:"13px",
        background:"var(--blue-soft)", borderRadius:13, color:"var(--blue-accent)", fontSize:15, fontWeight:800 }}>
        {I.users({ s:18 })} 19 / 24 ready
      </div>
    </div>
  );
}

/* 3 — VOICE + MOVEMENT EXPECTATIONS */
function VoiceMovement() {
  const rows = [
    { cat:"VOICE",    val:"Partner",            icon:I.msg,    fam:"purple" },
    { cat:"MOVEMENT", val:"Stay seated",        icon:I.user,   fam:"blue" },
    { cat:"HELP",     val:"Ask 3 then me",      icon:I.hand,   fam:"purple" },
    { cat:"WORK",     val:"Complete questions 1–4", icon:I.pencil, fam:"blue" },
  ];
  return (
    <div className="w" style={{ background:"var(--purple-grad)" }}>
      <WHead label="Voice + Movement Expectations" />
      <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
        {rows.map((r,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 15px" }}>
            <span style={{ width:46, height:46, borderRadius:12, background:`var(--${r.fam}-chip)`, color:`var(--${r.fam}-accent)`, display:"grid", placeItems:"center", flex:"none" }}>{r.icon({ s:22 })}</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:800, letterSpacing:".07em", color:`var(--${r.fam}-accent)` }}>{r.cat}</div>
              <div style={{ fontSize:17, fontWeight:800, marginTop:1 }}>{r.val}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 4 — WHEN YOU'RE DONE */
function DoCard({ icon, text, fam }) {
  return (
    <div className="sub" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:9, padding:"16px 8px", textAlign:"center" }}>
      <span style={{ color:`var(--${fam}-accent)` }}>{icon({ s:28 })}</span>
      <span style={{ fontSize:12.5, fontWeight:700, lineHeight:1.25 }}>{text}</span>
    </div>
  );
}
function WhenDone() {
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <WHead label="When You're Done" />
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <span style={{ color:"#e8a91a" }}>{I.star({ s:17 })}</span>
        <span style={{ fontSize:12.5, fontWeight:800, letterSpacing:".06em", color:"var(--orange-accent)" }}>MUST DO</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:10, marginBottom:16 }}>
        <DoCard icon={I.book}    text="Read independently" fam="green" />
        <DoCard icon={I.pencil}  text="Reflect in your journal" fam="orange" />
        <DoCard icon={I.clipChk} text="Check your answers" fam="green" />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <span style={{ color:"var(--purple-accent)" }}>{I.spark({ s:16 })}</span>
        <span style={{ fontSize:12.5, fontWeight:800, letterSpacing:".06em", color:"var(--purple-accent)" }}>MAY DO</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:10 }}>
        <DoCard icon={I.headset} text="Reading on Epic!" fam="blue" />
        <DoCard icon={I.puzzle}  text="Puzzle Challenge" fam="purple" />
        <DoCard icon={I.marker}  text="Draw & Create" fam="green" />
      </div>
    </div>
  );
}

/* 5 — STUDENT JOBS */
function StudentJobs() {
  const jobs = [
    { icon:I.flag,   job:"Line Leader",      name:"Ben" },
    { icon:I.boxIco, job:"Materials Helper", name:"Ava" },
    { icon:I.laptop, job:"Tech Helper",      name:"Diego" },
    { icon:I.easel,  job:"Board Helper",     name:"Ella" },
  ];
  return (
    <div className="w" style={{ background:"var(--yellow-grad)" }}>
      <WHead label="Student Jobs" />
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {jobs.map((j,i)=>(
          <div key={i} className="sub" style={{ display:"flex", alignItems:"center", gap:13, padding:"12px 16px" }}>
            <span style={{ color:"var(--orange-accent)" }}>{j.icon({ s:22 })}</span>
            <span style={{ fontSize:15, fontWeight:700 }}>{j.job}</span>
            <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:9 }}>
              <Avatar name={j.name} s={30} /><span style={{ fontSize:14.5, fontWeight:700 }}>{j.name}</span>
            </span>
          </div>
        ))}
      </div>
      <FootNote tone="amber" icon={I.star({ s:16 })}>Thank you for helping our class shine! ✨</FootNote>
    </div>
  );
}

Object.assign(window, { Transition, AttentionSignal, VoiceMovement, WhenDone, StudentJobs });
