/* Shared left-rail navigator — lesson + resource browsing by the wall's category
   presets, with search. Used by the Teach view and the full Resource Wall page.
   window.LessonNav({ state, tab, onTab, onPickLesson, onPickResource, onClose }) */
(function(){
const { useState, useMemo } = React;
const cv = (x)=>`var(${x})`;
const SUBJ = window.DS.SUBJECTS;

const PRESETS = [
  { k:'current', label:'This Lesson' },
  { k:'today', label:"Today's Lessons" },
  { k:'weekmix', label:'This Week · Mixed' },
  { k:'weeksub', label:'This Week · Subject' },
  { k:'subject', label:'By Subject' },
  { k:'unit', label:'By Unit' },
];
const RES_PRESETS = PRESETS.concat([{ k:'untagged', label:'Untagged' }]);

const ICON = {
  search:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  chev:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

function lessonsFor(state, preset){
  const days = state.days;
  if(preset==='current'){ const cur=state.current||state.next||state.days[state.todayIdx].lessons[0]; return [{ title:'This lesson', items:[cur] }]; }
  if(preset==='today') return [{ title:state.days[state.todayIdx].name, items:state.days[state.todayIdx].lessons }];
  if(preset==='weekmix'){
    return days.map(d=>({ title:d.short+' · '+d.date, items:d.lessons }));
  }
  if(preset==='weeksub' || preset==='subject'){
    const by={};
    days.forEach(d=>d.lessons.forEach(l=>{ (by[l.subjectId]=by[l.subjectId]||[]).push(l); }));
    return window.DS.SUBJECT_ORDER.filter(s=>by[s]).map(s=>({ title:SUBJ[s].full, sid:s, items:by[s] }));
  }
  if(preset==='unit'){
    const by={};
    days.forEach(d=>d.lessons.forEach(l=>{ (by[l.unit]=by[l.unit]||[]).push(l); }));
    return Object.keys(by).map(u=>({ title:u, items:by[u] }));
  }
  return [{ title:'All', items:days.flatMap(d=>d.lessons) }];
}

function LessonNav({ state, tab='lessons', onTab, onPickLesson, onPickResource, onPlanLesson, onPostLesson, onClose, activeId, activeLesson, version, showForking, onTeach }){
  const [preset,setPreset]=useState('current');
  const [q,setQ]=useState('');
  const [pop,setPop]=useState(false);
  const [planning,setPlanning]=useState(null);   // lesson opened for planning inside the Lessons tab
  const [resView,setResView]=useState('list');
  const presets = tab==='resources' ? RES_PRESETS : PRESETS;
  const presetLabel = (presets.find(p=>p.k===preset)||presets[0]).label;

  const groups = useMemo(()=>{
    let gs = lessonsFor(state, preset);
    if(tab==='resources'){
      if(preset==='untagged') gs=[{ title:'Untagged', items:[{ id:'u1',title:'Field Trip Permission',subjectId:'sel',unit:'',std:'' },{ id:'u2',title:'Class Photo 2026',subjectId:'explorers',unit:'',std:'' },{ id:'u3',title:'Parent Newsletter',subjectId:'writing',unit:'',std:'' }] }];
      gs = gs.map(g=>({ ...g, items:g.items.flatMap(l=> (window.DS.resourcesFor?window.DS.resourcesFor(l):[]).slice(0,2).map(r=>({ ...r, _lesson:l, subjectId:l.subjectId })) ) }));
    }
    if(q.trim()){
      const s=q.toLowerCase();
      gs = gs.map(g=>({ ...g, items:g.items.filter(i=>(i.title||i.label||'').toLowerCase().includes(s)) })).filter(g=>g.items.length);
    }
    return gs;
  },[state,preset,q,tab]);

  return (
    <div className="lnav">
      <div className="lnav-tabs">
        <button className={'lnav-tab'+(tab==='lessons'?' on':'')} onClick={()=>onTab&&onTab('lessons')}>Lessons</button>
        <button className={'lnav-tab'+(tab==='resources'?' on':'')} onClick={()=>onTab&&onTab('resources')}>Resources</button>
        {onClose && <button className="lnav-x" onClick={onClose} title="Close">{ICON.x}</button>}
      </div>
      {tab==='lessons' && planning
        ? <div className="lnav-plan">
            <button className="lnav-back" onClick={()=>setPlanning(null)}>{ICON.chev}<span>All lessons</span></button>
            {window.PlanPage
              ? <window.PlanPage lesson={planning} version={version||'A'} showForking={showForking} onTeach={(l)=>{ if(onTeach)onTeach(l||planning); setPlanning(null); }} embedded/>
              : null}
          </div>
        : <React.Fragment>
      <div className="lnav-controls">
        <div className="lnav-presetwrap">
          <button className="lnav-preset" onClick={()=>setPop(p=>!p)}>{presetLabel}{ICON.chev}</button>
          {pop && <div className="lnav-presetpop">
            {presets.map(p=>(
              <button key={p.k} className={preset===p.k?'on':''} onClick={()=>{ setPreset(p.k); setPop(false); }}>{p.label}</button>
            ))}
          </div>}
        </div>
        <div className="lnav-search">{ICON.search}<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"/></div>
        {tab==='resources' &&
          <div className="lnav-vtog">
            <button className={resView==='list'?'on':''} title="List view" onClick={()=>setResView('list')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
            <button className={resView==='thumb'?'on':''} title="Thumbnail view" onClick={()=>setResView('thumb')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></button>
          </div>}
      </div>
      <div className="lnav-list">
        {groups.map((g,gi)=>(
          <div key={gi} className="lnav-group">
            <div className="lnav-ghead"><span className="lnav-gdot" style={{background: g.sid?cv(SUBJ[g.sid].c):'var(--muted)'}}/>{g.title}<span className="lnav-gn">{g.items.length}</span></div>
            <div className={tab==='resources'&&resView==='thumb'?'lnav-thumbs':''}>
            {g.items.map((it,ii)=>{
              const s=SUBJ[it.subjectId];
              const lname = it._lesson ? it._lesson.title : '';
              if(tab==='resources' && resView==='thumb'){
                return (
                  <button key={ii} className="lnav-thumb" onClick={()=>onPickResource&&onPickResource(it)}>
                    <span className="lnav-thumbart" style={{background:`color-mix(in oklab, ${cv(s.c)} 20%, white)`,color:cv(s.c)}}>{(it.type||'').slice(0,1).toUpperCase()}</span>
                    <span className="lnav-thumbtitle">{it.label||it.title}</span>
                    <span className="lnav-thumbsub">{s.label}{lname?' · '+lname:''}</span>
                  </button>
                );
              }
              return (
                <div key={ii} className="lnav-itemwrap">
                <button className={'lnav-item'+(activeId&&it.id===activeId?' on':'')}
                  onClick={()=>tab==='resources'?(onPickResource&&onPickResource(it)):setPlanning(it)}>
                  <span className="lnav-bar" style={{background:cv(s.c)}}/>
                  <span className="lnav-itext">
                    <span className="lnav-ititle">{it.title||it.label}</span>
                    <span className="lnav-isub">{tab==='resources'?((it.type||'').toUpperCase()+' · '+s.full+(lname?' · '+lname:'')):(s.full+(it.std?' · '+it.std:''))}</span>
                  </span>
                </button>
                {tab!=='resources' && <span className="lnav-rowacts">
                  <button title="Lesson plan" onClick={()=>onPlanLesson&&onPlanLesson(it)}>Plan</button>
                  <button title="Resource wall" onClick={()=>onPostLesson&&onPostLesson(it)}>Wall</button>
                </span>}
                {window.Share && <window.Share.Btn kind={tab==='resources'?'resource':'lesson'} id={it.id} label={it.title||it.label} bare />}
                </div>
              );
            })}
            </div>
          </div>
        ))}
        {!groups.length && <div className="lnav-empty">No matches</div>}
      </div>
      <button className="lnav-add">{ICON.plus}{tab==='resources'?'New resource / note':'New lesson'}</button>
      </React.Fragment>}
    </div>
  );
}

window.LessonNav = LessonNav;
})();
