/* Catch-Up — aggregated popup of untaught/overdue lessons + standard gaps,
   filterable by scope, with reschedule/bump/mark-taught + Plan/Post/Teach.
   window.CatchUp({ onClose, onTeach, onPlan, onPost }) */
(function(){
const { useState, useEffect } = React;
const cv=(x)=>`var(${x})`;
const DS=window.DS;

const SCOPES=[['all','Everything'],['day','Today'],['week','This week'],['unit','By unit'],['subject','By subject'],['standards','Standards gaps']];
const I={
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  teach:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>,
  plan:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5"/></svg>,
  post:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h5"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>,
};

function CatchUp({ onClose, onTeach, onPlan, onPost }){
  const [scope,setScope]=useState('all');
  const [data]=useState(()=>DS.catchUp());
  const [done,setDone]=useState({});
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape')onClose(); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[]);

  let lessons=data.lessons.filter(l=>!done[l.id]);
  if(scope==='day') lessons=lessons.filter(l=>l.overdue).slice(0,4);
  else if(scope==='week') lessons=lessons.filter(l=>l.overdue).slice(0,8);
  const showStd = scope==='all'||scope==='standards';
  const showLessons = scope!=='standards';

  // group by subject (and unit when scope=unit)
  const groups={};
  lessons.forEach(l=>{ const key=scope==='unit'?(DS.SUBJECTS[l.subjectId].label+' · '+l.unit):DS.SUBJECTS[l.subjectId].full; (groups[key]=groups[key]||{sid:l.subjectId,items:[]}).items.push(l); });

  const total=data.lessons.filter(l=>!done[l.id]).length;

  return (
    <div className="cu-scrim" onClick={onClose}>
      <div className="cu-modal" onClick={e=>e.stopPropagation()}>
        <div className="cu-head">
          <div className="cu-htitle"><span className="cu-badge">{total}</span>Catch-Up<span className="cu-hsub">lessons & standards behind schedule</span></div>
          <button className="cu-x" onClick={onClose}>{I.x}</button>
        </div>
        <div className="cu-scopes">
          {SCOPES.map(([k,l])=><button key={k} className={'cu-scope'+(scope===k?' on':'')} onClick={()=>setScope(k)}>{l}</button>)}
        </div>
        <div className="cu-body">
          {showLessons && Object.keys(groups).map(g=>{
            const grp=groups[g], s=DS.SUBJECTS[grp.sid];
            return (
              <div key={g} className="cu-group">
                <div className="cu-ghead"><span className="cu-gdot" style={{background:cv(s.c)}}/>{g}<span className="cu-gn">{grp.items.length}</span></div>
                {grp.items.map(l=>(
                  <div key={l.id} className="cu-row" style={{borderLeftColor:cv(s.c)}}>
                    <span className="cu-rtext"><span className="cu-rtitle">{l.title}</span><span className="cu-rsub">{l.unit} · {l.std} {l.overdue?'· overdue':'· not yet taught'}</span></span>
                    <span className="cu-acts">
                      <button className="cu-resched" title="Reschedule">Reschedule</button>
                      <button className="cu-bump" title="Bump to next open slot (cascade after)">Bump</button>
                      <button title="Mark taught" onClick={()=>setDone(d=>({...d,[l.id]:1}))}>{I.check}</button>
                      <button title="Plan" onClick={()=>{onPlan&&onPlan(l);onClose();}}>{I.plan}</button>
                      <button title="Post" onClick={()=>{onPost&&onPost(l);onClose();}}>{I.post}</button>
                      <button title="Teach" onClick={()=>{onTeach&&onTeach(l);onClose();}}>{I.teach}</button>
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          {showStd && <div className="cu-group">
            <div className="cu-ghead">Standards not yet covered<span className="cu-gn">{data.gaps.length}</span></div>
            {data.gaps.map((g,i)=>{ const s=DS.SUBJECTS[g.subjectId]; return (
              <div key={i} className="cu-stdrow"><span className="cu-stdcode">{g.code}</span><span className="cu-stdtext"><b style={{color:cv(s.c)}}>{s.label}</b> · {g.desc} <span className="cu-stdunit">({g.unit})</span></span></div>
            ); })}
          </div>}
          {showLessons && !Object.keys(groups).length && <div className="cu-empty">{I.check} All caught up for this scope 🎉</div>}
        </div>
      </div>
    </div>
  );
}

window.CatchUp = CatchUp;
})();
