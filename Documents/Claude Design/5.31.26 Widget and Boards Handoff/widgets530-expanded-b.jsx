// widgets530-expanded-b.jsx — Groups/Flow (image 3), Board Setup (image 4), + layout wrapper
const { I, Chip } = window;
const { ExHead, ResetBtn, NamePickerBig, QuickPollBig, ScoreboardBig, DiceBig } = window;

/* ===== WORK SOUND (big, 5 options) ===== */
function WorkSoundBig() {
  const [sel,setSel]=React.useState("Group");
  const opts=[
    { k:"Silent", ico:I.user }, { k:"Whisper", ico:I.vol1 }, { k:"Partner", ico:I.users },
    { k:"Group", ico:I.users }, { k:"Ask teacher", ico:I.hand },
  ];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <ExHead family="blue" icon={I.vol2({ s:20 })} title="Work Sound" sub="Set the classroom voice level." />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:10 }}>
        {opts.map(o=>{
          const on=sel===o.k;
          return (
            <button key={o.k} onClick={()=>setSel(o.k)} style={{ display:"flex", flexDirection:"column",
              alignItems:"center", gap:10, padding:"18px 6px", borderRadius:15,
              background:on?"#bcd6fb":"#fff", boxShadow:on?"inset 0 0 0 2px var(--blue-accent)":"var(--shadow-inner)",
              color:on?"var(--blue-accent)":"var(--ink-soft)" }}>
              <span style={{ color:on?"var(--blue-accent)":"#8089a0" }}>{o.ico({ s:26 })}</span>
              <span style={{ fontSize:13.5, fontWeight:700, color:on?"var(--blue-accent)":"var(--ink)" }}>{o.k}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:14, padding:"13px 16px",
        background:"#d4e4fc", borderRadius:13, color:"var(--blue-accent)", fontSize:14, fontWeight:600 }}>
        {I.pinLoc({ s:17 })} Students can see the current voice level.
      </div>
    </div>
  );
}

/* ===== STUDENT GROUPS (big, numbered circles) ===== */
function GroupBlock({ n, hue, count }) {
  return (
    <div className="sub" style={{ display:"flex", alignItems:"center", padding:"16px 18px", marginBottom:12,
      boxShadow:"var(--shadow-inner)" }}>
      <span style={{ width:40, height:40, borderRadius:"50%", background:`hsl(${hue} 65% 52%)`, color:"#fff",
        display:"grid", placeItems:"center", fontWeight:800, fontSize:18, flex:"none", marginRight:14 }}>{n}</span>
      <div>
        <div style={{ fontSize:17, fontWeight:800 }}>Group {n}</div>
        <div style={{ fontSize:13.5, color:"var(--ink-mute)", fontWeight:500 }}>{count} students</div>
      </div>
      <span style={{ marginLeft:"auto", display:"flex", gap:9 }}>
        {Array.from({length:4}).map((_,i)=>(
          <span key={i} style={{ width:34, height:34, borderRadius:"50%", border:`1.5px dashed hsl(${hue} 55% 60%)`,
            display:"grid", placeItems:"center", color:`hsl(${hue} 50% 50%)` }}>{I.plus({ s:16 })}</span>
        ))}
      </span>
    </div>
  );
}
function StudentGroupsBig() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <ExHead family="green" icon={I.users({ s:20 })} title="Student Groups" sub="4 groups · 24 students"
        right={<><button className="w-chrome" style={{ margin:0 }}><span style={{ width:28,height:28,display:"grid",placeItems:"center",color:"var(--chrome)" }}>{I.moreH({ s:17 })}</span></button>
          <button style={{ color:"var(--chrome)", padding:5 }}>{I.x({ s:18 })}</button></>} />
      <GroupBlock n="1" hue={140} count={6} />
      <GroupBlock n="2" hue={210} count={6} />
      <GroupBlock n="3" hue={265} count={6} />
      <GroupBlock n="4" hue={330} count={6} />
      <div style={{ display:"flex", alignItems:"center", gap:11, padding:"14px 16px", background:"var(--green-soft)",
        borderRadius:13 }}>
        <span style={{ color:"var(--green-accent)" }}>{I.users({ s:19 })}</span>
        <div>
          <div style={{ fontSize:14.5, fontWeight:800 }}>Add names in the Groups panel</div>
          <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:500 }}>Tap + to add students to each group.</div>
        </div>
      </div>
    </div>
  );
}

