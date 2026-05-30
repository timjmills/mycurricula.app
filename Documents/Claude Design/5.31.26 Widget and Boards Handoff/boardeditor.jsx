// boardeditor.jsx — board editor canvas with editable appearance (global + per-widget)
const { I } = window;
const { BG_OPTS, ACCENT_OPTS, TEXT_OPTS, FONT_OPTS, accentVar, textVal, effective, clean, themeVars, WIDGET_DEFS } = window;

const LS = "be-board-v1";
const uid = () => Math.random().toString(36).slice(2,8);
const BOARD_BASE = { bg:"cloud", accent:"blue", text:"ink", size:1, radius:22, font:"jakarta" };

const INIT = {
  boardTheme: {},
  widgets: [
    { id:uid(), type:"target",     x:40,  y:36,  w:430, ov:{} },
    { id:uid(), type:"timer",      x:498, y:36,  w:300, ov:{} },
    { id:uid(), type:"directions", x:826, y:36,  w:360, ov:{} },
    { id:uid(), type:"exit",       x:40,  y:430, w:390, ov:{} },
    { id:uid(), type:"namepick",   x:458, y:430, w:340, ov:{} },
    { id:uid(), type:"resource",   x:826, y:430, w:300, ov:{}, data:{ title:"Verb Tenses Chart" } },
  ],
};
const RESOURCES = [
  { title:"Verb Tenses Chart", kind:"PDF" }, { title:"Place Value Slides", kind:"Slides" },
  { title:"Reading Passage 4", kind:"PDF" }, { title:"Number Line", kind:"Image" },
  { title:"Vocabulary Cards", kind:"PDF" }, { title:"Lab Safety Video", kind:"Video" },
];

/* ── one placed widget on the canvas ── */
function Placed({ w, sel, board, onSelect, onDrag, onResize, onDup, onDel, present }) {
  const def = WIDGET_DEFS[w.type];
  const eff = effective(def.def, board, w.ov);
  const start = (e) => {
    if (present) return;
    if (e.target.closest(".tw-tools") || e.target.closest(".tw-handle")) return;
    e.stopPropagation();
    onSelect(w.id);
    const sx=e.clientX, sy=e.clientY, ox=w.x, oy=w.y;
    const mv=(ev)=>onDrag(w.id, Math.max(0,ox+ev.clientX-sx), Math.max(0,oy+ev.clientY-sy));
    const up=()=>{ window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };
  const startResize = (e) => {
    e.stopPropagation();
    const sx=e.clientX, ow=w.w;
    const mv=(ev)=>onResize(w.id, Math.min(640, Math.max(230, ow+ev.clientX-sx)));
    const up=()=>{ window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };
  return (
    <div className={"tw-wrap"+(sel&&!present?" sel":"")} style={{ left:w.x, top:w.y, width:w.w, cursor:present?"default":"grab" }} onMouseDown={start}>
      {sel && !present && (
        <div className="tw-tools">
          <button title="Drag" style={{ cursor:"grab" }}>{I.grip({ s:16 })}</button>
          <button title="Duplicate" onClick={()=>onDup(w.id)}>{I.copy({ s:16 })}</button>
          <button title="Delete" onClick={()=>onDel(w.id)} style={{ color:"#d23f54" }}>{I.trash({ s:16 })}</button>
        </div>
      )}
      <div className="tw" style={themeVars(eff)}>{def.render(w.data)}</div>
      {sel && !present && <div className="tw-handle" onMouseDown={startResize} />}
    </div>
  );
}

/* ── appearance controls (shared by per-widget + board panels) ── */
function Row({ label, children }) {
  return <div style={{ marginBottom:18 }}><div style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-soft)", marginBottom:9 }}>{label}</div>{children}</div>;
}
function ThemeControls({ eff, onSet, onReset, resetLabel }) {
  return (
    <div>
      <Row label="Background">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {BG_OPTS.map(([k,name])=>(
            <div key={k} title={name} className={"sw"+(eff.bg===k?" on":"")} onClick={()=>onSet("bg",k)} style={{ background:`var(--${k}-grad)` }} />
          ))}
        </div>
      </Row>
      <Row label="Accent">
        <div style={{ display:"flex", gap:9, flexWrap:"wrap" }}>
          {ACCENT_OPTS.map(k=>(
            <div key={k} className={"dot"+(eff.accent===k?" on":"")} onClick={()=>onSet("accent",k)} style={{ background:accentVar(k) }} />
          ))}
        </div>
      </Row>
      <Row label="Text color">
        <div style={{ display:"flex", gap:9 }}>
          {TEXT_OPTS.map(([k,c,name])=>(
            <div key={k} title={name} className={"dot"+(eff.text===k?" on":"")} onClick={()=>onSet("text",k)} style={{ background:c, boxShadow: k==="white"?"inset 0 0 0 1px #d0d4dc, 0 0 0 1px rgba(16,23,41,.12)":undefined }} />
          ))}
        </div>
      </Row>
      <Row label={`Text size · ${Math.round((eff.size??1)*100)}%`}>
        <input type="range" min="0.8" max="1.4" step="0.05" value={eff.size??1} onChange={e=>onSet("size",parseFloat(e.target.value))} style={{ width:"100%", accentColor:"var(--blue-accent)" }} />
      </Row>
      <Row label={`Corner radius · ${eff.radius??22}px`}>
        <input type="range" min="6" max="30" step="1" value={eff.radius??22} onChange={e=>onSet("radius",parseInt(e.target.value))} style={{ width:"100%", accentColor:"var(--blue-accent)" }} />
      </Row>
      <Row label="Font">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
          {FONT_OPTS.map(([k,label,stack])=>(
            <button key={k} onClick={()=>onSet("font",k)} style={{ padding:"9px 2px", borderRadius:9, fontSize:13, fontWeight:700,
              fontFamily:stack, border:"1.5px solid "+(eff.font===k?"var(--blue-accent)":"var(--line)"),
              color:eff.font===k?"var(--blue-accent)":"var(--ink-soft)", background:eff.font===k?"#eef4fe":"#fff" }}>Aa<div style={{ fontSize:9.5, fontFamily:"var(--font)", marginTop:2 }}>{label}</div></button>
          ))}
        </div>
      </Row>
      {onReset && <button onClick={onReset} style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:13, fontWeight:700, color:"var(--blue-accent)" }}>{I.refresh({ s:14 })} {resetLabel}</button>}
    </div>
  );
}

