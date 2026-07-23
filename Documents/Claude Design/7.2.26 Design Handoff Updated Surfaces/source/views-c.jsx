/* VERSION C — Color-forward. Photo fades to white; subject color is the hero.
   Day = agenda + big color panel · Week = subject lanes · Year = constellation. */
(function(){
const { useState } = React;
const { SUBJECTS, fmt, PERIODS, SUBJECT_ORDER, ROADMAP } = window.DS;
const { subj, cv, SubjGlyph } = window.VS;

function DayC({ state, open, plan, pick, post }){
  const [dayOff,setDayOff]=window.VS.useDayOffset();
  const day = state.days[Math.max(0,Math.min(state.days.length-1, state.todayIdx+dayOff))];
  const initial = (state.current || state.next || day.lessons[0]);
  const [selId,setSel] = useState(initial.id);
  const sel = day.lessons.find(l=>l.id===selId) || initial;
  const s = subj(sel.subjectId);
  return (
    <div className="viewbody">
      <window.VS.DayHeader day={day} off={dayOff} onShift={setDayOff} extra={<span className="vsub">{day.date} · 2026</span>} />
      <div className="vc-day">
        <div className="vc-agenda">
          {day.lessons.map(L=>{
            const ls = subj(L.subjectId);
            return (
              <div key={L.id} className={'vc-aitem'+(L.id===selId?' sel':'')} onClick={()=>setSel(L.id)}>
                <span className="at">{fmt(L.start).replace(' ','')}</span>
                <span className="ad" style={{background: cv(ls.c)}}/>
                <div style={{minWidth:0}}>
                  <div className="an">{L.title}</div>
                  <div className="au" style={{color: cv(ls.ink)}}>{ls.full}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="vc-detail" style={{background:`linear-gradient(150deg, ${cv(s.c)}, color-mix(in oklab, ${cv(s.c)} 70%, #1c1b2e))`}}>
          <div className="dc-top">
            <div className="dlab">{s.full} · {fmt(sel.start)}–{fmt(sel.end)}</div>
            <h3>{sel.title}</h3>
            <div className="dun">{sel.unit}</div>
          </div>
          <div className="dc-target">
            <span className="dc-tl">Learning target</span>
            <div className="dobj">{sel.objective}</div>
          </div>
          <div className="dc-flow">
            {['Warm-up','Mini-lesson','Guided practice','Exit ticket'].map((st,i)=>(
              <span key={st} className="dc-step"><b>{i+1}</b>{st}</span>
            ))}
          </div>
          <div className="dfoot">
            <span className="dchip">{sel.std}</span>
            <span className="dchip">{sel.room}</span>
            <span className="dchip">{sel.status==='now'?'In progress':sel.status==='done'?'Complete':'Planned'}</span>
            <button className="vb-btn" style={{marginLeft:'auto'}} onClick={()=>plan&&plan(sel)}>Plan</button>
            <button className="vb-btn" onClick={()=>post&&post(sel)}>Post</button>
            <button className="vb-btn pri" onClick={()=>open(sel)}>Open in Teach</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekC({ state, open, pick, plan }){
  return (
    <div className="viewbody">
      <window.VS.WeekHeader extra="by subject" />
      <div style={{overflowX:'auto',paddingBottom:6}}>
        <div className="vc-week">
          <div/>
          {state.days.map((d,i)=>(
            <div key={d.key} className={'vc-wh'+(i===state.todayIdx?' today':'')}>{d.short}<span className="wt">{d.date.split(' ')[1]}</span></div>
          ))}
          {SUBJECT_ORDER.map(sid=>{
            const s = subj(sid);
            return (
              <React.Fragment key={sid}>
                <div className="vc-llabel"><SubjGlyph id={sid} size={26} radius={8}/><span className="nm">{s.label}</span></div>
                {state.days.map(d=>{
                  const L = d.lessons.find(l=>l.subjectId===sid);
                  if(!L) return (
                    <div key={d.key} className="vc-wcell empty">
                      <span className="vc-nolesson">No lesson</span>
                      <button className="vc-add" title={'Add a '+s.full+' lesson for '+d.name}
                        onClick={(e)=>{ e.stopPropagation(); plan && plan({
                          id:'new-'+sid+'-'+d.key, subjectId:sid,
                          unit:window.DS.POOL[sid].unit, std:window.DS.POOL[sid].std,
                          title:'New '+s.label+' lesson', objective:'',
                          start:'08:00', end:'08:45', room:'Rm 5A', status:'upcoming' }); }}>+</button>
                    </div>
                  );
                  return (
                    <window.VS.LessonHover key={d.key} L={L} className={'vc-wcell '+L.status}
                         onClick={(e)=>pick(L,e)}
                         style={{'--cellc': cv(s.c)}}>
                      <window.VS.EditableTitle L={L} className="ct" />
                      <span className="cm">{fmt(L.start).replace(' ','')}</span>
                    </window.VS.LessonHover>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function YearC({ unit }){
  return (
    <div className="viewbody">
      <div className="vhead vhead-subonly"><span className="vsub">2025–2026 · units by subject</span></div>
      <div className="vc-year">
        {SUBJECT_ORDER.map(sid=>{
          const s = subj(sid); const units = ROADMAP[sid];
          const pct = Math.round(units.reduce((a,u)=>a+u[1],0)/units.length*100);
          return (
            <div key={sid} className="vc-cluster" style={{'--clc':cv(s.c)}}>
              <div className="vc-clhead"><SubjGlyph id={sid} size={32} radius={10}/><span className="nm">{s.full}</span><span className="pc">{pct}%</span></div>
              <div className="vc-nodes">
                {units.map((u,i)=>{
                  const full=u[1]===1, partial=u[1]>0&&u[1]<1;
                  const bg = full?cv(s.c):partial?`color-mix(in oklab, ${cv(s.c)} 30%, white)`:`color-mix(in oklab, ${cv(s.c)} 15%, white)`;
                  return (
                    <React.Fragment key={i}>
                      {i>0 && <span className="vc-link"/>}
                      <window.UE.Chip sid={sid} uname={u[0]} progress={u[1]} onOpen={unit} className="vc-node" style={{cursor:'pointer'}}>
                        <div className="vc-disc" style={{ background:bg, border: partial?`2px solid ${cv(s.c)}`:(full?'none':`1.5px solid color-mix(in oklab, ${cv(s.c)} 42%, white)`),
                              boxShadow: full?`0 6px 16px -6px ${cv(s.c)}`:'none' }}>
                          {full && <span style={{color:'#fff',fontWeight:800,fontSize:14}}>✓</span>}
                          {partial && <span style={{color:cv(s.ink),fontWeight:800,fontSize:12}}>{Math.round(u[1]*100)}</span>}
                        </div>
                        <span className="nl">{u[0]}</span>
                      </window.UE.Chip>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ViewsC = { Day:DayC, Week:WeekC, Year:YearC };
})();
