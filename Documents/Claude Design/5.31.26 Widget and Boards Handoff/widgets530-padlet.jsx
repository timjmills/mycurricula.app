// widgets530-padlet.jsx — Note / View widget: multi-photo card + enlarged slideshow w/ notes
const { I } = window;
const { WHead } = window;

const TOTAL_PAGES = 46; // pretend PDF length (matches mockup "x / 46")

/* facsimile of the attached worksheet — a fillable verb-tenses guide */
function VerbTensesSheet({ scale = 1 }) {
  const head = ["ASPECT", "PAST\n(Yesterday)", "PRESENT\n(Today)", "FUTURE\n(Tomorrow)"];
  const rows = [
    ["SIMPLE\n(Fact/Habit)", "I ______ (walk) to the park.", "I ______ (walk) to the park every day.", "I ______ (walk) to the park tomorrow."],
    ["PROGRESSIVE\n(Ongoing)", "I was ______ (walk) when it started raining.", "I am ______ (walk) right now.", "I will be ______ (walk) at this time tomorrow."],
    ["PERFECT\n(Completed before)", "I had ______ (walk) before lunch.", "I have ______ (walk) three miles so far.", "I will have ______ (walk) by the time you arrive."],
    ["PERFECT PROGRESSIVE\n(Ongoing duration)", "I had been ______ (walk) for an hour.", "I have been ______ (walk) for twenty minutes.", "I will have been ______ (walk) for two hours by noon."],
  ];
  const ml = (t) => t.split("\n").map((l,i)=><div key={i}>{l}</div>);
  return (
    <div style={{ border:"3px solid #1f5fa8", borderRadius:8, padding:14, background:"#fff", fontSize:13*scale, width:"100%" }}>
      <div style={{ textAlign:"center", color:"#1f5fa8", fontWeight:800, fontSize:22*scale, letterSpacing:".01em", marginBottom:6 }}>VERB TENSES: A FILLABLE GUIDE</div>
      <div style={{ fontSize:12.5*scale, marginBottom:10 }}><strong>Directions:</strong> Complete the sentences with the correct verb form based on the tense and aspect.</div>
      <div style={{ display:"grid", gridTemplateColumns:"0.9fr 1fr 1fr 1fr", border:"1.5px solid #1f5fa8" }}>
        {head.map((h,i)=>(
          <div key={i} style={{ background:"#f3c89a", borderRight: i<3?"1.5px solid #1f5fa8":"none", borderBottom:"1.5px solid #1f5fa8", padding:"8px 6px", fontWeight:800, textAlign:"center", fontSize:12*scale, color:"#222" }}>{ml(h)}</div>
        ))}
        {rows.map((r,ri)=> r.map((c,ci)=>(
          <div key={ri+"-"+ci} style={{ borderRight: ci<3?"1.5px solid #1f5fa8":"none", borderBottom: ri<3?"1.5px solid #1f5fa8":"none",
            padding:"8px 7px", fontSize:11.5*scale, lineHeight:1.45, color:"#222",
            background: ci===0 ? "#bfe0a8" : "#fff", fontWeight: ci===0?800:400,
            display: ci===0?"flex":"block", alignItems:"center", justifyContent:"center", textAlign: ci===0?"center":"left" }}>
            {ci===0 ? ml(c) : <span style={{ borderBottom:"1px dashed #999" }}>{c}</span>}
          </div>
        )))}
      </div>
      <div style={{ textAlign:"right", fontSize:10*scale, color:"#666", marginTop:6 }}>© Fillable Learning Tools ✏️</div>
    </div>
  );
}