/* ===== LESSON FLOW (big) ===== */
function FlowRowBig({ n, hue, title, sub, time }) {
  return (
    <div className="sub" style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 14px 14px 12px",
      background:`hsl(${hue} 70% 96%)`, boxShadow:`inset 0 0 0 1px hsl(${hue} 60% 88%)`, marginBottom:10 }}>
      <span style={{ color:`hsl(${hue} 30% 70%)` }}>{I.grip({ s:18 })}</span>
      <span style={{ width:34, height:34, borderRadius:"50%", background:`hsl(${hue} 62% 52%)`, color:"#fff",
        display:"grid", placeItems:"center", fontWeight:800, fontSize:15, flex:"none" }}>{n}</span>
      <div>
        <div style={{ fontSize:16, fontWeight:800 }}>{title}</div>
        <div style={{ fontSize:13.5, color:"var(--ink-mute)", fontWeight:500 }}>{sub}</div>
      </div>
      <span style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:6, padding:"7px 13px",
        borderRadius:99, background:"#fff", boxShadow:"var(--shadow-inner)", fontSize:13.5, fontWeight:700,
        color:`hsl(${hue} 45% 40%)` }}>{I.clock({ s:15 })} {time}</span>
      <button style={{ color:"var(--ink-faint)", padding:4 }}>{I.moreV({ s:18 })}</button>
    </div>
  );
}
function LessonFlowBig() {
  return (
    <div className="w" style={{ background:"var(--yellow-grad)" }}>
      <ExHead family="yellow" icon={I.list({ s:20 })} title="Lesson Flow" sub="Drag to reorder the sequence of activities."
        right={<><span style={{ color:"var(--chrome)", padding:5 }}>{I.moreH({ s:17 })}</span>
          <span style={{ color:"var(--chrome)", padding:5 }}>{I.x({ s:18 })}</span></>} />
      <FlowRowBig n="1" hue={140} title="Centers" sub="Small group rotation" time="20 min" />
      <FlowRowBig n="2" hue={330} title="Exit Ticket" sub="Check for understanding" time="5 min" />
      <button style={{ display:"flex", width:"100%", justifyContent:"center", alignItems:"center", gap:8,
        padding:"15px", borderRadius:14, border:"1.5px dashed var(--yellow-line)", color:"var(--ink-soft)",
        fontWeight:700, fontSize:14.5, background:"rgba(255,255,255,.4)" }}>{I.plus({ s:16 })} Add activity</button>
    </div>
  );
}

/* ===== NAME PICKER BAR (full width) ===== */
function NamePickerBar() {
  return (
    <div className="w" style={{ background:"var(--orange-grad)", display:"flex", alignItems:"center", gap:18,
      padding:"20px 24px", flexWrap:"wrap" }}>
      <span style={{ color:"var(--ink)" }}>{I.user({ s:30, sw:1.8 })}</span>
      <div>
        <div style={{ fontSize:18, fontWeight:800 }}>Name Picker</div>
        <div style={{ fontSize:13.5, color:"var(--ink-mute)", fontWeight:500 }}>Pick a student, group, or class.</div>
      </div>
      <div className="sub" style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10, padding:"10px 14px" }}>
        <div style={{ textAlign:"left", lineHeight:1.2 }}>
          <div style={{ fontSize:11.5, color:"var(--ink-mute)", fontWeight:600 }}>Pick from</div>
          <div style={{ fontSize:15, fontWeight:800 }}>Class</div>
        </div>
        <span style={{ color:"var(--ink-faint)", marginLeft:8 }}>{I.chevD({ s:18 })}</span>
      </div>
      <button className="btn btn-ghost" style={{ background:"var(--orange-soft)", color:"var(--ink)", boxShadow:"none" }}>
        {I.user({ s:18 })} Pick a name
      </button>
      <button className="w-actionlink" style={{ fontSize:15 }}>{I.refresh({ s:17 })} Reset</button>
    </div>
  );
}

