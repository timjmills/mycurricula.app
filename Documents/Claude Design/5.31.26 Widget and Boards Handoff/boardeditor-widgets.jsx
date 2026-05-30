// boardeditor-widgets.jsx — theme model + themeable widget content
const { I } = window;

/* ── appearance option sets (curated families + neutrals) ── */
const BG_OPTS = [
  ["yellow","Sunshine"],["green","Mint"],["pink","Blossom"],["purple","Lilac"],
  ["orange","Apricot"],["blue","Sky"],["slate","Slate"],["cloud","White"],["dark","Night"],
];
const ACCENT_OPTS = ["blue","green","purple","orange","pink","yellow","slate","ink"];
const TEXT_OPTS = [["ink","#101729","Dark"],["slate","#5b6478","Slate"],["white","#ffffff","White"]];
const FONT_OPTS = [
  ["jakarta","Sans",'"Plus Jakarta Sans", system-ui, sans-serif'],
  ["rounded","Rounded",'"Quicksand", system-ui, sans-serif'],
  ["serif","Serif",'Georgia, "Times New Roman", serif'],
  ["hand","Marker",'"Caveat", cursive'],
  ["mono","Mono",'ui-monospace, Menlo, monospace'],
];
const accentVar = (k) => k==="ink" ? "var(--ink-accent)" : `var(--${k}-accent)`;
const textVal = (k) => (TEXT_OPTS.find(t=>t[0]===k)||TEXT_OPTS[0])[1];
const fontStack = (k) => (FONT_OPTS.find(f=>f[0]===k)||FONT_OPTS[0])[2];

/* merge default → board theme → widget override */
function effective(def, board, ov) {
  const e = { ...def, ...clean(board), ...clean(ov) };
  if (!('text' in clean(ov)) && !('text' in clean(board))) e.text = def.bg==="dark" ? "white" : (def.text||"ink");
  if (e.bg==="dark" && !( 'text' in clean(ov)) && !('text' in clean(board))) e.text = "white";
  return e;
}
function clean(o){ const r={}; if(o) for(const k in o) if(o[k]!=null) r[k]=o[k]; return r; }

function themeVars(e) {
  return {
    "--w-grad": `var(--${e.bg}-grad)`,
    "--w-soft": `var(--${e.bg}-soft)`,
    "--w-chip": `var(--${e.bg}-chip)`,
    "--w-line": `var(--${e.bg}-line)`,
    "--w-card": e.bg==="dark" ? "var(--dark-soft)" : "#fff",
    "--w-accent": accentVar(e.accent),
    "--w-ink": textVal(e.text),
    "--w-radius": (e.radius ?? 22) + "px",
    "--w-font": fontStack(e.font || "jakarta"),
    "--w-scale": e.size ?? 1,
  };
}

/* ── widget definitions: default theme + label + content ── */
function Hd({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", marginBottom:"1em" }}>
      <span className="twlabel">{label}</span>
      <span className="twchrome">{I.pin({ s:15 })}{I.sun({ s:15 })}{I.moreV({ s:15 })}{I.x({ s:15 })}</span>
    </div>
  );
}
const A = "var(--w-accent)";