/* ── add-widget popover ── */
function AddWidgetMenu({ onAdd, onClose }) {
  const items = ["target","timer","directions","exit","namepick"];
  return (
    <div style={{ position:"absolute", top:54, right:0, width:230, background:"#fff", border:"1px solid var(--line)", borderRadius:14, boxShadow:"var(--shadow-pop)", padding:8, zIndex:40 }} onMouseLeave={onClose}>
      {items.map(t=>{
        const d=WIDGET_DEFS[t];
        return (
          <button key={t} onClick={()=>onAdd(t)} style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 11px", borderRadius:10, textAlign:"left" }} onMouseDown={e=>e.stopPropagation()}>
            <span style={{ width:34, height:34, borderRadius:9, background:`var(--${d.def.bg}-chip)`, color:`var(--${d.def.bg==="cloud"?"slate":d.def.bg}-accent)`, display:"grid", placeItems:"center", flex:"none" }}>{I.grid({ s:18 })}</span>
            <span style={{ fontSize:14, fontWeight:700 }}>{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── resource picker modal ── */
function ResourceModal({ onPick, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(16,23,41,.45)", display:"grid", placeItems:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"min(640px,92vw)", background:"#fff", borderRadius:20, boxShadow:"var(--shadow-pop)", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
          <div style={{ fontSize:19, fontWeight:800 }}>Add a resource</div>
          <button onClick={onClose} style={{ marginLeft:"auto", color:"var(--chrome)" }}>{I.x({ s:20 })}</button>
        </div>
        <div style={{ fontSize:13.5, color:"var(--ink-mute)", fontWeight:500, marginBottom:18 }}>Drag a resource onto the board, or click to add. Resources stay separate — the board just references them.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
          {RESOURCES.map((r,i)=>(
            <div key={i} draggable onDragStart={e=>e.dataTransfer.setData("text/resource", r.title)} onClick={()=>onPick(r)}
              style={{ border:"1px solid var(--line)", borderRadius:14, padding:14, cursor:"pointer", boxShadow:"var(--shadow-inner)" }}>
              <div style={{ aspectRatio:"4/3", borderRadius:10, background:"repeating-linear-gradient(135deg,#f4f5f8 0 12px,#eef0f4 12px 24px)", display:"grid", placeItems:"center", color:"#9aa1ad", marginBottom:10 }}>{I.note({ s:28 })}</div>
              <div style={{ fontSize:13.5, fontWeight:800 }}>{r.title}</div>
              <div style={{ fontSize:12, color:"var(--ink-mute)", fontWeight:600 }}>{r.kind}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── top toolbar ── */
function TBtn({ icon, label, onClick, solid }) {
  return <button onClick={onClick} style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 15px", borderRadius:12, fontSize:14, fontWeight:700,
    background: solid?"var(--blue-accent)":"#fff", color: solid?"#fff":"var(--ink-soft)", border: solid?"none":"1px solid var(--line)" }}>{icon}{label}</button>;
}

function Editor() {
  const [st, setSt] = React.useState(()=>{ try{ const s=JSON.parse(localStorage.getItem(LS)); if(s&&s.widgets) return s; }catch(e){} return INIT; });
  const [sel, setSel] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [resOpen, setResOpen] = React.useState(false);
  const [present, setPresent] = React.useState(false);
  const canvasRef = React.useRef(null);
  React.useEffect(()=>{ localStorage.setItem(LS, JSON.stringify(st)); },[st]);

  const widgets = st.widgets, board = st.boardTheme;
  const selW = widgets.find(w=>w.id===sel);
  const setWidgets = (fn) => setSt(s=>({ ...s, widgets: fn(s.widgets) }));

  const onDrag = (id,x,y)=> setWidgets(ws=>ws.map(w=>w.id===id?{...w,x,y}:w));
  const onResize = (id,wd)=> setWidgets(ws=>ws.map(w=>w.id===id?{...w,w:wd}:w));
  const onDup = (id)=> setWidgets(ws=>{ const w=ws.find(x=>x.id===id); const n={...w,id:uid(),x:w.x+28,y:w.y+28,ov:{...w.ov}}; return [...ws,n]; });
  const onDel = (id)=> { setWidgets(ws=>ws.filter(w=>w.id!==id)); setSel(null); };
  const addWidget = (type)=>{ const d=WIDGET_DEFS[type]; const id=uid(); setWidgets(ws=>[...ws,{ id, type, x:120, y:120, w:d.w, ov:{} }]); setSel(id); setAddOpen(false); };
  const addResource = (r, x=160, y=160)=>{ const id=uid(); setWidgets(ws=>[...ws,{ id, type:"resource", x, y, w:300, ov:{}, data:{ title:r.title } }]); setSel(id); setResOpen(false); };

  // per-widget set
  const setOv = (prop,val)=> setWidgets(ws=>ws.map(w=>w.id===sel?{...w,ov:{...w.ov,[prop]:val}}:w));
  const resetOv = ()=> setWidgets(ws=>ws.map(w=>w.id===sel?{...w,ov:{}}:w));
  // board set
  const setBoard = (prop,val)=> setSt(s=>({...s, boardTheme:{...s.boardTheme,[prop]:val}}));
  const clearAllOv = ()=> setWidgets(ws=>ws.map(w=>({...w,ov:{}})));

  const selEff = selW ? effective(WIDGET_DEFS[selW.type].def, board, selW.ov) : null;
  const boardEff = { ...BOARD_BASE, ...clean(board) };

  const onDrop = (e)=>{ e.preventDefault(); const t=e.dataTransfer.getData("text/resource"); if(!t) return; const rect=canvasRef.current.getBoundingClientRect(); addResource({title:t}, e.clientX-rect.left-150, e.clientY-rect.top-30); };

  return (
    <div style={{ border:"1px solid var(--line)", borderRadius:18, overflow:"hidden", background:"#fff", boxShadow:"var(--shadow-card)" }}>
      {/* toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 18px", borderBottom:"1px solid var(--line)", position:"relative" }}>
        <button style={{ color:"var(--ink-soft)" }}>{I.arrowL({ s:20 })}</button>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:17, fontWeight:800, letterSpacing:"-.3px" }}>Monday Math Warm-Up</div>
          <div style={{ display:"flex", gap:6, marginTop:3 }}>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:7, background:"#fde4e7", color:"#d23f54" }}>Math</span>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:7, background:"#fbe3cf", color:"#dd6f24" }}>Day 1</span>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:7, background:"#dce9fc", color:"#2e6be6" }}>8:00 AM</span>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:9, position:"relative" }}>
          <div style={{ position:"relative" }}>
            <TBtn icon={I.plus({ s:17 })} label="Widget" onClick={()=>setAddOpen(o=>!o)} />
            {addOpen && <AddWidgetMenu onAdd={addWidget} onClose={()=>setAddOpen(false)} />}
          </div>
          <TBtn icon={I.image({ s:17 })} label="Resource" onClick={()=>setResOpen(true)} />
          <TBtn icon={I.sun({ s:17 })} label="Board theme" onClick={()=>setSel(null)} />
          <TBtn icon={I.play({ s:15 })} label={present?"Exit":"Present"} onClick={()=>setPresent(p=>!p)} />
          <TBtn icon={I.shareUp({ s:16 })} label="Share" solid />
        </div>
      </div>
      <div style={{ display:"flex" }}>
        {/* canvas */}
        <div ref={canvasRef} className="be-canvas" onMouseDown={()=>setSel(null)} onDragOver={e=>e.preventDefault()} onDrop={onDrop}
          style={{ position:"relative", flex:1, minWidth:0, height:880, overflow:"auto" }}>
          <div style={{ position:"relative", width:1180, height:840, margin:"16px" }}>
            {widgets.map(w=>(
              <Placed key={w.id} w={w} sel={w.id===sel} board={board} present={present}
                onSelect={(id)=>setSel(id)} onDrag={onDrag} onResize={onResize} onDup={onDup} onDel={onDel} />
            ))}
          </div>
        </div>
        {/* right panel */}
        {!present && (
          <div style={{ width:312, flex:"none", borderLeft:"1px solid var(--line)", padding:"20px 20px", overflow:"auto", height:880 }}>
            {selW ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ color:"var(--blue-accent)" }}>{I.sun({ s:18 })}</span>
                  <span style={{ fontSize:16, fontWeight:800 }}>Appearance</span>
                </div>
                <div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:500, marginBottom:18 }}>{WIDGET_DEFS[selW.type].label} · overrides the board theme for this widget.</div>
                <ThemeControls eff={selEff} onSet={setOv} onReset={resetOv} resetLabel="Reset to board theme" />
              </>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ color:"var(--blue-accent)" }}>{I.gear({ s:18 })}</span>
                  <span style={{ fontSize:16, fontWeight:800 }}>Board Theme</span>
                </div>
                <div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:500, marginBottom:18 }}>Applies to every widget, unless a widget has its own override. Select a widget to style just that one.</div>
                <ThemeControls eff={boardEff} onSet={setBoard} onReset={clearAllOv} resetLabel="Clear all per-widget overrides" />
              </>
            )}
          </div>
        )}
      </div>
      {resOpen && <ResourceModal onPick={(r)=>addResource(r)} onClose={()=>setResOpen(false)} />}
    </div>
  );
}

function App() {
  return (
    <div className="page" style={{ maxWidth:1620 }}>
      <div className="page-head"><h1>Board Editor</h1><span className="sub">5.30.26 · place widgets · edit appearance · drop resources</span></div>
      <p className="page-note">Open a board to a canvas. Drag widgets to arrange, drag the corner to resize. Select a widget to restyle just it (background, accent, text color, size, corner radius, font); click <strong>Board theme</strong> to restyle them all at once. Per-widget changes win over the board theme, and everything is saved automatically.</p>
      <Editor />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