/* ===== BOARD SETTINGS panel ===== */
function SwatchRow({ label, items }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-mute)", marginBottom:8 }}>{label}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:10 }}>
        {items.map((bg,i)=>(
          <div key={i} style={{ height:42, borderRadius:11, background:bg, boxShadow:"inset 0 0 0 1px rgba(16,23,41,.06)" }} />
        ))}
      </div>
    </div>
  );
}
function BoardSettings() {
  const [tab,setTab]=React.useState("Background");
  const tabs=[["Background",I.image],["Colours",I.droplet],["Patterns",I.grid],["Gradients",I.droplet]];
  return (
    <div className="w" style={{ background:"#fff", border:"1px solid var(--line)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:18 }}>
        <Chip family="purple">{I.gear({ s:20 })}</Chip>
        <div className="w-title" style={{ fontSize:20 }}>Board settings</div>
        <button style={{ marginLeft:"auto", color:"var(--chrome)", padding:5 }}>{I.x({ s:20 })}</button>
      </div>
      <div style={{ fontSize:13.5, fontWeight:700, color:"var(--ink-soft)", marginBottom:8 }}>Board name</div>
      <div style={{ display:"flex", gap:10, marginBottom:20 }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", padding:"12px 15px", borderRadius:12,
          border:"1.5px solid var(--line)", fontSize:15, fontWeight:600 }}>Exit Ticket</div>
        <button className="btn btn-solid" style={{ background:"var(--blue-accent)", padding:"12px 22px", fontSize:15 }}>
          {I.check({ s:18 })} Save</button>
      </div>
      <div style={{ display:"flex", gap:20, borderBottom:"1.5px solid var(--line)", marginBottom:18 }}>
        {tabs.map(([t,ic])=>{
          const on=tab===t;
          return (
            <button key={t} onClick={()=>setTab(t)} style={{ display:"inline-flex", alignItems:"center", gap:7,
              padding:"0 0 12px", fontSize:14, fontWeight:700, color:on?"var(--purple-accent)":"var(--ink-mute)",
              borderBottom:on?"2px solid var(--purple-accent)":"2px solid transparent", marginBottom:-1.5 }}>
              {ic({ s:16 })} {t}</button>
          );
        })}
      </div>
      <div style={{ fontSize:13.5, color:"var(--ink-soft)", fontWeight:600, marginBottom:14 }}>
        Choose a background to set the mood for your board.
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 16px", borderRadius:13,
        background:"var(--purple-grad)", boxShadow:"inset 0 0 0 1.5px var(--purple-line)", marginBottom:18 }}>
        <span style={{ color:"var(--purple-accent)" }}>{I.ban({ s:24 })}</span>
        <div>
          <div style={{ fontSize:15, fontWeight:800 }}>None</div>
          <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:500 }}>Clean and simple</div>
        </div>
        <span style={{ marginLeft:"auto", width:24, height:24, borderRadius:"50%", background:"var(--purple-accent)",
          color:"#fff", display:"grid", placeItems:"center" }}>{I.check({ s:14 })}</span>
      </div>
      <SwatchRow label="Colours" items={["#fdf0c4","#d6f0dc","#dceafc","#fbdce8","#fbe3cf"]} />
      <SwatchRow label="Patterns" items={["#f6f7f9","#eef6ef","#eaf2fb","#f4ecfb","#fdf4e6"]} />
      <SwatchRow label="Gradients" items={[
        "linear-gradient(135deg,#fde4b8,#f9c6d6)","linear-gradient(135deg,#cfeede,#bfe3f0)",
        "linear-gradient(135deg,#cfe0fb,#d9cdf6)","linear-gradient(135deg,#fbd2e4,#f6c6cf)",
        "linear-gradient(135deg,#fde0cf,#f7c9d2)"]} />
      <div style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 16px", borderRadius:13,
        background:"#fdecec", marginTop:4 }}>
        <span style={{ color:"#d9504f" }}>{I.alert({ s:22 })}</span>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:14.5, fontWeight:800, color:"#cf4544" }}>Reset board</div>
          <div style={{ fontSize:13, color:"#9a6a6a", fontWeight:500 }}>Remove all widgets (2). This board itself stays.</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12.5, color:"#b08585", fontWeight:600, marginTop:5 }}>
            {I.lock({ s:13 })} This action cannot be undone.</div>
        </div>
        <button style={{ marginLeft:"auto", flex:"none", padding:"10px 16px", borderRadius:11, fontWeight:700,
          fontSize:14, color:"#cf4544", border:"1.5px solid #f1bcbc", background:"#fff" }}>Reset board</button>
      </div>
    </div>
  );
}