const WIDGET_DEFS = {
  target: { label:"Learning Target", def:{ bg:"yellow", accent:"purple", size:1, radius:22, font:"jakarta" }, w:420,
    render: () => (
      <div>
        <Hd label="Learning Target" />
        <div style={{ display:"flex", gap:"0.9em", alignItems:"flex-start" }}>
          <span className="twchip" style={{ width:"3.4em", height:"3.4em", borderRadius:"1em" }}>{I.target({ s:26 })}</span>
          <div style={{ fontSize:"1.4em", fontWeight:800, lineHeight:1.25 }}>I can explain how a character's actions affect the plot.</div>
        </div>
        <div style={{ borderTop:"1.5px dashed var(--w-line)", margin:"1em 0 0.8em" }} />
        <div style={{ fontSize:"0.95em", fontWeight:800, marginBottom:"0.6em" }}>Success Criteria:</div>
        {["Identify a character's important actions.","Explain how those actions change the plot."].map((c,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:"0.7em", marginBottom:"0.5em" }}>
            <span style={{ width:"1.5em", height:"1.5em", borderRadius:"50%", background:A, color:"#fff", display:"grid", placeItems:"center", flex:"none" }}>{I.check({ s:13 })}</span>
            <span style={{ fontSize:"0.95em", fontWeight:600, opacity:.85 }}>{c}</span>
          </div>
        ))}
      </div>
    )},
  timer: { label:"Timer", def:{ bg:"pink", accent:"pink", size:1, radius:22, font:"jakarta" }, w:300,
    render: () => (
      <div>
        <Hd label="Timer" />
        <div className="twcard" style={{ padding:"1.1em", textAlign:"center", marginBottom:"0.9em" }}>
          <div style={{ fontSize:"3.4em", fontWeight:800, letterSpacing:"-0.04em", lineHeight:1, color:A }}>10:00</div>
          <div style={{ fontSize:"0.85em", fontWeight:700, opacity:.6, marginTop:"0.4em" }}>Time Remaining</div>
        </div>
        <button className="twbtn" style={{ width:"100%" }}>{I.play({ s:16 })} Start</button>
      </div>
    )},
  directions: { label:"Directions", def:{ bg:"green", accent:"green", size:1, radius:22, font:"jakarta" }, w:360,
    render: () => (
      <div>
        <Hd label="Directions" />
        {["Read the passage carefully.","Turn and Talk with your partner.","Write your answer in your journal."].map((t,i)=>(
          <div key={i} className="twcard" style={{ display:"flex", alignItems:"center", gap:"0.8em", padding:"0.8em 0.9em", marginBottom:"0.55em" }}>
            <span style={{ width:"1.9em", height:"1.9em", borderRadius:"50%", background:A, color:"#fff", display:"grid", placeItems:"center", fontWeight:800, fontSize:"0.95em", flex:"none" }}>{i+1}</span>
            <span style={{ fontSize:"0.95em", fontWeight:700 }}>{t}</span>
          </div>
        ))}
      </div>
    )},
  exit: { label:"Exit Ticket", def:{ bg:"purple", accent:"purple", size:1, radius:22, font:"jakarta" }, w:380,
    render: () => (
      <div>
        <Hd label="Exit Ticket" />
        <div style={{ fontSize:"1.2em", fontWeight:800, lineHeight:1.25, marginBottom:"0.8em" }}>What is one thing you learned today?</div>
        {["I learned something new.","I'm still confused about something."].map((t,i)=>(
          <div key={i} className="twcard" style={{ display:"flex", alignItems:"center", gap:"0.7em", padding:"0.8em 0.9em", marginBottom:"0.5em" }}>
            <span style={{ width:"1.7em", height:"1.7em", borderRadius:"50%", background:"var(--w-soft)", color:A, display:"grid", placeItems:"center", flex:"none" }}>{i===0?I.bulb({ s:15 }):I.msg({ s:15 })}</span>
            <span style={{ fontSize:"0.93em", fontWeight:600, opacity:.9 }}>{t}</span>
          </div>
        ))}
        <button className="twbtn" style={{ width:"100%", marginTop:"0.3em" }}>{I.check({ s:16 })} Submit</button>
      </div>
    )},
  namepick: { label:"Name Picker", def:{ bg:"orange", accent:"orange", size:1, radius:22, font:"jakarta" }, w:340,
    render: () => (
      <div>
        <Hd label="Name Picker" />
        <div style={{ border:"2px dashed var(--w-line)", borderRadius:"1em", background:"var(--w-soft)", padding:"1.6em 1em", textAlign:"center", marginBottom:"0.9em" }}>
          <div style={{ color:A, display:"flex", justifyContent:"center", marginBottom:"0.5em" }}>{I.users({ s:34 })}</div>
          <div style={{ fontSize:"1.05em", fontWeight:800 }}>Ready to pick!</div>
          <div style={{ fontSize:"0.85em", opacity:.6, fontWeight:500 }}>Tap below to choose a student.</div>
        </div>
        <button className="twbtn" style={{ width:"100%" }}>{I.handPt({ s:16 })} Pick a name</button>
      </div>
    )},
  text: { label:"Text", def:{ bg:"cloud", accent:"blue", size:1, radius:22, font:"jakarta" }, w:340,
    render: () => (<div><Hd label="Text" /><div style={{ fontSize:"1.5em", fontWeight:800, lineHeight:1.3, textAlign:"center", padding:"0.4em 0.2em" }}>Type your message here.</div></div>)},
  clock: { label:"Clock", def:{ bg:"blue", accent:"blue", size:1, radius:22, font:"jakarta" }, w:240,
    render: () => (<div><Hd label="Clock" /><div className="twcard" style={{ padding:"1em", textAlign:"center" }}>
      <svg width="84" height="84" viewBox="0 0 64 64" style={{ margin:"0 auto" }}><circle cx="32" cy="32" r="27" fill="none" stroke={A} strokeWidth="3"/><line x1="32" y1="32" x2="32" y2="15" stroke={A} strokeWidth="3" strokeLinecap="round"/><line x1="32" y1="32" x2="44" y2="38" stroke="var(--w-ink)" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="32" r="3" fill={A}/></svg>
      <div style={{ fontSize:"1.6em", fontWeight:800, marginTop:"0.2em" }}>9:00</div></div></div>)},
  poll: { label:"Poll", def:{ bg:"purple", accent:"purple", size:1, radius:22, font:"jakarta" }, w:340,
    render: () => (<div><Hd label="Poll" /><div style={{ fontSize:"1.1em", fontWeight:800, marginBottom:"0.8em" }}>How are we feeling today?</div>
      {[["Great",70],["Okay",30]].map(([l,p],i)=>(<div key={i} style={{ marginBottom:"0.7em" }}>
        <div style={{ display:"flex", fontSize:"0.9em", fontWeight:700, marginBottom:"0.35em" }}><span>{l}</span><span style={{ marginLeft:"auto", opacity:.6 }}>{p}%</span></div>
        <div style={{ height:"0.55em", borderRadius:99, background:"var(--w-soft)" }}><div style={{ width:p+"%", height:"100%", borderRadius:99, background:A }} /></div></div>))}</div>)},
  traffic: { label:"Traffic Light", def:{ bg:"cloud", accent:"green", size:1, radius:22, font:"jakarta" }, w:200,
    render: () => (<div><Hd label="Traffic Light" /><div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.6em", background:"#222a3d", borderRadius:"1em", padding:"1em" }}>
      {[["#e35454",.35],["#e8a91a",.35],["#2fa45f",1]].map(([c,o],i)=>(<span key={i} style={{ width:"2.6em", height:"2.6em", borderRadius:"50%", background:c, opacity:o, boxShadow: o===1?`0 0 16px ${c}`:"none" }} />))}</div></div>)},
  tool: { label:"Tool", def:{ bg:"cloud", accent:"slate", size:1, radius:22, font:"jakarta" }, w:300,
    render: (data) => { const Ic = (window.I[(data&&data.iconKey)||"grid"])||window.I.grid; return (
      <div><Hd label={(data&&data.label)||"Widget"} /><div className="twcard" style={{ display:"flex", alignItems:"center", gap:"0.8em", padding:"0.9em 1em" }}>
        <span className="twchip">{Ic({ s:20 })}</span><div style={{ flex:1 }}><div style={{ height:"0.5em", width:"70%", borderRadius:9, background:"var(--w-line)", marginBottom:"0.5em" }} /><div style={{ height:"0.5em", width:"45%", borderRadius:9, background:"var(--w-line)", opacity:.6 }} /></div></div></div>); }},
  resource: { label:"Resource", def:{ bg:"cloud", accent:"purple", size:1, radius:18, font:"jakarta" }, w:300, resource:true,
    render: (data) => (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.6em", marginBottom:"0.8em" }}>
          <span className="twchip" style={{ width:"2.2em", height:"2.2em", borderRadius:"0.6em" }}>{I.note({ s:16 })}</span>
          <span style={{ fontSize:"1em", fontWeight:800, flex:1, minWidth:0 }}>{(data&&data.title)||"Verb Tenses Chart"}</span>
          <span style={{ opacity:.4 }}>{I.moreH({ s:16 })}</span>
        </div>
        <div style={{ aspectRatio:"4/3", borderRadius:"0.7em", border:"1px solid var(--w-line)",
          background:"repeating-linear-gradient(135deg,#f4f5f8 0 12px,#eef0f4 12px 24px)", display:"grid", placeItems:"center", color:"#9aa1ad" }}>
          <div style={{ textAlign:"center" }}>{I.image({ s:30 })}<div style={{ fontFamily:"ui-monospace,Menlo,monospace", fontSize:"0.7em", marginTop:"0.4em" }}>resource preview</div></div>
        </div>
      </div>
    )},
};

Object.assign(window, { BG_OPTS, ACCENT_OPTS, TEXT_OPTS, FONT_OPTS, accentVar, textVal, fontStack, effective, clean, themeVars, WIDGET_DEFS });
