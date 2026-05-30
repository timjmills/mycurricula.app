// boardfull.jsx — full-screen board (our style): favorites bar + library popup + markup panel
const I = window.I;
const { WIDGET_DEFS, effective, themeVars } = window;
const uid = () => Math.random().toString(36).slice(2,8);

const BGS = [
  ["dusk","Dusk","linear-gradient(160deg,#e9e3fb 0%,#dceafd 45%,#e2f3ea 100%)"],
  ["cream","Cream","linear-gradient(165deg,#fdf6ea,#fbeede)"],
  ["sky","Sky","linear-gradient(165deg,#e4eefe,#eff4ff)"],
  ["blossom","Blossom","linear-gradient(165deg,#fde4ef,#fbe0e9)"],
  ["mint","Mint","linear-gradient(165deg,#e7f5eb,#e0f1e6)"],
  ["apricot","Apricot","linear-gradient(165deg,#fdeede,#fce8d6)"],
  ["lilac","Lilac","linear-gradient(165deg,#efe9fc,#e7e0fb)"],
  ["night","Night","linear-gradient(160deg,#3c3168 0%,#2a2550 42%,#21566a 100%)"],
  ["dots","Dots","#f6f7f9"],
  ["plain","Plain","#ffffff"],
];
const bgCss = (k) => (BGS.find(b=>b[0]===k)||BGS[0])[2];

