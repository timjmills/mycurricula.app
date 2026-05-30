// boardlib.jsx — Board Library mock (recreation of the attached spec)
const { I } = window;

const BTONE = {
  red:["#fde4e7","#d23f54"], orange:["#fbe3cf","#dd6f24"], blue:["#dce9fc","#2e6be6"],
  green:["#dcf2e3","#1f9255"], teal:["#d3f0ec","#138a7e"], purple:["#e8e0fb","#7c5cf6"],
  pink:["#fce0ec","#e3457f"], amber:["#fbeccb","#b9842a"], gray:["#eceef2","#6b7280"],
};
function Tag({ label, tone="gray" }) {
  const [bg,fg] = BTONE[tone] || BTONE.gray;
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"4px 11px", borderRadius:8, fontSize:12, fontWeight:700, background:bg, color:fg }}>{label}</span>;
}
function MiniAv({ hue, s=26 }) {
  return <span style={{ width:s, height:s, borderRadius:"50%", background:`linear-gradient(160deg,hsl(${hue} 60% 84%),hsl(${hue} 55% 74%))`, border:"2px solid #fff", display:"grid", placeItems:"center", flex:"none" }}><span style={{ color:`hsl(${hue} 40% 38%)` }}>{I.user({ s:s*0.55 })}</span></span>;
}
function Star({ on }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill={on?"#f6b51e":"none"} stroke={on?"#f6b51e":"#c4c9d2"} strokeWidth="2" strokeLinejoin="round"><path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z"/></svg>;
}

/* ── board preview thumbnails ── */
function Preview({ kind, accent }) {
  const box = { border:`2px solid ${accent}`, borderRadius:12, background:"#fff", height:"100%", padding:"12px 14px", display:"flex", flexDirection:"column" };
  const title = (t) => <div style={{ textAlign:"center", fontWeight:800, color:accent, fontSize:14, marginBottom:6 }}>{t}</div>;
  if (kind==="warmup") return <div style={box}>{title("Warm-Up")}<div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}><span style={{ fontSize:24, fontWeight:800, color:"var(--ink)" }}>7 × 8 = ?</span><span style={{ position:"absolute", right:0, bottom:0, color:accent }}>{I.clock({ s:22 })}</span></div></div>;
  if (kind==="centers"||kind==="guided") return <div style={box}>{title(kind==="centers"?"Centers Rotation":"Guided Reading Table")}<div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><MiniAv hue={20} s={32}/><MiniAv hue={200} s={32}/><MiniAv hue={28} s={32}/></div></div>;
  if (kind==="whiteboard") return <div style={box}><div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:12, color:accent }}>{I.cloud({ s:26 })}<span style={{ color:"#f6c34d" }}>{I.spark({ s:18 })}</span><span style={{ color:"#f2b417" }}>{I.sun({ s:22 })}</span><span style={{ color:accent, transform:"rotate(45deg)" }}>{I.marker({ s:24 })}</span></div></div>;
  if (kind==="grammar") return <div style={box}>{title("Week 2 Grammar")}<div style={{ flex:1, border:`1px solid ${accent}`, borderRadius:6, overflow:"hidden", fontSize:10.5 }}><div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr" }}><div style={{ background:"#eaf1fd", padding:"4px 6px", fontWeight:700, borderRight:`1px solid ${accent}`, borderBottom:`1px solid ${accent}` }}>Tense</div><div style={{ background:"#eaf1fd", padding:"4px 6px", fontWeight:700, borderBottom:`1px solid ${accent}` }}>Example</div><div style={{ padding:"4px 6px", borderRight:`1px solid ${accent}` }}>Past</div><div style={{ padding:"4px 6px" }}>I walked to the park.</div></div></div></div>;
  if (kind==="science") return <div style={box}>{title("Science Lab Notes")}<div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:14, color:accent }}>{I.leaf({ s:26 })}{I.beaker({ s:26 })}</div></div>;
  if (kind==="exit") return <div style={box}>{title("Exit Ticket")}<div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", gap:7 }}>{[0,1,2].map(i=><div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ width:14, height:14, borderRadius:4, border:`2px solid ${accent}`, display:"grid", placeItems:"center", color:accent }}>{I.check({ s:9 })}</span><span style={{ flex:1, height:5, borderRadius:9, background:"#e9ebf0" }} /></div>)}</div></div>;
  if (kind==="morning") return <div style={box}>{title("Morning Meeting")}<div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}><span style={{ color:"var(--purple-accent)" }}>{I.msg({ s:26 })}</span><span style={{ width:30, height:30, borderRadius:"50%", background:"#fdf0c4", display:"grid", placeItems:"center" }}><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="9" cy="10" r="1.4" fill="#caa42a"/><circle cx="15" cy="10" r="1.4" fill="#caa42a"/><path d="M8 14a5 5 0 0 0 8 0" fill="none" stroke="#caa42a" strokeWidth="1.8" strokeLinecap="round"/></svg></span></div></div>;
  return <div style={box} />;
}