/* tiny confetti/sparkle decoration (basic shapes only) */
function Confetti({ spots }) {
  return (
    <>{spots.map((s,i)=>(
      <span key={i} style={{ position:"absolute", left:s.x, top:s.y, width:s.r, height:s.r,
        borderRadius:s.sq?2:"50%", background:s.c, transform:`rotate(${s.rot||0}deg)`, opacity:.9 }} />
    ))}</>
  );
}

/* ===== TEXT / ANNOUNCEMENT (big, decorated) ===== */
function TextBig() {
  return (
    <div className="w" style={{ background:"var(--yellow-grad)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:6 }}>
        <span className="w-chip" style={{ background:"var(--yellow-chip)", color:"var(--yellow-accent)", fontWeight:800, fontSize:19 }}>T</span>
        <div className="w-title">Text</div>
        <div style={{ marginLeft:"auto", display:"flex", gap:4, color:"var(--chrome)" }}>
          <span style={{ padding:5 }}>{I.pin({ s:17 })}</span><span style={{ padding:5 }}>{I.expand({ s:17 })}</span>
          <span style={{ padding:5 }}>{I.sun({ s:17 })}</span><span style={{ padding:5 }}>{I.moreV({ s:17 })}</span>
        </div>
      </div>
      <div style={{ position:"relative", textAlign:"center", padding:"22px 70px 26px" }}>
        <Confetti spots={[
          {x:"9%",y:"12%",r:6,c:"var(--yellow-accent)",sq:true,rot:20},
          {x:"14%",y:"26%",r:4,c:"#f6c34d"},
          {x:"6%",y:"34%",r:4,c:"#f0b429",sq:true},
        ]} />
        <span style={{ position:"absolute", left:18, bottom:18, color:"var(--ink)" }}>{I.book({ s:46, sw:1.9 })}</span>
        <div style={{ fontSize:30, fontWeight:800, lineHeight:1.3, letterSpacing:"-.5px" }}>
          Read pages <span style={{ color:"var(--orange-accent)" }}>24–26</span>,<br/>then answer in your journal.
        </div>
        <span style={{ position:"absolute", right:16, bottom:14, color:"var(--orange-accent)", transform:"rotate(45deg)" }}>{I.pencil({ s:40, sw:1.9 })}</span>
        <Confetti spots={[
          {x:"90%",y:"22%",r:6,c:"#f6c34d",sq:true,rot:30},
          {x:"85%",y:"68%",r:7,c:"var(--green-accent)"},
        ]} />
      </div>
    </div>
  );
}

/* ===== SOUND / MICROPHONE (big) ===== */
function SoundBig() {
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:16 }}>
        <Chip family="green">{I.mic({ s:20 })}</Chip>
        <div className="w-title">Sound</div>
        <div style={{ marginLeft:"auto", display:"flex", gap:4, color:"var(--chrome)" }}>
          <span style={{ padding:5 }}>{I.pin({ s:17 })}</span><span style={{ padding:5 }}>{I.expand({ s:17 })}</span>
          <span style={{ padding:5 }}>{I.sun({ s:17 })}</span><span style={{ padding:5 }}>{I.moreV({ s:17 })}</span>
        </div>
      </div>
      <div className="sub" style={{ padding:"20px 20px 18px" }}>
        <div style={{ display:"flex", gap:5, marginBottom:18 }}>
          {Array.from({length:32}).map((_,i)=>(
            <span key={i} style={{ flex:1, height:7, borderRadius:99, background: i<23?"var(--green-accent)":"#dadfe5" }} />
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:9, fontSize:15, fontWeight:700, color:"var(--ink-soft)" }}>
          {I.mic({ s:19 })} Turn on microphone
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:16 }}>
        <span style={{ fontSize:14.5, fontWeight:700, color:"var(--ink-soft)" }}>Loud at</span>
        <span style={{ color:"var(--ink-mute)" }}>{I.vol2({ s:18 })}</span>
        <div style={{ position:"relative", flex:1, height:7, borderRadius:99, background:"#cfd5db" }}>
          <div style={{ position:"absolute", left:0, width:"55%", height:"100%", borderRadius:99, background:"var(--blue-accent)" }} />
          <span style={{ position:"absolute", left:"55%", top:"50%", transform:"translate(-50%,-50%)", width:18,
            height:18, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 5px rgba(0,0,0,.3)" }} />
        </div>
        <span style={{ fontSize:19, fontWeight:800, color:"var(--blue-accent)" }}>60</span>
      </div>
    </div>
  );
}

