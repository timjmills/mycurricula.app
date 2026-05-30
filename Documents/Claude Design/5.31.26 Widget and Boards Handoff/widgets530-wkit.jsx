// widgets530-wkit.jsx — shared building blocks for the panel widgets
const { I, Chrome, Chip } = window;

/* compact panel-widget header: UPPERCASE label + full chrome row */
function WHead({ label, items }) {
  return (
    <div className="w-head" style={{ marginBottom:16 }}>
      <span className="w-label">{label}</span>
      <Chrome items={items || ["moreH","pin","expand","sun","x"]} dense />
    </div>
  );
}

/* avatar — initial on a soft tint (stand-in for a student photo) */
function hueFor(name){ let h=0; for(const c of (name||"")) h=(h*31+c.charCodeAt(0))%360; return h; }
function Avatar({ name="", hue, s=34 }) {
  const H = hue==null ? hueFor(name) : hue;
  return (
    <span className="av" style={{ width:s, height:s, background:`linear-gradient(160deg,hsl(${H} 65% 88%),hsl(${H} 60% 80%))` }}>
      <span style={{ fontSize:s*0.4, fontWeight:800, color:`hsl(${H} 45% 38%)` }}>{(name[0]||"?").toUpperCase()}</span>
    </span>
  );
}

/* emoji face from basic shapes */
function Face({ mood, hue, s=30 }) {
  const ink = `hsl(${hue} 55% 38%)`;
  return (
    <span style={{ width:s, height:s, borderRadius:"50%", background:`hsl(${hue} 72% 88%)`, display:"grid", placeItems:"center", flex:"none" }}>
      <svg width={s*0.62} height={s*0.62} viewBox="0 0 24 24">
        <circle cx="8.5" cy="9.5" r="1.6" fill={ink}/><circle cx="15.5" cy="9.5" r="1.6" fill={ink}/>
        {mood==="happy" && <path d="M7 14a5 5 0 0 0 10 0" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round"/>}
        {mood==="meh"   && <line x1="8" y1="15" x2="16" y2="15" stroke={ink} strokeWidth="1.9" strokeLinecap="round"/>}
        {mood==="sad"   && <path d="M7 16.5a5 5 0 0 1 10 0" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round"/>}
        {mood==="calm"  && <path d="M7 14a5 5 0 0 0 10 0" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round"/>}
        {mood==="worried" && <path d="M8 16a4 4 0 0 1 8 0" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round"/>}
      </svg>
    </span>
  );
}

/* colored status pill */
const TONE = {
  red:    ["#fde4e7","#d23f54"], pink:["#fce0ec","#e3457f"], amber:["#fbeccb","#b9842a"],
  green:  ["#dcf2e3","#1f9255"], blue:["#dce9fc","#2e6be6"], purple:["#e8e0fb","#7c5cf6"],
  orange: ["#fbe3cf","#dd6f24"], gray:["#eceef2","#6b7280"],
};
function Pill({ tone="gray", children, icon }) {
  const [bg,fg] = TONE[tone] || TONE.gray;
  return <span className="pill" style={{ background:bg, color:fg }}>{icon}{children}</span>;
}

/* numbered step circle */
function StepNum({ n, hue=210, s=30 }) {
  return <span style={{ width:s, height:s, borderRadius:"50%", background:`hsl(${hue} 65% 53%)`, color:"#fff",
    display:"grid", placeItems:"center", fontWeight:800, fontSize:s*0.46, flex:"none" }}>{n}</span>;
}

/* small footer encouragement bar inside a widget */
function FootNote({ tone="blue", icon, children }) {
  const [bg,fg] = TONE[tone] || TONE.blue;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, padding:"12px 15px", borderRadius:13,
      background:bg, color:fg, fontSize:13.5, fontWeight:600, marginTop:14 }}>
      <span style={{ display:"grid", placeItems:"center" }}>{icon || I.star({ s:16 })}</span>
      <span style={{ color:"#46506a" }}>{children}</span>
    </div>
  );
}

Object.assign(window, { WHead, Avatar, Face, Pill, StepNum, FootNote, hueFor, TONE });