/* ── board card ── */
function ActionBtn({ icon, label }) {
  return <button style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:"var(--ink-soft)", fontSize:11.5, fontWeight:600, flex:1, padding:"2px 0" }}><span style={{ color:"var(--ink-mute)" }}>{icon}</span>{label}</button>;
}
function BoardCard({ b }) {
  return (
    <div style={{ background:"#fff", border:"1px solid var(--line)", borderRadius:18, padding:14, boxShadow:"var(--shadow-card)", display:"flex", flexDirection:"column" }}>
      <div style={{ position:"relative", height:128, background:`var(--${b.fam}-grad)`, borderRadius:13, padding:12, marginBottom:13 }}>
        {b.star && <span style={{ position:"absolute", top:10, right:10, zIndex:1 }}><Star on /></span>}
        <Preview kind={b.kind} accent={`var(--${b.fam}-accent)`} />
      </div>
      <div style={{ fontSize:16.5, fontWeight:800, marginBottom:10 }}>{b.title}</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:12 }}>
        {b.tags.map((t,i)=><Tag key={i} label={t[0]} tone={t[1]} />)}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, minHeight:18 }}>
        {b.repeats && <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, color:"var(--blue-accent)" }}>{I.refresh({ s:13 })} Repeats: {b.repeats}</span>}
        <span style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, color:"var(--ink-mute)" }}>{b.owner==="Personal"?I.user({ s:13 }):I.users({ s:13 })} {b.owner}</span>
      </div>
      <div style={{ borderTop:"1px solid var(--line)", paddingTop:10, display:"flex" }}>
        <ActionBtn icon={I.external({ s:18 })} label="Open" />
        <ActionBtn icon={I.copy({ s:18 })} label="Duplicate" />
        <ActionBtn icon={I.refresh({ s:18 })} label="Repeat" />
        <ActionBtn icon={I.shareUp({ s:18 })} label="Share" />
        <ActionBtn icon={I.moreH({ s:18 })} label="More" />
      </div>
    </div>
  );
}