/* dock-style icon resolver (handles a few custom glyphs) */
function GIcon({ name, s=22 }) {
  if (name==="CURSOR") return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l15 9-6.5 1.5L10 20 5 3z"/></svg>;
  if (name==="AA") return <span style={{ fontSize:s*0.9, fontWeight:800, letterSpacing:"-.02em", lineHeight:1 }}>Aa</span>;
  if (name==="HOURGLASS") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 0M7 21c0-5 10-5 10 0"/></svg>;
  if (name==="TRAFFIC") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="8" y="2" width="8" height="20" rx="4"/><circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>;
  if (name==="HIGHLIGHT") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-1 4-4 1 1-4 9-9 3 3z"/><path d="M14 6l4 4"/><line x1="3" y1="22" x2="21" y2="22"/></svg>;
  const fn = I[name] || I.grid; return fn({ s });
}
const HomeIcon = ({ s=20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h5v-6h4v6h5v-9"/></svg>;
const Cursor = ({ s=20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l15 9-6.5 1.5L10 20 5 3z"/></svg>;

/* favorite widget chips + all-widgets list */
const FAVORITES = [
  ["text","Text","AA"], ["timer","Timer","HOURGLASS"], ["poll","Poll","bars"],
  ["namepick","Name Picker","user"], ["clock","Clock","clock"], ["traffic","Traffic","TRAFFIC"],
];
const LIBALL = [
  ["text","Text","AA"], ["poll","Poll","bars"], ["namepick","Randomizer","user"],
  ["timer","Timer","HOURGLASS"], ["clock","Clock","clock"], ["traffic","Traffic Light","TRAFFIC"],
  ["target","Learning Target","target"], ["directions","Directions","clipChk"], ["exit","Exit Ticket","ticket"],
  ["resource","Image","image"], ["tool:sound","Sound Level","vol2"], ["tool:work","Work Sound","mic"],
  ["tool:timetable","Timetable","calWeek"], ["tool:groups","Groups","users"], ["tool:dice","Dice","cube"],
];

/* placed widget */
function Placed({ w, sel, tool, onSel, onDrag, onDel }) {
  const def = WIDGET_DEFS[w.type] || WIDGET_DEFS.tool;
  const eff = effective(def.def, {}, w.ov || {});
  const start = (e) => {
    if (tool!=="select") return;
    e.stopPropagation(); onSel(w.id);
    const sx=e.clientX, sy=e.clientY, ox=w.x, oy=w.y;
    const mv=(ev)=>onDrag(w.id, Math.max(0,ox+ev.clientX-sx), Math.max(0,oy+ev.clientY-sy));
    const up=()=>{ window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };
  return (
    <div className={"tw-wrap"+(sel?" sel":"")} style={{ left:w.x, top:w.y, width:w.w, cursor: tool==="select"?"grab":"inherit" }} onMouseDown={start}>
      {sel && tool==="select" && <div className="tw-tools"><button title="Delete" onClick={(e)=>{e.stopPropagation();onDel(w.id);}} style={{ color:"#d23f54" }}>{I.trash({ s:16 })}</button></div>}
      <div className="tw" style={themeVars(eff)}>{def.render(w.data)}</div>
    </div>
  );
}

function BoardFull() {
  const [bg, setBg] = React.useState("dusk");
  const [widgets, setWidgets] = React.useState([
    { id:uid(), type:"text", x:440, y:150, w:360, ov:{} },
    { id:uid(), type:"clock", x:520, y:360, w:240, ov:{} },
  ]);
  const [sel, setSel] = React.useState(null);
  const [tool, setTool] = React.useState("select");       // select|pen|highlighter|eraser|text|sticky
  const [color, setColor] = React.useState("#7c5cf6");
  const [strokes, setStrokes] = React.useState([]);
  const [redo, setRedo] = React.useState([]);
  const [side, setSide] = React.useState("left");          // markup panel side
  const [bgOpen, setBgOpen] = React.useState(false);
  const [libOpen, setLibOpen] = React.useState(false);
  const [page, setPage] = React.useState(9);
  const ref = React.useRef(null);

  const addW = (spec, atX, atY) => {
    let type = spec, data, ov = {};
    if (spec.startsWith("tool:")) { type="tool"; const m={sound:["vol2","Sound Level"],work:["mic","Work Sound"],timetable:["calWeek","Timetable"],groups:["users","Student Groups"],dice:["cube","Dice"]}[spec.slice(5)]; data={ iconKey:m[0], label:m[1] }; }
    else if (spec==="resource") data={ title:"Image" };
    else if (spec==="sticky") { type="text"; ov={ bg:"yellow", accent:"yellow" }; }
    const def = WIDGET_DEFS[type] || WIDGET_DEFS.tool;
    const rect = ref.current.getBoundingClientRect();
    const x = atX!=null ? atX-def.w/2 : rect.width/2-def.w/2;
    const y = atY!=null ? atY-40 : rect.height/2-120;
    const id = uid();
    setWidgets(ws=>[...ws,{ id, type, x:Math.max(0,x), y:Math.max(0,y), w:def.w, ov, data }]);
    setSel(id); setLibOpen(false); setBgOpen(false); setTool("select");
  };
  const onDrag=(id,x,y)=>setWidgets(ws=>ws.map(w=>w.id===id?{...w,x,y}:w));
  const onDel=(id)=>{ setWidgets(ws=>ws.filter(w=>w.id!==id)); setSel(null); };

  const pushStroke=(s)=>{ setStrokes(p=>[...p,s]); setRedo([]); };
  const undo=()=>setStrokes(p=>{ if(!p.length) return p; setRedo(r=>[...r,p[p.length-1]]); return p.slice(0,-1); });
  const redoFn=()=>setRedo(r=>{ if(!r.length) return r; setStrokes(p=>[...p,r[r.length-1]]); return r.slice(0,-1); });
  const clearAll=()=>{ setStrokes([]); setRedo([]); };

  const boardDown = (e) => {
    const rect=ref.current.getBoundingClientRect();
    const P=(ev)=>[ev.clientX-rect.left, ev.clientY-rect.top];
    if (tool==="pen" || tool==="highlighter") {
      const width = tool==="highlighter" ? 16 : 4;
      const op = tool==="highlighter" ? 0.35 : 1;
      let pts=[P(e).join(",")]; const stroke={ pts, color, width, op };
      setStrokes(s=>[...s,stroke]); setRedo([]);
      const mv=(ev)=>{ pts=[...pts,P(ev).join(",")]; setStrokes(s=>{ const n=s.slice(); n[n.length-1]={...stroke,pts}; return n; }); };
      const up=()=>{ window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
      window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
    } else if (tool==="eraser") {
      const [x,y]=P(e);
      setStrokes(s=>s.filter(st=>!st.pts.some(p=>{ const[a,b]=p.split(",").map(Number); return Math.hypot(a-x,b-y)<20; })));
    } else if (tool==="text" || tool==="sticky") {
      const [x,y]=P(e); addW(tool, x, y);
    } else { setSel(null); setBgOpen(false); setLibOpen(false); }
  };
  const onDrop=(e)=>{ e.preventDefault(); const t=e.dataTransfer.getData("text/widget"); if(t){ const rect=ref.current.getBoundingClientRect(); addW(t, e.clientX-rect.left, e.clientY-rect.top); } };

  const Chrome = ({ children, onClick, active }) => (
    <button onClick={onClick} style={{ width:48, height:48, borderRadius:14, background:active?"var(--purple-accent)":"#fff", color:active?"#fff":"var(--ink-soft)",
      display:"grid", placeItems:"center", boxShadow:"0 2px 10px rgba(16,23,41,.14)", border:"1px solid rgba(16,23,41,.05)" }}>{children}</button>
  );

  /* markup tool button */
  const MTool = ({ t, icon, title }) => (
    <button title={title} onClick={()=>{ setTool(t); setSel(null); }} style={{ width:42, height:42, borderRadius:11, display:"grid", placeItems:"center",
      background: tool===t ? "var(--purple-accent)" : "transparent", color: tool===t ? "#fff" : "var(--ink-soft)" }}><GIcon name={icon} s={20} /></button>
  );
  const COLORS = ["#101729","#2e6be6","#e84e93","#1fa85a","#f2802b","#7c5cf6"];

  return (
    <div ref={ref} onMouseDown={boardDown} onDragOver={e=>e.preventDefault()} onDrop={onDrop}
      style={{ position:"fixed", inset:0, overflow:"hidden", background:bgCss(bg),
        backgroundImage: bg==="dots" ? "radial-gradient(circle,#d3d8e0 1.4px,transparent 1.4px)" : undefined, backgroundSize: bg==="dots"?"24px 24px":undefined,
        cursor: tool==="pen"||tool==="highlighter" ? "crosshair" : tool==="eraser" ? "cell" : tool==="text"||tool==="sticky" ? "copy" : "default", fontFamily:"var(--font)" }}>

      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}>
        {strokes.map((s,i)=><polyline key={i} points={s.pts.join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeOpacity={s.op} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>

      {widgets.map(w=><Placed key={w.id} w={w} sel={w.id===sel} tool={tool} onSel={setSel} onDrag={onDrag} onDel={onDel} />)}

      {/* top chrome */}
      <div style={{ position:"absolute", top:18, left:18 }} onMouseDown={e=>e.stopPropagation()}><Chrome><HomeIcon/></Chrome></div>
      <div style={{ position:"absolute", top:18, right:18, display:"flex", gap:10 }} onMouseDown={e=>e.stopPropagation()}>
        <Chrome>{I.expand({ s:20 })}</Chrome><Chrome>{I.moreV({ s:20 })}</Chrome>
      </div>

      {/* ── markup tools panel (docks left/right) ── */}
      <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", [side]:18, display:"flex", flexDirection:"column", alignItems:"center", gap:4,
        background:"#fff", borderRadius:18, padding:"10px 8px", boxShadow:"0 10px 40px rgba(16,23,41,.18)" }} onMouseDown={e=>e.stopPropagation()}>
        <button title={"Move panel "+(side==="left"?"right":"left")} onClick={()=>setSide(s=>s==="left"?"right":"left")} style={{ width:42, height:34, borderRadius:10, display:"grid", placeItems:"center", color:"var(--ink-faint)" }}>{side==="left"?I.arrowR({ s:18 }):I.arrowL({ s:18 })}</button>
        <div style={{ width:30, height:1, background:"var(--line)", margin:"2px 0" }} />
        <MTool t="select" icon="CURSOR" title="Select / move" />
        <MTool t="pen" icon="marker" title="Pen" />
        <MTool t="highlighter" icon="HIGHLIGHT" title="Highlighter" />
        <MTool t="eraser" icon="eraser" title="Eraser" />
        <MTool t="text" icon="AA" title="Text" />
        <MTool t="sticky" icon="note" title="Sticky note" />
        <div style={{ width:30, height:1, background:"var(--line)", margin:"2px 0" }} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, padding:"2px 0" }}>
          {COLORS.map(c=><button key={c} onClick={()=>setColor(c)} style={{ width:18, height:18, borderRadius:"50%", background:c, border:"2px solid #fff", boxShadow: color===c?"0 0 0 2px var(--purple-accent)":"0 0 0 1px rgba(16,23,41,.15)" }} />)}
        </div>
        <div style={{ width:30, height:1, background:"var(--line)", margin:"2px 0" }} />
        <button title="Undo" onClick={undo} style={{ width:42, height:36, borderRadius:10, display:"grid", placeItems:"center", color:"var(--ink-soft)" }}>{I.undo({ s:18 })}</button>
        <button title="Redo" onClick={redoFn} style={{ width:42, height:36, borderRadius:10, display:"grid", placeItems:"center", color:"var(--ink-soft)" }}>{I.redo({ s:18 })}</button>
        <button title="Clear all" onClick={clearAll} style={{ width:42, height:36, borderRadius:10, display:"grid", placeItems:"center", color:"var(--ink-faint)" }}>{I.trash({ s:18 })}</button>
      </div>

      {/* ── favorites bar (bottom) ── */}
      <div style={{ position:"absolute", left:"50%", bottom:24, transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:6,
        background:"#fff", borderRadius:18, padding:"10px 12px", boxShadow:"0 10px 40px rgba(16,23,41,.18)", maxWidth:"calc(100vw - 220px)" }} onMouseDown={e=>e.stopPropagation()}>
        <button onClick={()=>{ setBgOpen(o=>!o); setLibOpen(false); }} title="Background" style={{ width:44, height:44, borderRadius:12, display:"grid", placeItems:"center", color:"var(--ink-soft)", background:bgOpen?"#eef0f4":"transparent" }}>{I.image({ s:21 })}</button>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"0 8px 0 4px", color:"#f6b51e" }}>{I.star({ s:16 })}<span style={{ fontSize:11.5, fontWeight:800, color:"var(--ink-mute)" }}>Favorites</span></span>
        <span style={{ width:1, height:30, background:"var(--line)" }} />
        {FAVORITES.map(([type,label,icon])=>(
          <button key={type} onClick={()=>addW(type)} title={label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"6px 9px", borderRadius:11, color:"var(--ink-soft)", minWidth:54 }}>
            <GIcon name={icon} s={20} /><span style={{ fontSize:10.5, fontWeight:700 }}>{label}</span>
          </button>
        ))}
        <span style={{ width:1, height:30, background:"var(--line)" }} />
        <button onClick={()=>{ setLibOpen(o=>!o); setBgOpen(false); }} style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"11px 16px", borderRadius:13, background:"var(--purple-accent)", color:"#fff", fontSize:14, fontWeight:700 }}>{I.grid({ s:17 })} Library</button>
      </div>

      {/* background picker */}
      {bgOpen && (
        <div style={{ position:"absolute", left:"50%", bottom:104, transform:"translateX(-50%)", background:"#fff", borderRadius:18, padding:16, boxShadow:"var(--shadow-pop)", width:"min(540px,92vw)" }} onMouseDown={e=>e.stopPropagation()}>
          <div style={{ fontSize:14, fontWeight:800, marginBottom:12 }}>Board background</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
            {BGS.map(([k,label,css])=>(
              <button key={k} onClick={()=>{ setBg(k); setBgOpen(false); }} style={{ textAlign:"center" }}>
                <div style={{ height:44, borderRadius:11, background:css, backgroundImage:k==="dots"?"radial-gradient(circle,#cfd5de 1.4px,transparent 1.4px)":undefined, backgroundSize:k==="dots"?"10px 10px":undefined, border: bg===k?"2.5px solid var(--blue-accent)":"1px solid rgba(16,23,41,.08)", marginBottom:5 }} />
                <span style={{ fontSize:11.5, fontWeight:700, color:"var(--ink-soft)" }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* widget library popup */}
      {libOpen && (
        <div style={{ position:"absolute", left:"50%", bottom:104, transform:"translateX(-50%)", background:"#fff", borderRadius:20, padding:20, boxShadow:"var(--shadow-pop)", width:"min(680px,94vw)", maxHeight:"70vh", overflow:"auto" }} onMouseDown={e=>e.stopPropagation()}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:14 }}>
            <span style={{ fontSize:18, fontWeight:800 }}>Widget Library</span>
            <div style={{ marginLeft:16, flex:1, display:"flex", alignItems:"center", gap:9, padding:"9px 13px", borderRadius:11, border:"1px solid var(--line)", color:"var(--ink-faint)" }}>{I.search({ s:16 })}<span style={{ fontSize:13.5, fontWeight:500 }}>Search widgets</span></div>
            <button onClick={()=>setLibOpen(false)} style={{ marginLeft:12, color:"var(--chrome)" }}>{I.x({ s:20 })}</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
            {LIBALL.map(([spec,label,icon])=>{
              const fav = FAVORITES.some(f=>f[0]===spec);
              return (
                <button key={spec} onClick={()=>addW(spec)} style={{ position:"relative", border:"1px solid var(--line)", borderRadius:14, padding:"16px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, boxShadow:"var(--shadow-inner)" }}>
                  <span style={{ position:"absolute", top:8, right:8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill={fav?"#f6b51e":"none"} stroke={fav?"#f6b51e":"#c4c9d2"} strokeWidth="2" strokeLinejoin="round"><path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z"/></svg></span>
                  <span style={{ width:42, height:42, borderRadius:11, background:"#eef0f4", color:"var(--ink-soft)", display:"grid", placeItems:"center" }}><GIcon name={icon} s={20} /></span>
                  <span style={{ fontSize:12, fontWeight:700, textAlign:"center", lineHeight:1.2 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* page nav */}
      <div style={{ position:"absolute", right:24, bottom:30, display:"flex", alignItems:"center", gap:6, background:"#fff", borderRadius:14, padding:6, boxShadow:"0 2px 10px rgba(16,23,41,.14)" }} onMouseDown={e=>e.stopPropagation()}>
        <button onClick={()=>setPage(p=>Math.max(1,p-1))} style={{ width:34, height:34, borderRadius:9, display:"grid", placeItems:"center", color:"var(--ink-soft)" }}>{I.chevL({ s:18 })}</button>
        <span style={{ minWidth:34, height:34, borderRadius:9, background:"#eef0f4", display:"grid", placeItems:"center", fontSize:14, fontWeight:800 }}>{page}</span>
        <button onClick={()=>setPage(p=>Math.min(12,p+1))} style={{ width:34, height:34, borderRadius:9, display:"grid", placeItems:"center", color:"var(--ink-soft)" }}>{I.chevR({ s:18 })}</button>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<BoardFull />);
