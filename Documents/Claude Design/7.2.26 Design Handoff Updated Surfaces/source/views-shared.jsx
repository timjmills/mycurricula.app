/* Shared atoms for the three view directions. Exposes window.VS. */
const { useState:_uS, useEffect:_uE, useRef:_uR } = React;

const subj = (id) => window.DS.SUBJECTS[id];
const cv   = (token) => `var(${token})`;                 // '--subj-1' → 'var(--subj-1)'

const STATUS = {
  done:     { label:'Done',     dot:'var(--done)',     ink:'var(--done)'    },
  now:      { label:'Now',      dot:'var(--brand-500)',ink:'var(--brand-600)'},
  upcoming: { label:'Up next',  dot:'var(--honey-500)',ink:'var(--honey-600)'},
  idle:     { label:'Planned',  dot:'var(--idle)',     ink:'var(--muted)'   },
};

/* rounded subject tile with the subject's initial */
function SubjGlyph({ id, size=34, radius=11 }){
  const s = subj(id);
  return (
    <span className="subjglyph" style={{
      width:size, height:size, borderRadius:radius,
      '--sc':cv(s.c), '--si':cv(s.ink),
      background:`color-mix(in oklab, ${cv(s.c)} 90%, white)`,
      color:'#fff', fontSize:size*0.42 }}>
      {s.label[0]}
    </span>
  );
}

/* small progress ring 0..1 */
function Ring({ value, size=22, stroke=3, color='var(--done)' }){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-value);
  return (
    <svg width={size} height={size} className="ring-svg">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
}

function StatusDot({ status }){
  const m = STATUS[status] || STATUS.idle;
  return <span className="sdot" style={{ background:m.dot }} title={m.label} />;
}

/* live clock state shared by views */
function useNow(){
  const [now,setNow]=_uS(new Date());
  _uE(()=>{ const id=setInterval(()=>setNow(new Date()),1000*20); return ()=>clearInterval(id); },[]);
  return now;
}

window.VS = { subj, cv, STATUS, SubjGlyph, Ring, StatusDot, useNow };

/* Week navigator — ◀ Week N ▶, shared offset persisted so all frames agree */
function WeekHeader({ extra }){
  const [off,setOff]=_uS(()=>{ try{ return parseInt(localStorage.getItem('cc_weekoff')||'0',10)||0; }catch(e){ return 0; } });
  const set=(d)=>{ const n=off+d; setOff(n); try{ localStorage.setItem('cc_weekoff',String(n)); }catch(e){} };
  const wk=12+off;
  const mk=(m,d)=>{ const dt=new Date(2026,m-1,d); dt.setDate(dt.getDate()+off*7); return dt; };
  const a=mk(6,14), b=mk(6,18);
  const MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const range = a.getMonth()===b.getMonth() ? `${MO[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${MO[a.getMonth()]} ${a.getDate()}–${MO[b.getMonth()]} ${b.getDate()}`;
  return (
    <div className="vhead">
      <div className="wknav">
        <button className="wkarrow" title="Previous week" onClick={()=>set(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h2>{off===0?'This Week':'Week '+wk}</h2>
        <button className="wkarrow" title="Next week" onClick={()=>set(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <span className="vsub">Week {wk} · {range}{extra?(' · '+extra):''}</span>
    </div>
  );
}
window.VS.WeekHeader = WeekHeader;

/* Day navigator — shared offset hook + ◀ Day ▶ header (same style as week) */
function useDayOffset(){
  const [off,setOff]=_uS(()=>{ try{ return parseInt(localStorage.getItem('cc_dayoff')||'0',10)||0; }catch(e){ return 0; } });
  _uE(()=>{ const h=()=>{ try{ setOff(parseInt(localStorage.getItem('cc_dayoff')||'0',10)||0); }catch(e){} }; window.addEventListener('cc-dayoff',h); return ()=>window.removeEventListener('cc-dayoff',h); },[]);
  const set=(n)=>{ try{ localStorage.setItem('cc_dayoff',String(n)); }catch(e){} setOff(n); window.dispatchEvent(new Event('cc-dayoff')); };
  return [off,set];
}
function DayHeader({ day, off, onShift, extra }){
  return (
    <div className="vhead">
      <div className="wknav">
        <button className="wkarrow" title="Previous day" onClick={()=>onShift(off-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h2>{day.name}</h2>
        <button className="wkarrow" title="Next day" onClick={()=>onShift(off+1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      {extra}
    </div>
  );
}
window.VS.useDayOffset = useDayOffset;
window.VS.DayHeader = DayHeader;

/* inline-editable lesson title (persists to localStorage; stopPropagation so it
   doesn't trigger the cell's click/menu while editing) */
function EditableTitle({ L, className }){
  const ref=_uR(null);
  return (
    <span ref={ref} className={(className||'')+' celledit'} contentEditable suppressContentEditableWarning
      onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()}
      onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }}
      onInput={(e)=>{ const v=e.currentTarget.innerText.trim(); try{ if(v) localStorage.setItem('cc_title_'+L.id,v); }catch(x){} }}
      onBlur={(e)=>{ const v=e.currentTarget.innerText.trim(); try{ if(v) localStorage.setItem('cc_title_'+L.id,v); }catch(x){} }}
      dangerouslySetInnerHTML={{__html:L.title}} />
  );
}
window.VS.EditableTitle = EditableTitle;

/* ---- shared lesson hover card (week views): title, objective, standard, #resources ---- */
function LessonHover({ L, children, className, style, onClick }){
  const [hov,setHov]=_uS(null);
  const ref=_uR(null);
  const show=()=>{ const r=ref.current.getBoundingClientRect(); setHov({x:r.left+r.width/2, y:r.top}); };
  const s=window.DS.SUBJECTS[L.subjectId];
  const nRes=window.DS.resourcesFor(L).length;
  return (
    <div ref={ref} className={className} style={style} onClick={onClick}
         onMouseEnter={show} onMouseLeave={()=>setHov(null)}>
      {children}
      {hov && ReactDOM.createPortal(
        <div className="lhov" style={{left:hov.x, top:hov.y, '--lhc':`var(${s.c})`}}>
          <div className="lhov-h"><span className="lhov-dot" style={{background:`var(${s.c})`}}/>{s.full}<span className="lhov-time">{window.DS.fmt(L.start)}</span></div>
          <div className="lhov-t">{L.title}</div>
          <div className="lhov-o">{L.objective}</div>
          <div className="lhov-m"><span className="lhov-std">{L.std}</span><span className="lhov-res">{nRes} resources</span></div>
        </div>, document.body)}
    </div>
  );
}
window.VS.LessonHover = LessonHover;