const BOARDS = [
  { title:"Monday Math Warm-Up", kind:"warmup", fam:"blue", star:true, repeats:"Mon/Wed/Fri", owner:"Grade 5 Team",
    tags:[["Math","red"],["Day 1","orange"],["8:00 AM","blue"],["Lesson Start","green"]] },
  { title:"Reading Centers Rotation", kind:"centers", fam:"green", star:true, repeats:null, owner:"Grade 5 Team",
    tags:[["Reading","red"],["Part of Lesson","green"],["Centers","purple"]] },
  { title:"Free Whiteboard", kind:"whiteboard", fam:"purple", star:false, repeats:null, owner:"Personal",
    tags:[["Whiteboard","purple"],["Free Board","pink"]] },
  { title:"Week 2 Grammar Board", kind:"grammar", fam:"blue", star:true, repeats:"Weekly", owner:"Grade 5 Team",
    tags:[["Grammar","purple"],["Week 2","blue"]] },
  { title:"Science Lab Notes", kind:"science", fam:"green", star:true, repeats:null, owner:"Grade 5 Team",
    tags:[["Science","green"],["Part of Lesson","green"]] },
  { title:"Friday Exit Ticket", kind:"exit", fam:"pink", star:true, repeats:"Fridays", owner:"Grade 5 Team",
    tags:[["Assessment","red"],["End of Lesson","orange"]] },
  { title:"Morning Meeting", kind:"morning", fam:"yellow", star:true, repeats:"Daily", owner:"Grade 5 Team",
    tags:[["SEL","purple"],["Day","blue"],["Daily Repeat","green"]] },
  { title:"Guided Reading Table", kind:"guided", fam:"green", star:false, repeats:null, owner:"Grade 5 Team",
    tags:[["Small Group","purple"],["Reading","red"],["Part of Lesson","teal"]] },
];

/* ── top bar ── */
function TopBar() {
  const [tab,setTab] = React.useState("Personal");
  return (
    <div style={{ display:"flex", alignItems:"center", gap:20, padding:"14px 26px", borderBottom:"1px solid var(--line)", background:"#fff" }}>
      <span style={{ color:"var(--blue-accent)", flex:"none" }}>{I.school({ s:34, sw:1.7 })}</span>
      <div style={{ display:"flex", background:"#eef1f6", borderRadius:12, padding:4, flex:"none" }}>
        {["Team","Personal"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:"9px 18px", borderRadius:9, fontSize:14, fontWeight:700,
            background: tab===t?"#fff":"transparent", color: tab===t?"var(--blue-accent)":"var(--ink-mute)",
            boxShadow: tab===t?"var(--shadow-inner)":"none" }}>{t} Boards</button>
        ))}
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderRadius:13, border:"1px solid var(--line)", color:"var(--ink-faint)", maxWidth:520 }}>
        {I.search({ s:18 })}<span style={{ fontSize:14.5, fontWeight:500 }}>Search boards</span>
      </div>
      <div style={{ flex:"none", minWidth:190 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, marginBottom:6 }}>18 <span style={{ color:"var(--ink-mute)", fontWeight:600 }}>/ 50 boards used</span><span style={{ color:"var(--ink-faint)" }}>{I.info({ s:14 })}</span></div>
        <div style={{ height:6, borderRadius:99, background:"#e6e9ef" }}><div style={{ width:"36%", height:"100%", borderRadius:99, background:"var(--blue-accent)" }} /></div>
      </div>
      <button className="btn btn-solid" style={{ background:"var(--blue-accent)", flex:"none", padding:"12px 22px", fontSize:15 }}>{I.plus({ s:18 })} New Board</button>
    </div>
  );
}

