/* Lesson Library / Scheduler — organize lessons by day · week(mixed) · week(subject)
   · month(calendar) · unit · all. Per-lesson: Done + Plan/Wall/Teach + ⋮ (reschedule,
   bump, stack, delete). Buckets: Not-yet-taught (unscheduled) + Catch-Up (past, not done).
   Subject-sequence numbering. + Add (lesson/unit/subject). Print dialog.
   window.LessonLibrary({ state, onPlan, onPost, onTeach, embedded, onClose }) */
(function(){
const { useState, useMemo, useEffect } = React;
const cv=(x)=>`var(${x})`;
const DS=window.DS;
const DAYMS=86400000;
const iso=(d)=>d.toISOString().slice(0,10);
const fmtD=(s)=> s? new Date(s+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Unscheduled';
const wkOf=(d)=>{ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };

const I={
  done:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>,
  plan:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5"/></svg>,
  wall:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h5"/></svg>,
  teach:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>,
  dots:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  print:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v6H8z"/></svg>,
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  expand:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>,
};

const TITLES=['Introduce & Explore','Model the Strategy','Guided Practice','Apply Independently'];
function genLessons(){
  const out=[]; const base=new Date(); base.setHours(0,0,0,0); base.setDate(base.getDate()-18);
  DS.SUBJECT_ORDER.forEach(sid=>{
    const units=DS.ROADMAP[sid]; let off=DS.SUBJECT_ORDER.indexOf(sid);
    let day=0;
    units.forEach(([uname,prog])=>{
      for(let i=0;i<4;i++){
        const frac=(i+0.5)/4;
        const done = prog>=1 || (prog>0 && frac<=prog);
        day+=2;
        // future units with no progress: leave the last unit's lessons unscheduled
        const unscheduled = prog===0 && Math.random()<0; // deterministic: none random
        let date=null;
        const d=new Date(base.getTime()+(day+off)*DAYMS);
        if((d.getDay()===0)) d.setDate(d.getDate()+1);
        if((d.getDay()===6)) d.setDate(d.getDate()+2);
        if(!(prog===0 && i>=2)) date=iso(d); // leave later lessons of untaught units unscheduled
        out.push({ id:sid+'-'+uname.replace(/\W+/g,'')+'-'+i, subjectId:sid, unit:uname,
          title:TITLES[i]+' · '+uname.split(' ').slice(-1)[0],
          objective:'I can apply the key skill of this lesson.',
          std:(DS.POOL[sid]&&DS.POOL[sid].std||'STD')+'.'+String.fromCharCode(97+(i%4)),
          start:'09:40', end:'10:25', date, done });
      }
    });
  });
  return out;
}

function loadOverrides(){ try{ return JSON.parse(localStorage.getItem('cc_lib')||'{}'); }catch(e){ return {}; } }
function saveOverrides(o){ try{ localStorage.setItem('cc_lib',JSON.stringify(o)); }catch(e){} }

const VIEWS=[['day','Day'],['wmix','Week'],['wsub','By subject'],['month','Month'],['unit','By unit'],['all','All']];
const BUCKETS=[['all','All'],['nottaught','Not taught'],['catchup','Catch-Up'],['done','Done']];

function LessonLibrary({ state, onPlan, onPost, onTeach, embedded, onClose }){
  const [view,setView]=useState('day');
  const [bucket,setBucket]=useState('all');
  const [ov,setOv]=useState(loadOverrides);
  const [menu,setMenu]=useState(null);          // {id,x,y}
  const [resched,setResched]=useState(null);    // lesson being rescheduled
  const [addOpen,setAddOpen]=useState(false);
  const [printOpen,setPrintOpen]=useState(false);
  const [q,setQ]=useState('');
  const dragId=React.useRef(null);

  const all=useMemo(()=>{ const g=genLessons(); return g.map(l=>({...l, ...(ov[l.id]||{})})); },[ov]);
  const today=iso(new Date());

  const statusOf=(l)=> l.done ? 'done' : (!l.date ? 'nottaught' : (l.date<today ? 'catchup' : 'upcoming'));
  const setLesson=(id,patch)=>{ const n={...ov,[id]:{...(ov[id]||{}),...patch}}; setOv(n); saveOverrides(n); };
  const toggleDone=(l)=>setLesson(l.id,{done:!l.done});

  // subject-sequence numbering (by date then order)
  const numbering=useMemo(()=>{
    const by={}; const map={};
    all.forEach(l=>{ (by[l.subjectId]=by[l.subjectId]||[]).push(l); });
    Object.values(by).forEach(arr=>{ arr.sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:1); arr.forEach((l,i)=>map[l.id]=i+1); });
    return map;
  },[all]);

  let lessons = all.filter(l=> bucket==='all' || statusOf(l)===bucket );
  if(q) lessons=lessons.filter(l=>l.title.toLowerCase().includes(q.toLowerCase())||l.unit.toLowerCase().includes(q.toLowerCase()));

  // grouping per view
  const groups=useMemo(()=>{
    const mk=(title,items,sid)=>({title,items,sid});
    if(view==='wsub'){
      const by={}; lessons.forEach(l=>{ (by[l.subjectId]=by[l.subjectId]||[]).push(l); });
      return DS.SUBJECT_ORDER.filter(s=>by[s]).map(s=>mk(DS.SUBJECTS[s].full,by[s].sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:1),s));
    }
    if(view==='unit'){
      const by={}; lessons.forEach(l=>{ const k=l.subjectId+'|'+l.unit; (by[k]=by[k]||[]).push(l); });
      return Object.keys(by).map(k=>{ const [sid]=k.split('|'); return mk(by[k][0].unit,by[k],sid); });
    }
    if(view==='day'){
      const by={}; lessons.forEach(l=>{ const k=l.date||'Unscheduled'; (by[k]=by[k]||[]).push(l); });
      return Object.keys(by).sort().map(k=>mk(k==='Unscheduled'?'Unscheduled':new Date(k+'T00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),by[k]));
    }
    if(view==='wmix'){
      const by={}; lessons.forEach(l=>{ const k=l.date?iso(wkOf(l.date+'T00:00')):'Unscheduled'; (by[k]=by[k]||[]).push(l); });
      return Object.keys(by).sort().map(k=>mk(k==='Unscheduled'?'Unscheduled':('Week of '+new Date(k+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),by[k]));
    }
    return [mk('All lessons',lessons.slice().sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:1))];
  },[view,lessons]);

  const counts={ nottaught:all.filter(l=>statusOf(l)==='nottaught').length, catchup:all.filter(l=>statusOf(l)==='catchup').length, done:all.filter(l=>statusOf(l)==='done').length };

  const Row=({l})=>{
    const s=DS.SUBJECTS[l.subjectId]; const st=statusOf(l);
    return (
      <div className={'ll-row st-'+st} draggable
        onDragStart={(e)=>{ dragId.current=l.id; e.dataTransfer.effectAllowed='move'; }}
        onDragOver={(e)=>e.preventDefault()}
        onDrop={(e)=>{ e.preventDefault(); if(dragId.current&&dragId.current!==l.id){ /* reorder: copy date of target */ setLesson(dragId.current,{date:l.date}); } }}>
        <span className="ll-num" style={{background:`color-mix(in oklab, ${cv(s.c)} 16%, white)`,color:cv(s.c)}}>{numbering[l.id]}</span>
        <button className={'ll-check'+(l.done?' on':'')} title={l.done?'Mark not done':'Mark done'} onClick={()=>toggleDone(l)}>{l.done&&I.done}</button>
        <span className="ll-bar" style={{background:cv(s.c)}}/>
        <span className="ll-main" style={{cursor:onPlan?'pointer':'default'}} onClick={()=>onPlan&&onPlan(l)} title={onPlan?'Open in Lesson Planner':undefined}>
          <span className="ll-title">{l.title}</span>
          <span className="ll-sub">{s.label} · {l.unit} · {fmtD(l.date)}</span>
        </span>
        {st==='catchup' && <span className="ll-badge catchup">Catch-Up</span>}
        {st==='nottaught' && <span className="ll-badge nottaught">Not taught</span>}
        <span className="ll-acts">
          <button title="Lesson plan" onClick={()=>onPlan&&onPlan(l)}>{I.plan}</button>
          <button title="Resource wall" onClick={()=>onPost&&onPost(l)}>{I.wall}</button>
          <button title="Teach board" onClick={()=>onTeach&&onTeach(l)}>{I.teach}</button>
          <button title="More" onClick={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); setMenu({id:l.id,x:r.right,y:r.bottom}); }}>{I.dots}</button>
        </span>
      </div>
    );
  };

  // month calendar
  const MonthView=()=>{
    const base=wkOf(new Date()); const cells=[];
    for(let w=0;w<5;w++) for(let d=0;d<7;d++){ const day=new Date(base.getTime()+(w*7+d-7)*DAYMS); cells.push(day); }
    const byDate={}; lessons.forEach(l=>{ if(l.date)(byDate[l.date]=byDate[l.date]||[]).push(l); });
    const [exp,setExp]=useState(null);
    return (
      <div className="ll-cal">
        <div className="ll-calhead">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div>
        <div className="ll-calgrid">
          {cells.map((day,i)=>{ const k=iso(day); const items=byDate[k]||[]; const isToday=k===today;
            return (
              <div key={i} className={'ll-celld'+(isToday?' today':'')} onClick={()=>items.length&&setExp(exp===k?null:k)}
                onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{ e.preventDefault(); if(dragId.current) setLesson(dragId.current,{date:k}); }}>
                <span className="ll-celldate">{day.getDate()}</span>
                {items.slice(0,exp===k?99:3).map(l=>{ const s=DS.SUBJECTS[l.subjectId]; return (
                  <span key={l.id} className={'ll-chip'+(l.done?' done':'')} draggable onDragStart={()=>{dragId.current=l.id;}}
                    style={{background:`color-mix(in oklab, ${cv(s.c)} 22%, white)`,color:cv(s.c)}} onClick={(e)=>{e.stopPropagation();onPlan&&onPlan(l);}} title={l.title}>{s.label}: {l.title.split(' · ')[0]}</span>
                ); })}
                {items.length>3 && exp!==k && <span className="ll-more">+{items.length-3}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  useEffect(()=>{ if(!menu) return; const h=()=>setMenu(null); document.addEventListener('click',h); return ()=>document.removeEventListener('click',h); },[menu]);
  const menuL = menu && all.find(l=>l.id===menu.id);

  return (
    <div className={'ll-root'+(embedded?' embedded':'')}>
      <div className="ll-bar1">
        <div className="ll-views">{VIEWS.map(([k,lab])=><button key={k} className={view===k?'on':''} onClick={()=>setView(k)}>{lab}</button>)}</div>
        <div className="ll-bar1r">
          <input className="ll-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search lessons…"/>
          <div className="ll-addwrap">
            <button className="ll-addbtn" onClick={()=>setAddOpen(o=>!o)}>{I.plus}Add</button>
            {addOpen && <div className="ll-addpop" onMouseLeave={()=>setAddOpen(false)}>
              <button onClick={()=>{setAddOpen(false);onPlan&&onPlan(all[0]);}}>Add lesson</button>
              <button onClick={()=>setAddOpen(false)}>Add unit</button>
              <button onClick={()=>setAddOpen(false)}>Add subject</button>
            </div>}
          </div>
          <button className="ll-iconb" title="Print" onClick={()=>setPrintOpen(true)}>{I.print}</button>
          {embedded && onClose && <button className="ll-iconb" title="Expand" onClick={onClose}>{I.expand}</button>}
        </div>
      </div>
      <div className="ll-buckets">
        {BUCKETS.map(([k,lab])=><button key={k} className={bucket===k?'on':''} onClick={()=>setBucket(k)}>{lab}{counts[k]!==undefined&&<span className="ll-bn">{counts[k]}</span>}</button>)}
      </div>

      <div className="ll-body">
        {view==='month' ? <MonthView/> :
          groups.map((g,gi)=>(
            <div key={gi} className="ll-group">
              <div className="ll-ghead">{g.sid&&<span className="ll-gdot" style={{background:cv(DS.SUBJECTS[g.sid].c)}}/>}{g.title}<span className="ll-gn">{g.items.length}</span></div>
              {g.items.map(l=><Row key={l.id} l={l}/>)}
            </div>
          ))}
        {view!=='month' && !groups.some(g=>g.items.length) && <div className="ll-empty">No lessons in this view</div>}
      </div>

      {menu && menuL && <div className="ll-menu" style={{left:Math.min(menu.x-160,window.innerWidth-180),top:menu.y+4}} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>{ setResched(menuL); setMenu(null); }}>Change time / date…</button>
        <button onClick={()=>{ const d=menuL.date?new Date(menuL.date+'T00:00'):new Date(); d.setDate(d.getDate()+1); setLesson(menuL.id,{date:iso(d)}); setMenu(null); }}>Bump to next day</button>
        <button onClick={()=>{ toggleDone(menuL); setMenu(null); }}>{menuL.done?'Mark not done':'Mark done'}</button>
        <button className="del" onClick={()=>{ setLesson(menuL.id,{date:null,deleted:true}); setMenu(null); }}>Remove from schedule</button>
      </div>}

      {resched && <RescheduleDialog lesson={resched} allLessons={all} onClose={()=>setResched(null)}
        onApply={(date,time,cascade)=>{
          if(cascade){
            const shift = (new Date(date+'T00:00') - new Date((resched.date||date)+'T00:00'));
            const later=all.filter(l=>l.subjectId===resched.subjectId && l.date && resched.date && l.date>resched.date);
            const next={...ov}; later.forEach(l=>{ const nd=new Date(l.date+'T00:00').getTime()+shift; next[l.id]={...(next[l.id]||{}),date:iso(new Date(nd))}; });
            next[resched.id]={...(next[resched.id]||{}),date,start:time}; setOv(next); saveOverrides(next);
          } else setLesson(resched.id,{date,start:time});
          setResched(null);
        }} />}

      {printOpen && <PrintDialog view={view} onClose={()=>setPrintOpen(false)} onPrint={()=>{ setPrintOpen(false); setTimeout(()=>window.print(),60); }} />}
    </div>
  );
}

function RescheduleDialog({ lesson, allLessons, onClose, onApply }){
  const [date,setDate]=useState(lesson.date||new Date().toISOString().slice(0,10));
  const [time,setTime]=useState(lesson.start||'09:40');
  const [cascade,setCascade]=useState(false);
  const clash = (allLessons||[]).find(l=>l.id!==lesson.id && l.date===date && l.start===time);
  return (
    <div className="ll-dlgscrim" onClick={onClose}>
      <div className="ll-dlg" onClick={e=>e.stopPropagation()}>
        <div className="ll-dlgh">Change time / date</div>
        <div className="ll-dlgsub">{lesson.title}</div>
        <div className="ll-fld2">
          <label className="ll-fld"><span>Date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label className="ll-fld"><span>Time</span><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
        </div>
        {clash && <div className="ll-clash">Stacks with “{clash.title}” at this time — both lessons will share the slot.</div>}
        <div className="ll-cascade">
          <div className="ll-clabel">Move the later lessons too?</div>
          <div className="ll-cbtns">
            <button className={!cascade?'on':''} onClick={()=>setCascade(false)}>Just this lesson</button>
            <button className={cascade?'on':''} onClick={()=>setCascade(true)}>Bump all after</button>
          </div>
        </div>
        <div className="ll-dlgfoot"><button onClick={onClose}>Cancel</button><button className="pri" onClick={()=>onApply(date,time,cascade)}>Apply</button></div>
      </div>
    </div>
  );
}

function PrintDialog({ view, onClose, onPrint }){
  const [range,setRange]=useState('view');
  const [inc,setInc]=useState({standards:true,resources:true,notes:false});
  return (
    <div className="ll-dlgscrim" onClick={onClose}>
      <div className="ll-dlg" onClick={e=>e.stopPropagation()}>
        <div className="ll-dlgh">Print lessons</div>
        <label className="ll-fld"><span>Range</span>
          <select value={range} onChange={e=>setRange(e.target.value)}>
            <option value="view">Current view ({view})</option>
            <option value="week">This week</option>
            <option value="unit">Current unit</option>
            <option value="all">All lessons</option>
          </select>
        </label>
        <div className="ll-fld"><span>Include</span>
          <div className="ll-incs">
            {[['standards','Standards'],['resources','Resources'],['notes','Notes']].map(([k,lab])=>(
              <label key={k} className="ll-inc"><input type="checkbox" checked={inc[k]} onChange={e=>setInc(p=>({...p,[k]:e.target.checked}))}/>{lab}</label>
            ))}
          </div>
        </div>
        <div className="ll-dlgfoot"><button onClick={onClose}>Cancel</button><button className="pri" onClick={onPrint}>Print</button></div>
      </div>
    </div>
  );
}

window.LessonLibrary = LessonLibrary;
})();