/* ===== COUNTDOWN (big, confetti) ===== */
function CdCell({ n, unit }) {
  return (
    <div className="sub" style={{ background:"var(--pink-soft)", boxShadow:"none", padding:"20px 4px 14px",
      textAlign:"center", flex:1 }}>
      <div style={{ fontSize:52, fontWeight:800, letterSpacing:"-2px", lineHeight:1 }}>{n}</div>
      <div style={{ fontSize:12.5, fontWeight:800, letterSpacing:".08em", color:"var(--pink-accent)", marginTop:9 }}>{unit}</div>
    </div>
  );
}
function CountdownBig() {
  return (
    <div className="w" style={{ background:"var(--pink-grad)", position:"relative" }}>
      <Confetti spots={[
        {x:"4%",y:"42%",r:8,c:"#7eb6f0",sq:true,rot:20},{x:"7%",y:"60%",r:5,c:"var(--pink-accent)"},
        {x:"3%",y:"74%",r:6,c:"#f6c34d",sq:true},{x:"94%",y:"40%",r:7,c:"#f6c34d",rot:0},
        {x:"96%",y:"58%",r:5,c:"#7eb6f0"},{x:"92%",y:"74%",r:8,c:"var(--green-accent)",sq:true,rot:30},
      ]} />
      <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:16 }}>
        <Chip family="pink">{I.clock({ s:20 })}</Chip>
        <div className="w-title">Countdown</div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, color:"var(--chrome)" }}>
          <button className="w-actionlink" style={{ marginRight:4, color:"var(--ink-soft)" }}>{I.pencil({ s:15 })} Edit</button>
          <span style={{ padding:5 }}>{I.pin({ s:17 })}</span><span style={{ padding:5 }}>{I.expand({ s:17 })}</span>
          <span style={{ padding:5 }}>{I.sun({ s:17 })}</span><span style={{ padding:5 }}>{I.moreV({ s:17 })}</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:12, padding:"0 18px" }}>
        <CdCell n="06" unit="DAYS" /><CdCell n="05" unit="HOURS" /><CdCell n="25" unit="MINUTES" />
      </div>
    </div>
  );
}

/* ===== exports (panel shells live in widgets530-panels.jsx) ===== */
Object.assign(window, {
  WorkSoundBig, StudentGroupsBig, LessonFlowBig, NamePickerBar,
  BoardSettings, TextBig, SoundBig, CountdownBig,
});