/* ── sidebar ── */
function SideItem({ icon, label, active, tone }) {
  return <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:11, cursor:"pointer",
    background: active?"#e6effd":"transparent", color: active?"var(--blue-accent)":"var(--ink-soft)", fontWeight: active?700:600, fontSize:14.5 }}>
    <span style={{ color: tone || (active?"var(--blue-accent)":"var(--ink-faint)") }}>{icon({ s:19 })}</span>{label}</div>;
}
function Sidebar() {
  return (
    <div style={{ width:236, flex:"none", borderRight:"1px solid var(--line)", padding:"20px 16px", display:"flex", flexDirection:"column", gap:3, background:"#fff" }}>
      <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".12em", color:"var(--ink-faint)", padding:"0 12px 8px" }}>MY LIBRARY</div>
      <SideItem icon={I.folder} label="All Boards" active />
      <SideItem icon={I.star} label="Favorites" />
      <SideItem icon={I.clock} label="Recent" />
      <SideItem icon={I.users} label="Shared with Team" />
      <SideItem icon={I.user} label="My Boards" />
      <SideItem icon={I.archive} label="Archived" />
      <div style={{ fontSize:11.5, fontWeight:700, letterSpacing:".12em", color:"var(--ink-faint)", padding:"20px 12px 8px" }}>FILTER BY USE</div>
      <SideItem icon={I.book} label="Lesson" tone="#1f9255" />
      <SideItem icon={I.list} label="Part of Lesson" tone="#138a7e" />
      <SideItem icon={I.scribble} label="Free Board" tone="#7c5cf6" />
      <SideItem icon={I.calDay} label="Day" tone="#dd6f24" />
      <SideItem icon={I.calWeek} label="Week" tone="#2e6be6" />
      <SideItem icon={I.book} label="Subject" tone="#d23f54" />
      <SideItem icon={I.clock} label="Schedule Time" tone="#b9842a" />
      <SideItem icon={I.marker} label="Whiteboard" tone="#7c5cf6" />
      <div style={{ marginTop:"auto", background:"#f6f7f9", border:"1px solid var(--line)", borderRadius:16, padding:"16px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6, color:"var(--blue-accent)" }}>{I.boxIco({ s:24 })}<span style={{ fontSize:13.5, color:"var(--ink-soft)", fontWeight:600 }}>You can create up to <strong style={{ color:"var(--ink)" }}>50 boards.</strong></span></div>
        <div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:600, marginBottom:8 }}>You're using 18 boards.</div>
        <div style={{ height:6, borderRadius:99, background:"#e6e9ef", marginBottom:12 }}><div style={{ width:"36%", height:"100%", borderRadius:99, background:"var(--blue-accent)" }} /></div>
        <button style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:13.5, fontWeight:700, color:"var(--blue-accent)" }}>Manage boards {I.arrowR({ s:15 })}</button>
      </div>
    </div>
  );
}

