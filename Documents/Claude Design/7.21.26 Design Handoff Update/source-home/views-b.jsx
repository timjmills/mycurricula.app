/* VERSION B — Bright Workspace. Photo fades back; a near-white paper workspace.
   Day = focus + agenda rail · Week = day columns · Year = progress list. */
(function(){
const { useState } = React;
const { SUBJECTS, fmt, SUBJECT_ORDER, ROADMAP } = window.DS;
const { subj, cv, SubjGlyph } = window.VS;

function DayB({ state, open, plan, post }){
  const [dayOff,setDayOff]=window.VS.useDayOffset();
  const day = state.days[Math.max(0,Math.min(state.days.length-1, state.todayIdx+dayOff))];
  const initial = (state.current || state.next || day.lessons[0]);
  const [selId, setSel] = useState(initial.id);
  const sel = day.lessons.find(l=>l.id===selId) || initial;
  const s = subj(sel.subjectId);
  return (
    <div className="viewbody">
      <window.VS.DayHeader day={day} off={dayOff} onShift={setDayOff} extra={<span className="vsub">{day.date} · 2026</span>} />
      <div className="vb-day">
        <div className="vb-rail">
          {day.lessons.map(L=>{
            const ls = subj(L.subjectId);
            return (
              <div key={L.id} className={'vb-railitem'+(L.id===selId?' sel':'')} onClick={()=>setSel(L.id)}>
                <span className="rbar" style={{background:cv(ls.c)}}/>
                <div style={{minWidth:0}}>
                  <div className="rt">{ls.label}</div>
                  <div className="rs">{fmt(L.start)} · {L.status==='now'?'Now':L.status==='done'?'Done':'Planned'}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="vb-focus">
          <div className="vb-focusband" style={{background:cv(s.c)}}/>
          <div className="vb-focusin">
            <div className="ey"><SubjGlyph id={sel.subjectId} size={28} radius={9}/><span className="nm" style={{color:cv(s.ink)}}>{s.full}</span></div>
            <h3>{sel.title}</h3>
            <div className="un">{sel.unit}</div>
            <div className="vb-obj" style={{borderColor:cv(s.c)}}>{sel.objective}</div>
            <div className="vb-meta">
              <div className="mi"><span className="mk">Standard</span><span className="mv">{sel.std}</span></div>
              <div className="mi"><span className="mk">Time</span><span className="mv">{fmt(sel.start)}–{fmt(sel.end)}</span></div>
              <div className="mi"><span className="mk">Room</span><span className="mv">{sel.room}</span></div>
              <div className="mi"><span className="mk">Status</span><span className="mv">{sel.status==='now'?'In progress':sel.status==='done'?'Complete':'Planned'}</span></div>
            </div>
            <div className="vb-actions">
              <button className="vb-btn pri" onClick={()=>open(sel)}>Open in Teach</button>
              <button className="vb-btn" onClick={()=>plan&&plan(sel)}>Lesson plan</button>
              <button className="vb-btn" onClick={()=>post&&post(sel)}>Post</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekB({ state, open, pick }){
  return (
    <div className="viewbody">
      <window.VS.WeekHeader />
      <div style={{overflowX:'auto',height:'calc(100% - 56px)'}}>
        <div className="vb-week">
          {state.days.map((d,i)=>(
            <div key={d.key} className="vb-col">
              <div className={'vb-colh'+(i===state.todayIdx?' today':'')}>
                <span className="cd">{d.short}</span><span className="ct">{d.date.split(' ')[1]}</span>
              </div>
              {d.lessons.map(L=>{
                const s = subj(L.subjectId);
                return (
                  <window.VS.LessonHover key={L.id} L={L} className={'vb-mini'+(L.status==='done'?' done':'')} style={{borderLeftColor:cv(s.c)}} onClick={(e)=>pick(L,e)}>
                    <window.VS.EditableTitle L={L} className="mt" />
                    <div className="mm">
                      <span className="sdot" style={{background:cv(s.c)}}/>
                      <span className="nm" style={{color:cv(s.ink)}}>{s.label}</span>
                      <span className="tm">{fmt(L.start)}</span>
                    </div>
                  </window.VS.LessonHover>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function YearB({ unit }){
  return (
    <div className="viewbody">
      <div className="vhead vhead-subonly"><span className="vsub">2025–2026 · Grade 5</span></div>
      <div className="vb-year">
        {SUBJECT_ORDER.map(sid=>{
          const s = subj(sid); const units = ROADMAP[sid]; if(!units||!units.length) return null;
          const pct = Math.round(units.reduce((a,u)=>a+u[1],0)/units.length*100);
          const current = units.find(u=>u[1]>0 && u[1]<1) || units.find(u=>u[1]===0) || units[units.length-1];
          return (
            <div key={sid} className="vb-srow">
              <div className="sl">
                <SubjGlyph id={sid} size={34} radius={11}/>
                <div><div className="nm">{s.full}</div><div className="cu">Now: {current[0]}</div></div>
              </div>
              <div className="vb-prog">
                <div className="vb-track2">
                  {units.map((u,i)=>(
                    <div key={i} className="vb-seg" style={{ flex:1,
                      background: u[1]===1?cv(s.c): u[1]>0?`color-mix(in oklab, ${cv(s.c)} 55%, white)`:'var(--hairline)' }}/>
                  ))}
                </div>
                <div className="units">
                  {units.map((u,i)=><window.UE.Chip key={i} sid={sid} uname={u[0]} progress={u[1]} onOpen={unit} className="vb-upill"
                    style={u[1]>0?{background:`color-mix(in oklab, ${cv(s.c)} ${18+u[1]*22}%, white)`,color:cv(s.ink),cursor:'pointer'}:{cursor:'pointer'}}>{u[0]}</window.UE.Chip>)}
                </div>
              </div>
              <div className="pct">{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ViewsB = { Day:DayB, Week:WeekB, Year:YearB };
})();