/* striped placeholder "page" for the other slides */
function PlaceholderSheet({ label, page }) {
  return (
    <div style={{ width:"100%", aspectRatio:"3 / 4", borderRadius:10, border:"1px solid var(--line)",
      background:"repeating-linear-gradient(135deg,#f4f5f8 0 14px,#eef0f4 14px 28px)", display:"grid", placeItems:"center", position:"relative" }}>
      <div style={{ textAlign:"center", color:"#9aa1ad" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>{I.image({ s:40 })}</div>
        <div style={{ fontFamily:"ui-monospace, Menlo, monospace", fontSize:12.5, fontWeight:600 }}>{label}</div>
        <div style={{ fontFamily:"ui-monospace, Menlo, monospace", fontSize:11.5, marginTop:4 }}>drop photo / PDF page {page}</div>
      </div>
    </div>
  );
}

function Slide({ idx, scale }) {
  if (idx === 0) return <VerbTensesSheet scale={scale} />;
  const labels = ["PRACTICE PAGE", "WORD SORT", "ANCHOR CHART", "EXIT SLIP"];
  return <PlaceholderSheet label={labels[(idx-1) % labels.length]} page={idx+1} />;
}

/* ── enlarged slideshow + notes modal ── */
function NoteModal({ idx, setIdx, onClose }) {
  React.useEffect(()=>{
    const k = (e)=>{ if(e.key==="Escape") onClose(); if(e.key==="ArrowRight") setIdx(i=>Math.min(TOTAL_PAGES-1,i+1)); if(e.key==="ArrowLeft") setIdx(i=>Math.max(0,i-1)); };
    window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k);
  },[]);
  const Act = ({ icon, label, active }) => (
    <button onClick={label==="Close"?onClose:undefined} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3,
      color: active?"var(--purple-accent)":"var(--ink-soft)", fontSize:12, fontWeight:700, padding:"2px 6px",
      borderBottom: active?"2px solid var(--purple-accent)":"2px solid transparent" }}>{icon} {label}</button>
  );
  return (
    <div style={{ position:"fixed", inset:0, zIndex:60, background:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"center", padding:"12px 22px", borderBottom:"1px solid var(--line)" }}>
        <button onClick={onClose} style={{ display:"inline-flex", alignItems:"center", gap:9, fontSize:15, fontWeight:700, color:"var(--ink)" }}>{I.x({ s:20 })} Close</button>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:14 }}>
          <button onClick={()=>setIdx(i=>Math.max(0,i-1))} style={{ color:"var(--ink-soft)" }}>{I.chevL({ s:22 })}</button>
          <span style={{ fontSize:16, fontWeight:700 }}>{idx+1} <span style={{ color:"var(--ink-faint)" }}>/ {TOTAL_PAGES}</span></span>
          <button onClick={()=>setIdx(i=>Math.min(TOTAL_PAGES-1,i+1))} style={{ color:"var(--ink-soft)" }}>{I.chevR({ s:22 })}</button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <Act icon={I.note({ s:20 })} label="Notes" active />
          <Act icon={I.download({ s:20 })} label="Download" />
          <Act icon={I.external({ s:20 })} label="Open in new" />
          <Act icon={I.moreV({ s:20 })} label="More" />
        </div>
      </div>
      <div style={{ flex:1, display:"flex", minHeight:0 }}>
        <div style={{ flex:1, background:"#f6f7f9", display:"grid", placeItems:"center", padding:"28px", overflow:"auto" }}>
          <div style={{ width:"min(620px,100%)", boxShadow:"0 8px 30px rgba(16,23,41,.12)", borderRadius:10 }}><Slide idx={idx} scale={1.18} /></div>
        </div>
        <div style={{ width:380, flex:"none", borderLeft:"1px solid var(--line)", padding:"30px 30px", position:"relative" }}>
          <span style={{ position:"absolute", left:-13, top:"50%", width:26, height:26, borderRadius:"50%", background:"#fff", border:"1px solid var(--line)", display:"grid", placeItems:"center", color:"var(--ink-faint)" }}>{I.chevR({ s:15 })}</span>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:"-.3px", marginBottom:22 }}>Day 1: Verb Tenses</div>
          <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Grammar:</div>
          <div style={{ fontSize:16, fontWeight:500 }}>Brainpop: <a href="#" onClick={e=>e.preventDefault()} style={{ color:"var(--purple-accent)", textDecoration:"underline", fontWeight:600 }}>Verb Tense</a></div>
          <div style={{ borderTop:"1px solid var(--line)", margin:"26px 0 14px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--ink-faint)", fontSize:14, fontWeight:600 }}>§ Week 2 &amp; 3</div>
        </div>
      </div>
    </div>
  );
}

/* ── collapsed note card ── */
function PadletNote() {
  const [idx, setIdx] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const cardIdx = Math.min(idx, 1); // card preview cycles first couple
  return (
    <div className="w" style={{ background:"#fff", border:"1px solid var(--line)", paddingBottom:18 }}>
      <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
        <span style={{ width:38, height:38, borderRadius:11, background:"var(--purple-chip)", color:"var(--purple-accent)", display:"grid", placeItems:"center" }}>{I.note({ s:20 })}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:6, color:"var(--chrome)" }}>
          <button onClick={()=>setOpen(true)} title="Enlarge" style={{ color:"var(--chrome)" }}>{I.expand({ s:18 })}</button>
          <button style={{ color:"var(--chrome)" }}>{I.moreH({ s:18 })}</button>
        </div>
      </div>
      <div style={{ fontSize:24, fontWeight:800, letterSpacing:"-.4px", marginBottom:14 }}>Day 1: Verb Tenses</div>
      <div onClick={()=>setOpen(true)} style={{ border:"1px solid var(--line)", borderRadius:14, padding:12, cursor:"pointer", background:"#fbfbfc" }}>
        <Slide idx={cardIdx} scale={0.82} />
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:18, padding:"14px 0 4px" }}>
        <button onClick={()=>setIdx(i=>Math.max(0,i-1))} style={{ color:"var(--purple-accent)" }}>{I.chevL({ s:22 })}</button>
        <span style={{ display:"flex", gap:7 }}>
          {[0,1].map(d=><span key={d} style={{ width:8, height:8, borderRadius:"50%", background: cardIdx===d ? "var(--purple-accent)" : "#d3d7df" }} />)}
        </span>
        <button onClick={()=>setIdx(i=>i+1)} style={{ color:"var(--purple-accent)" }}>{I.chevR({ s:22 })}</button>
      </div>
      <div style={{ borderTop:"1px solid var(--line)", margin:"10px 0 12px" }} />
      <div style={{ fontSize:18, fontWeight:800, marginBottom:3 }}>Grammar:</div>
      <div style={{ fontSize:17, fontWeight:500 }}>Brainpop: <a href="#" onClick={e=>e.preventDefault()} style={{ color:"var(--purple-accent)", textDecoration:"underline", fontWeight:600 }}>Verb Tense</a></div>
      {open && <NoteModal idx={idx} setIdx={setIdx} onClose={()=>setOpen(false)} />}
    </div>
  );
}

Object.assign(window, { PadletNote });