/* ── main ── */
const FILTERS = [["All","blue"],["Lesson","green"],["Part of Lesson","teal"],["Whiteboard","purple"],["Day","orange"],["Week","blue"],["Subject","red"],["Schedule Time","amber"],["Shared","gray"]];
function SharedRow({ icon, fam, title, tags, by, ago }) {
  return (
    <div style={{ background:"#fff", border:"1px solid var(--line)", borderRadius:13, padding:"13px 14px", flex:1, minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:9 }}>
        <span style={{ width:30, height:30, borderRadius:9, background:`var(--${fam}-chip)`, color:`var(--${fam}-accent)`, display:"grid", placeItems:"center", flex:"none" }}>{icon({ s:16 })}</span>
        <span style={{ fontSize:13.5, fontWeight:800, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</span>
        <span style={{ color:"var(--ink-faint)" }}>{I.moreV({ s:15 })}</span>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>{tags.map((t,i)=><Tag key={i} label={t[0]} tone={t[1]} />)}</div>
      <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11.5, color:"var(--ink-mute)", fontWeight:600 }}>{I.users({ s:13 })} {by} · {ago}</div>
    </div>
  );
}
function Main() {
  return (
    <div style={{ flex:1, minWidth:0, padding:"20px 26px 24px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22, flexWrap:"wrap" }}>
        {FILTERS.map(([f,t],i)=>{
          const [bg,fg] = BTONE[t]; const on=i===0;
          return <span key={f} style={{ padding:"8px 15px", borderRadius:10, fontSize:13.5, fontWeight:700, cursor:"pointer",
            background: on?fg:"#fff", color: on?"#fff":fg, border:`1.5px solid ${on?fg:bg}` }}>{f}</span>;
        })}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, fontSize:13.5, color:"var(--ink-mute)", fontWeight:600 }}>
          Sort by <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 13px", borderRadius:10, border:"1px solid var(--line)", color:"var(--ink-soft)", fontWeight:700 }}>Recently updated {I.chevD({ s:15 })}</span>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:18, marginBottom:24 }}>
        {BOARDS.map((b,i)=><BoardCard key={i} b={b} />)}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1.4fr)", gap:20 }}>
        <div style={{ background:"var(--blue-grad)", border:"1px solid var(--blue-line)", borderRadius:18, padding:"20px 22px" }}>
          <div style={{ fontSize:17, fontWeight:800, color:"var(--blue-accent)", marginBottom:6 }}>Boards are separate from resources.</div>
          <div style={{ fontSize:13.5, color:"var(--ink-soft)", fontWeight:500, marginBottom:16 }}>Drag resources onto a board when needed.</div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"#fff", borderRadius:11, boxShadow:"var(--shadow-inner)", fontSize:12.5, fontWeight:700 }}><span style={{ color:"var(--pink-accent)" }}>{I.note({ s:16 })}</span> Verb Tenses Chart {I.handPt({ s:15 })}</div>
            <span style={{ color:"var(--blue-accent)" }}>{I.arrowR({ s:20 })}</span>
            <div style={{ flex:1, border:"1.5px dashed var(--blue-line)", borderRadius:11, padding:"10px 12px", textAlign:"center", fontSize:12.5, fontWeight:600, color:"var(--ink-faint)" }}>Drop resource here</div>
          </div>
          <button style={{ marginTop:14, display:"inline-flex", alignItems:"center", gap:7, fontSize:13, fontWeight:700, color:"var(--blue-accent)" }}>Learn more about boards &amp; resources {I.arrowR({ s:15 })}</button>
        </div>
        <div style={{ background:"#fbfbfc", border:"1px solid var(--line)", borderRadius:18, padding:"20px 22px" }}>
          <div style={{ display:"flex", alignItems:"baseline", marginBottom:4 }}>
            <span style={{ fontSize:17, fontWeight:800, color:"var(--purple-accent)" }}>Team Library</span>
            <button style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:700, color:"var(--blue-accent)" }}>View team library {I.arrowR({ s:14 })}</button>
          </div>
          <div style={{ fontSize:13, color:"var(--ink-mute)", fontWeight:500, marginBottom:14 }}>Boards shared with your team</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 }}>
            <SharedRow icon={I.grid} fam="blue" title="Place Value Review" tags={[["Math","red"],["Week 1","blue"]]} by="Mr. Johnson" ago="2 days ago" />
            <SharedRow icon={I.pencil} fam="purple" title="Argument Writing Plan" tags={[["ELA","blue"],["Week 2","blue"]]} by="Mr. Lee" ago="3 days ago" />
            <SharedRow icon={I.leaf} fam="green" title="Living Things Sort" tags={[["Science","green"],["Day 2","orange"]]} by="Ms. Patel" ago="4 days ago" />
            <SharedRow icon={I.x} fam="pink" title="Multiplication Games" tags={[["Math","red"],["Centers","purple"]]} by="Ms. Davis" ago="5 days ago" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardLibrary() {
  const [tip,setTip] = React.useState(true);
  return (
    <div className="screen" style={{ borderRadius:20 }}>
      <TopBar />
      <div style={{ display:"flex" }}><Sidebar /><Main /></div>
      {tip && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 22px", borderTop:"1px solid var(--line)", background:"#eef3fb", fontSize:13.5, fontWeight:500, color:"var(--ink-soft)" }}>
          <span style={{ color:"var(--blue-accent)" }}>{I.info({ s:18 })}</span>
          <span><strong style={{ color:"var(--ink)" }}>Tips:</strong> Duplicate a board to save time. Use Repeat to schedule it on multiple days or times. Share boards to collaborate with your team.</span>
          <button onClick={()=>setTip(false)} style={{ marginLeft:"auto", color:"var(--ink-faint)" }}>{I.x({ s:18 })}</button>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <div className="page" style={{ maxWidth:1560 }}>
      <div className="page-head"><h1>Board Library</h1><span className="sub">5.30.26 · teacher board manager</span></div>
      <p className="page-note">Browse, tag, duplicate, repeat, and share classroom boards. Boards are separate from resources — drag a resource onto a board when you need it. Up to 50 boards per teacher.</p>
      <BoardLibrary />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
