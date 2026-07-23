/* VERSION A — Calm Recede. Glass cards float over a blurred, dimmed photo.
   Day = vertical timeline · Week = period×day grid · Year = subject lanes. */
(function(){
const { SUBJECTS, PERIODS, fmt, SUBJECT_ORDER, ROADMAP, MONTHS } = window.DS;
const { subj, cv, SubjGlyph, Ring } = window.VS;
const STAT = { done:'Done', now:'Now', upcoming:'Up next', idle:'Planned' };

function DayA({ state, open, plan, pick, post }){
  const [dayOff,setDayOff]=window.VS.useDayOffset();
  const day = state.days[Math.max(0,Math.min(state.days.length-1, state.todayIdx+dayOff))];
  const [fin,setFin]=React.useState(()=>{ try{ return JSON.parse(localStorage.getItem('cc_finished')||'{}'); }catch(e){ return {}; } });
  const toggleFin=(id)=>setFin(p=>{ const n={...p,[id]:!p[id]}; try{localStorage.setItem('cc_finished',JSON.stringify(n));}catch(e){} return n; });
  const isDone=(L)=>L.status==='done'||fin[L.id];
  const done = day.lessons.filter(isDone).length;
  return (
    <div className="viewbody">
      <window.VS.DayHeader day={day} off={dayOff} onShift={setDayOff} extra={
        <span className="vsub">{day.date} · 2026<br/>{done} of {day.lessons.length} complete</span>
      } />
      <div className="va-day">
        {day.lessons.map(L=>{
          const s = subj(L.subjectId);
          const fdone = isDone(L);
          return (
            <div key={L.id} className={'vcard va-row tappable '+(fdone?'done':L.status)} onClick={(e)=>pick(L,e)}>
              <div className="va-time">{fmt(L.start)}<br/>{fmt(L.end)}</div>
              <SubjGlyph id={L.subjectId} />
              <div className="vbody">
                <div className="t">{L.title}</div>
                <div className="u">{s.full} · {L.unit}</div>
              </div>
              <div className="va-end">
                <button className={'va-finish'+(fdone?' on':'')} onClick={(e)=>{e.stopPropagation();toggleFin(L.id);}}
                  title={fdone?'Mark as not finished':'Mark finished'}>
                  {fdone
                    ? <React.Fragment><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>Done</React.Fragment>
                    : (L.status==='now'
                        ? <React.Fragment><span className="va-fdot now"/>Finish</React.Fragment>
                        : <React.Fragment><span className="va-fdot" style={{background:L.status==='upcoming'?'var(--honey-500)':cv(s.c)}}/>{STAT[L.status]}</React.Fragment>)}
                </button>
                <div className="va-pillsplit">
                  <button onClick={(e)=>{e.stopPropagation();plan&&plan(L);}} title="Open this lesson's planning page">Plan</button>
                  <button onClick={(e)=>{e.stopPropagation();post&&post(L);}} title="Open the resource wall">Post</button>
                  <button onClick={(e)=>{e.stopPropagation();open&&open(L);}} title="Open the teaching board">Teach</button>
                </div>
              </div>
            </div>
          );
        })}
        <DayAddA day={day} plan={plan} />
      </div>
    </div>
  );
}

function DayAddA({ day, plan }){
  const [open,setOpen]=React.useState(false);
  return (
    <div className="va-dayadd-wrap">
      <button className="va-dayadd" onClick={()=>setOpen(o=>!o)} title="Add to this day">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Add to {day.short || day.name}
      </button>
      {open && <div className="va-dayaddmenu" onMouseLeave={()=>setOpen(false)}>
        <button className="add-new" onClick={()=>{ setOpen(false); plan&&plan(day.lessons[0]); }}><span className="add-ic">+</span><span className="add-tx"><b>New lesson</b><span>Create a fresh lesson for this day</span></span></button>
        <button className="add-assign" onClick={()=>{ setOpen(false); plan&&plan(day.lessons[0]); }}><span className="add-ic">↳</span><span className="add-tx"><b>Assign existing lesson</b><span>Pull a previously-made lesson onto this day</span></span></button>
        <button className="add-event" onClick={()=>{ setOpen(false); plan&&plan(day.lessons[0]); }}><span className="add-ic">★</span><span className="add-tx"><b>Non-instructional event</b><span>Assembly, field trip, testing, holiday…</span></span></button>
      </div>}
    </div>
  );
}

function WeekAddA({ d, plan }){
  const [open,setOpen]=React.useState(false);
  return (
    <div className="va-addcell-wrap">
      <button className="va-addcell" title={'Add to '+d.name} onClick={()=>setOpen(o=>!o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      {open && <div className="va-dayaddmenu wk" onMouseLeave={()=>setOpen(false)}>
        <button className="add-new" onClick={()=>{ setOpen(false); plan&&plan(d.lessons[0]); }}><span className="add-ic">+</span><span className="add-tx"><b>New lesson</b><span>Create a fresh lesson for {d.short}</span></span></button>
        <button className="add-assign" onClick={()=>{ setOpen(false); plan&&plan(d.lessons[0]); }}><span className="add-ic">↳</span><span className="add-tx"><b>Assign existing lesson</b><span>Pull a previously-made lesson onto {d.short}</span></span></button>
        <button className="add-event" onClick={()=>{ setOpen(false); plan&&plan(d.lessons[0]); }}><span className="add-ic">★</span><span className="add-tx"><b>Non-instructional event</b><span>Assembly, field trip, testing…</span></span></button>
      </div>}
    </div>
  );
}

function WeekA({ state, open, pick, plan }){
  return (
    <div className="viewbody">
      <window.VS.WeekHeader />
      <div style={{overflowX:'auto',paddingBottom:6}}>
        <div className="va-grid">
          <div/>
          {state.days.map((d,i)=>(
            <div key={d.key} className={'va-gh'+(i===state.todayIdx?' today':'')}>
              <span className="d">{d.short}</span><span className="dt">{d.date.split(' ')[1]}</span>
            </div>
          ))}
          {PERIODS.map((p,pi)=>(
            <React.Fragment key={pi}>
              <div className="va-ph">{fmt(p.start)}</div>
              {state.days.map(d=>{
                const L = d.lessons[pi]; const s = subj(L.subjectId);
                return (
                  <window.VS.LessonHover key={d.key+pi} L={L} className={'va-cell '+L.status} onClick={(e)=>pick(L,e)}
                       style={{ background:`color-mix(in oklab, ${cv(s.c)} 26%, white)`, borderLeftColor:cv(s.c), color:cv(s.ink), '--cellc':cv(s.c) }}>
                    <window.VS.EditableTitle L={L} className="ct" />
                    <span className="cs">{s.label}</span>
                  </window.VS.LessonHover>
                );
              })}
            </React.Fragment>
          ))}
          <div/>
          {state.days.map(d=>(
            <WeekAddA key={d.key+'add'} d={d} plan={plan} />
          ))}
          ))}
        </div>
      </div>
    </div>
  );
}

function YearA({ state, unit }){
  return (
    <div className="viewbody">
      <div className="vhead vhead-subonly"><span className="vsub">2025–2026 · Grade 5</span></div>
      <div style={{overflowX:'auto',paddingBottom:6}}>
        <div className="va-year">
          <div className="va-months">
            <div/>
            <div className="va-monthrow">{MONTHS.map(m=><span key={m}>{m}</span>)}</div>
          </div>
          {SUBJECT_ORDER.map(sid=>{
            const s = subj(sid); const units = ROADMAP[sid]; if(!units||!units.length) return null;
            const pct = Math.round(units.reduce((a,u)=>a+u[1],0)/units.length*100);
            return (
              <div key={sid} className="vcard va-lane">
                <div className="va-laneL">
                  <SubjGlyph id={sid} size={30} radius={9}/>
                  <div style={{minWidth:0}}>
                    <div className="nm">{s.full}</div>
                    <div className="pc">{pct}% complete</div>
                  </div>
                </div>
                <div className="va-track">
                  {units.map((u,i)=>(
                    <window.UE.Chip key={i} sid={sid} uname={u[0]} progress={u[1]} onOpen={unit} className="va-uchip"
                         style={{ background:`color-mix(in oklab, ${cv(s.c)} 16%, white)`, color:cv(s.ink), cursor:'pointer' }}>
                      <span className="fill" style={{ width:(u[1]*100)+'%', background:`color-mix(in oklab, ${cv(s.c)} ${30+u[1]*55}%, white)` }}/>
                      <span className="lab">{u[0]}</span>
                    </window.UE.Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.ViewsA = { Day:DayA, Week:WeekA, Year:YearA };
})();
