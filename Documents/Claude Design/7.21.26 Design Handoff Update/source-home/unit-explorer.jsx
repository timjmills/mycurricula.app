/* Unit Explorer — hover quick-stats chip + full frosted-glass modal.
   window.UE.Chip(...) wraps a year-view unit element with hover stats + click.
   window.UE.Explorer(...) is the modal. */
(function(){
const { useState, useEffect } = React;
const cv = (x)=>`var(${x})`;

function Ring({ value, size=64, stroke=7, color }){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-value);
  return (
    <svg width={size} height={size} style={{display:'block'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
}

const I = {
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>,
  teach:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>,
  plan:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5"/></svg>,
  post:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h5"/></svg>,
  clock:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  print:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v6H8z"/></svg>,
};

/* ── hover quick-stats ── */
function Chip({ sid, uname, progress, onOpen, className, style, children }){
  const [hov,setHov]=useState(null);
  const ref=React.useRef(null);
  const show=()=>{ const r=ref.current.getBoundingClientRect(); setHov({x:r.left+r.width/2,y:r.top}); };
  const d=window.DS.unitDetail(sid,uname,progress);
  const s=window.DS.SUBJECTS[sid];
  return (
    <div ref={ref} className={className} style={style} onClick={()=>onOpen&&onOpen(sid,uname,progress)}
      onMouseEnter={show} onMouseLeave={()=>setHov(null)}>
      {children}
      {hov && ReactDOM.createPortal(
        <div className="ue-hov" style={{left:hov.x,top:hov.y,'--uc':cv(s.c)}}>
          <div className="ue-hov-h"><span className="ue-hov-dot" style={{background:cv(s.c)}}/>{uname}</div>
          <div className="ue-hov-stats">
            <div><b>{Math.round(d.progress*100)}%</b><span>taught</span></div>
            <div><b>{d.taughtN}/{d.total}</b><span>lessons</span></div>
            <div><b>{d.covered}/{d.standards.length}</b><span>standards</span></div>
          </div>
        </div>, document.body)}
    </div>
  );
}

/* ── full modal: Unit Planner | Lesson Planner ── */
const UNIT_TABS=['Overview','Lessons','Catch-Up','Standards','Resources','Pacing','Assessment','Stats','Notes'];
const LESSON_TABS=['Overview','Flow','Standards','Resources','Differentiation','Materials','Stats','Notes'];

const UE_RES_KINDS=['Slides','Worksheet','Image','Document','Video'];
const UE_RES_ARTS=['SL','WS','IM','DOC','VID'];
const UE_RES_NAMES=['Slides Deck','Practice Worksheet','Anchor Chart','Exit Ticket','Read-Aloud','Vocabulary Cards','Sort Mat','Quick-Check','Mini-Lesson','Graphic Organizer','Reflection Sheet','Game Board'];
function ueMakeRes(count){ return Array.from({length:count}).map((_,i)=>({ id:'r'+i, art:UE_RES_ARTS[i%5], kind:UE_RES_KINDS[i%5], label:UE_RES_NAMES[i%UE_RES_NAMES.length] })); }
function ResourcesPanel({ accent, count, onOpen, openLabel }){
  const [list,setList]=React.useState(()=>ueMakeRes(count));
  const [view,setView]=React.useState('grid');
  const [filter,setFilter]=React.useState('All');
  const [sort,setSort]=React.useState('seq');
  const [drag,setDrag]=React.useState(null);
  const chips=['All',...UE_RES_KINDS];
  let shown=list.filter(r=>filter==='All'||r.kind===filter);
  if(sort==='name') shown=[...shown].sort((a,b)=>a.label.localeCompare(b.label));
  else if(sort==='type') shown=[...shown].sort((a,b)=>a.kind.localeCompare(b.kind));
  const reorder=(from,to)=>{ if(from===to) return; setList(l=>{ const n=[...l]; n.splice(to,0,n.splice(from,1)[0]); return n; }); };
  return (
    <div className="ue-respanel" style={{'--uc':accent}}>
      <div className="ue-restoolbar">
        <div className="ue-resfilters">{chips.map(k=><button key={k} className={'ue-rchip'+(filter===k?' on':'')} onClick={()=>setFilter(k)}>{k}</button>)}</div>
        <div className="ue-restools">
          <label className="ue-ressort"><span>Sort</span>
            <select value={sort} onChange={e=>setSort(e.target.value)}><option value="seq">Manual</option><option value="name">Name</option><option value="type">Type</option></select></label>
          <div className="ue-resview">
            <button className={view==='grid'?'on':''} title="Thumbnail view" onClick={()=>setView('grid')}>▦</button>
            <button className={view==='list'?'on':''} title="List view" onClick={()=>setView('list')}>≡</button>
          </div>
        </div>
      </div>
      <div className={view==='grid'?'ue-resgrid':'ue-reslist'}>
        {shown.map((r)=>{ const realIdx=list.indexOf(r); return (
          <div key={r.id} className={'ue-rcard '+view+(drag===r.id?' dragging':'')} draggable={sort==='seq'}
            onDragStart={()=>setDrag(r.id)} onDragEnd={()=>setDrag(null)} onDragOver={e=>e.preventDefault()}
            onDrop={()=>{ if(drag){ reorder(list.findIndex(x=>x.id===drag), realIdx); setDrag(null); } }}>
            {sort==='seq' && <span className="ue-rgrip" title="Drag to reorder">⠿</span>}
            <span className="ue-rnum">{realIdx+1}</span>
            <span className="ue-rart">{r.art}</span>
            <span className="ue-rmeta"><span className="ue-rlabel">{r.label}</span><span className="ue-rkind">{r.kind}</span></span>
          </div>
        );})}
        {!shown.length && <div className="ue-empty2">No {filter.toLowerCase()} resources in this unit.</div>}
      </div>
      <button className="ue-btn ghost ue-rfull" onClick={onOpen}>{I.post} {openLabel||'Open full wall'}</button>
    </div>
  );
}


function lessonExtras(l, d){
  const i=d.lessons.indexOf(l);
  return {
    flow:[['Warm-up',5],['Mini-lesson',15],['Guided practice',15],['Independent',8],['Exit ticket',5]],
    diff:{ support:'Sentence frames + partner think-aloud; pre-teach key vocabulary.', onlevel:'Core task as written with the anchor chart available.', extension:'Apply the skill to a new text/problem and justify reasoning.' },
    materials:['Anchor chart','Student notebooks','Worksheet copies','Exit-ticket slips'],
    target:'I '+(l.objective||'').replace(/^I\s+/,'') ,
    formative:'Exit ticket: 3 questions; aim for 80% mastery before moving on.',
    homework:i%2?'Finish independent practice problems 4–8.':'Read pages 22–25 and jot one question.',
  };
}

function Explorer({ sid, uname, progress, startMode, startLesson, embedded, hideModeSwitch, onJumpToUnit, onJumpToLesson, onClose, onTeach, onPlan, onPost }){
  const d=window.DS.unitDetail(sid,uname,progress);
  const s=d.subject;
  const accent=cv(s.c);
  const [mode,setMode]=useState(startMode==='lesson'?'lesson':'unit');
  const [tab,setTab]=useState(startMode==='lesson'?'Overview':'Overview');
  const startIdx=startLesson? Math.max(0, d.lessons.findIndex(l=>l.id===startLesson.id || l.title===startLesson.title)) : (d.lessons.findIndex(l=>!l.taught)>=0?d.lessons.findIndex(l=>!l.taught):0);
  const [lidx,setLidx]=useState(startIdx<0?0:startIdx);
  const [notes,setNotes]=useState('');
  const [coNotes,setCoNotes]=useState('');
  const [doneMap,setDoneMap]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('cc_lessondone')||'{}'); }catch(e){ return {}; } });
  const isTaught=(l)=> doneMap[l.id]!==undefined ? doneMap[l.id] : l.taught;
  const toggleDone=(l)=>setDoneMap(m=>{ const n={...m,[l.id]:!isTaught(l)}; try{localStorage.setItem('cc_lessondone',JSON.stringify(n));}catch(e){} return n; });
  const [rowMenu,setRowMenu]=useState(null);
  const [,forceTick]=useState(0);
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape')onClose(); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[]);
  const switchMode=(m)=>{ setMode(m); setTab('Overview'); };

  const taught=d.lessons.filter(isTaught), untaught=d.lessons.filter(l=>!isTaught(l));
  const paceColor = d.pace==='On pace'?'var(--done)':d.pace==='Behind'?'var(--danger)':'var(--warn)';
  const L=d.lessons[lidx]||d.lessons[0];
  const lx=lessonExtras(L,d);
  const tabs = mode==='unit'?UNIT_TABS:LESSON_TABS;

  const Stat=({n,l})=> <div className="ue-stat"><b>{n}</b><span>{l}</span></div>;
  const LessonRow=({l,i})=>{
    const t=isTaught(l);
    return (
    <div className={'ue-lrow'+(t?' done':'')} draggable onDragStart={e=>{e.dataTransfer.setData('text/lrow',String(d.lessons.indexOf(l)));}}
      onDragOver={e=>e.preventDefault()} onDrop={e=>{ const from=+e.dataTransfer.getData('text/lrow'); const to=d.lessons.indexOf(l); if(!isNaN(from)&&from!==to){ d.lessons.splice(to,0,d.lessons.splice(from,1)[0]); setRowMenu(x=>x); forceTick(t=>t+1); } }}>
      <span className="ue-lgrip" title="Drag to reorder">⠿</span>
      <span className="ue-lnum">{d.lessons.indexOf(l)+1}</span>
      <button className="ue-lstatus" onClick={()=>toggleDone(l)} title={t?'Mark not taught':'Mark taught'} style={{background:t?'var(--done)':'transparent',borderColor:t?'transparent':cv(s.c)}}>{t&&I.check}</button>
      <span className="ue-ltext" onClick={()=>{ if(onJumpToLesson){ onJumpToLesson(l); return; } const i=d.lessons.indexOf(l); setLidx(i); switchMode('lesson'); }} style={{cursor:'pointer'}}><span className="ue-ltitle">{l.title}</span><span className="ue-lsub">{t?('Taught · '+(l.date||'today')):('Not taught · '+(l.reason||'unscheduled'))} · {l.std}</span></span>
      <span className="ue-lacts">
        <button title="Reschedule / bump" onClick={()=>setRowMenu(rowMenu===l.id?null:l.id)}>⋯</button>
        <button title="Teach" onClick={()=>{onTeach&&onTeach(l);onClose();}}>{I.teach}</button>
        <button title="Plan" onClick={()=>{onPlan&&onPlan(l);onClose();}}>{I.plan}</button>
        <button title="Post" onClick={()=>{onPost&&onPost(l);onClose();}}>{I.post}</button>
      </span>
      {rowMenu===l.id && <div className="ue-rowmenu" onMouseLeave={()=>setRowMenu(null)}>
        <button onClick={()=>{toggleDone(l);setRowMenu(null);}}>{t?'Mark not taught':'Mark taught'}</button>
        <button onClick={()=>setRowMenu(null)}>Reschedule…</button>
        <button onClick={()=>setRowMenu(null)}>Bump to next slot</button>
        <button onClick={()=>setRowMenu(null)}>Move to catch-up</button>
      </div>}
    </div>
    );
  };

  return (
    <div className={embedded?'ue-embed':'ue-scrim'} onClick={embedded?undefined:onClose}>
      <div className="ue-modal" onClick={e=>e.stopPropagation()} style={{'--uc':accent}}>
        {/* top mode switch — hidden when the hub drives Explorer/Planner tabs */}
        {!hideModeSwitch &&
          <div className="ue-modeswitch">
            <button className={mode==='unit'?'on':''} onClick={()=>switchMode('unit')}>Unit Planner</button>
            <button className={mode==='lesson'?'on':''} onClick={()=>switchMode('lesson')}>Lesson Planner</button>
          </div>}

        <div className="ue-head" style={{background:`linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 64%, #1c1b2e))`}}>
          <div className="ue-head-l">
            <window.VS.SubjGlyph id={sid} size={40} radius={12}/>
            <div>
              {mode==='unit'
                ? <React.Fragment><div className="ue-htitle">{uname}</div><div className="ue-hsub">{s.full} · Unit {Math.min(6,Math.max(1,Math.round(progress*6)||1))} of 6</div></React.Fragment>
                : <React.Fragment>
                    <select className="ue-lessonsel" value={lidx} onChange={e=>setLidx(+e.target.value)}>
                      {d.lessons.map((l,i)=><option key={i} value={i}>{i+1}. {l.title}</option>)}
                    </select>
                    <div className="ue-hsub">{s.full} · {onJumpToUnit? <button className="ue-unitlink" title="Open this unit in the Unit Planner" onClick={()=>onJumpToUnit(sid,uname,progress)}>{uname}</button> : uname} · {L.taught?('Taught '+L.date):'Not yet taught'}</div>
                  </React.Fragment>}
            </div>
          </div>
          <div className="ue-head-ring">
            {mode==='unit'
              ? <div className="ue-ringwrap"><Ring value={d.progress} color="#fff"/><span className="ue-ringn">{Math.round(d.progress*100)}%</span></div>
              : <span className={'ue-ltag'+(L.taught?' done':'')}>{L.taught?'Taught':'Planned'}</span>}
            {window.Share && <window.Share.Btn kind={mode==='unit'?'unit':'lesson'} id={mode==='unit'?(sid+':'+uname):L.id} label={mode==='unit'?(uname+' · '+s.full):L.title} />}
            <button className="ue-x" onClick={onClose}>{I.x}</button>
          </div>
        </div>

        {mode==='unit'
          ? <div className="ue-statstrip">
              <Stat n={d.taughtN+'/'+d.total} l="lessons taught"/>
              <Stat n={d.weeksRemaining+'w'} l="remaining"/>
              <Stat n={d.covered+'/'+d.standards.length} l="standards"/>
              <Stat n={d.gaps} l="gaps"/>
              <Stat n={d.resourceCount} l="resources"/>
              <div className="ue-stat"><b style={{color:paceColor}}>{d.pace}</b><span>finish {d.projectedFinish}</span></div>
            </div>
          : <div className="ue-statstrip">
              <Stat n={(lidx+1)+'/'+d.total} l="in sequence"/>
              <Stat n={lx.flow.reduce((a,f)=>a+f[1],0)+'m'} l="planned time"/>
              <Stat n={L.std} l="standard"/>
              <Stat n={Math.min(8,d.resourceCount)} l="resources"/>
              <div className="ue-stat"><b style={{color:L.taught?'var(--done)':'var(--warn)'}}>{L.taught?'Complete':'Upcoming'}</b><span>{L.taught?L.date:'not taught'}</span></div>
            </div>}

        <div className="ue-tabs">
          {tabs.map(t=>(
            <button key={t} className={'ue-tab'+(tab===t?' on':'')} onClick={()=>setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="ue-body">
          {mode==='unit' && <UnitBody {...{d,s,accent,tab,paceColor,taught,untaught,notes,setNotes,onTeach,onPost,onClose,LessonRow}}/>}
          {mode==='lesson' && <LessonBody {...{d,s,L,lx,accent,tab,lidx,notes,setNotes,coNotes,setCoNotes,onTeach,onPost,onClose,isTaught,toggleDone}}/>}
        </div>

        <div className="ue-foot">
          <button className="ue-btn ghost" onClick={()=>window.print()}>{I.print} Print</button>
          {mode==='unit'
            ? <button className="ue-btn pri" onClick={()=>{onTeach&&onTeach(untaught[0]||taught[0]||d.lessons[0]);onClose();}}>{I.teach} Teach next lesson</button>
            : <div className="ue-footacts">
                <button className="ue-btn ghost" onClick={()=>{onPost&&onPost(L);onClose();}}>{I.post} Resource wall</button>
                <button className="ue-btn ghost" title="Duplicate this lesson">Duplicate</button>
                <button className="ue-btn ghost" title="Mark taught">{I.check} Mark taught</button>
                <button className="ue-btn pri" onClick={()=>{onTeach&&onTeach(L);onClose();}}>{I.teach} Teach this lesson</button>
              </div>}
        </div>
      </div>
    </div>
  );
}

function UnitBody({ d,s,accent,tab,paceColor,taught,untaught,notes,setNotes,onTeach,onPost,onClose,LessonRow }){
  return (
    <React.Fragment>
      {tab==='Overview' && <div className="ue-over">
        <p className="ue-summary">{d.summary}</p>
        <div className="ue-overgrid">
          <div className="ue-card"><div className="ue-ch">Big ideas · essential questions</div>
            <ul className="ue-list"><li>How does {d.name.toLowerCase()} help us make sense of the world?</li><li>What patterns repeat, and why?</li><li>How do we know when we've mastered it?</li></ul></div>
          <div className="ue-card"><div className="ue-ch">Unit vocabulary</div>
            <div className="ue-chips">{['pattern','strategy','model','evidence','reasoning','transfer'].map(v=><span key={v} className="ue-vchip">{v}</span>)}</div></div>
        </div>
        <div className="ue-timeline">
          {d.lessons.map((l,i)=>(
            <div key={i} className={'ue-tnode'+(l.taught?' done':'')} title={l.title} style={{'--uc':accent}}>
              <span className="ue-tdot">{l.taught?I.check:i+1}</span>
              <span className="ue-tlabel">{l.title.split(' · ')[0]}</span>
            </div>
          ))}
        </div>
      </div>}

      {tab==='Lessons' && <div className="ue-lessons">
        <div className="ue-lgroup"><div className="ue-lghead">Taught <span>{taught.length}</span></div>{taught.map(l=><LessonRow key={l.id} l={l}/>)}</div>
        <div className="ue-lgroup"><div className="ue-lghead">Not taught <span>{untaught.length}</span></div>{untaught.map(l=><LessonRow key={l.id} l={l}/>)}</div>
      </div>}

      {tab==='Catch-Up' && <div className="ue-lessons">
        {untaught.length? <div className="ue-lgroup"><div className="ue-lghead">Behind / not taught <span>{untaught.length}</span></div>{untaught.map(l=><LessonRow key={l.id} l={l}/>)}</div>
          : <div className="ue-empty2">All lessons in this unit are taught 🎉</div>}
        {d.gaps>0 && <div className="ue-lgroup"><div className="ue-lghead">Standards gaps <span>{d.gaps}</span></div>{d.standards.filter(st=>!st.hits).map(st=><div key={st.code} className="ue-std gap"><span className="ue-stdcode">{st.code}</span><span className="ue-stddesc">{st.desc}</span><span className="ue-stdhits">not yet covered</span></div>)}</div>}
      </div>}

      {tab==='Standards' && <div className="ue-stds">
        {d.standards.map(st=>(
          <div key={st.code} className={'ue-std'+(st.hits?'':' gap')}>
            <span className="ue-stdcode">{st.code}</span><span className="ue-stddesc">{st.desc}</span>
            <span className="ue-stdhits">{st.hits?(st.hits+' lesson'+(st.hits>1?'s':'')):'Gap — not yet taught'}</span>
          </div>
        ))}
      </div>}

      {tab==='Resources' && <ResourcesPanel accent={accent} count={Math.max(6,Math.min(12,d.resourceCount))} onOpen={()=>{onPost&&onPost(taught[0]||d.lessons[0]);onClose();}} openLabel="Open full wall"/>}

      {tab==='Pacing' && <div className="ue-pacing">
        <div className="ue-ch" style={{marginBottom:12}}>Unit spread across weeks</div>
        {[0,1,2,3,4].map(w=>{
          const wl=d.lessons.filter((_,i)=>Math.floor(i/1.2)===w);
          return <div key={w} className="ue-week"><span className="ue-wlabel">Week {12+w}</span><div className="ue-wlessons">{wl.map((l,i)=><span key={i} className={'ue-wchip'+(l.taught?' done':'')} style={{'--uc':accent}}>{l.title.split(' · ')[0]}</span>)}{!wl.length&&<span className="ue-wempty">—</span>}</div></div>;
        })}
      </div>}

      {tab==='Assessment' && <div className="ue-assess">
        <div className="ue-card"><div className="ue-ch">Formative checkpoints</div><ul className="ue-list"><li>Exit tickets each lesson (80% mastery gate)</li><li>Mid-unit quick-check after lesson 3</li><li>Strategy conference — small groups</li></ul></div>
        <div className="ue-card"><div className="ue-ch">Summative</div><ul className="ue-list"><li>End-of-unit performance task</li><li>Standards-aligned rubric ({d.standards.length} criteria)</li><li>Reflection + goal-setting</li></ul></div>
      </div>}

      {tab==='Stats' && <div className="ue-statsgrid">
        <div className="ue-card"><div className="ue-ch">Pace</div><div className="ue-bignum" style={{color:paceColor}}>{d.pace}</div><div className="ue-csub">Projected finish {d.projectedFinish} · {d.weeksRemaining} weeks left</div></div>
        <div className="ue-card"><div className="ue-ch">Minutes</div><div className="ue-bignum">{d.actualMin}<small>/{d.plannedMin}</small></div><div className="ue-csub">actual vs planned</div></div>
        <div className="ue-card"><div className="ue-ch">Standards coverage</div><div className="ue-bignum">{Math.round(d.covered/d.standards.length*100)}%</div><div className="ue-csub">{d.covered} covered · {d.gaps} gaps</div></div>
        <div className="ue-card"><div className="ue-ch">vs last year</div><div className="ue-bignum">+3<small> days ahead</small></div><div className="ue-csub">same unit, last cohort</div></div>
      </div>}

      {tab==='Notes' && <div className="ue-notes">
        <div className="ue-ch" style={{marginBottom:8}}>Unit reflection · materials & prep</div>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What worked, what to adjust next year, materials to prep ahead…"/>
      </div>}
    </React.Fragment>
  );
}

function LessonBody({ d,s,L,lx,accent,tab,lidx,notes,setNotes,coNotes,setCoNotes,onTeach,onPost,onClose,isTaught,toggleDone }){
  const t=isTaught?isTaught(L):L.taught;
  const [date,setDate]=React.useState(L.date? '2026-06-'+String(14+lidx).padStart(2,'0') : '');
  const [time,setTime]=React.useState('09:40');
  return (
    <React.Fragment>
      {tab==='Overview' && <div className="ue-over">
        <div className="ue-card ue-sched">
          <div className="ue-ch">{L.taught?'Scheduled':'Schedule this lesson'}</div>
          <div className="ue-schedrow">
            <label className="ue-schedfield"><span>Date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
            <label className="ue-schedfield"><span>Time</span><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
            <button className={'ue-donebtn'+(t?' on':'')} onClick={()=>toggleDone&&toggleDone(L)}>{t?'✓ Taught':'Mark taught'}</button>
            <span className={'ue-schedstate'+(date?'':' unset')}>{date? (t?'Taught':'Scheduled') : 'Not yet scheduled'}</span>
          </div>
          {!date && <div className="ue-schedhint">This lesson has no date — pick a date and time to add it to the schedule.</div>}
        </div>
        <div className="ue-card ue-target" style={{borderColor:accent}}><div className="ue-ch">Learning target (student-facing)</div><div className="ue-targettext">{lx.target}</div></div>
        <p className="ue-summary">{L.objective}</p>
        <div className="ue-overgrid">
          <FieldResources lesson={L} field="formative" title="Formative check" body={lx.formative} accent={accent} />
          <FieldResources lesson={L} field="homework" title="Homework / follow-up" body={lx.homework} accent={accent} />
        </div>
      </div>}

      {tab==='Flow' && <div className="ue-flow">
        {lx.flow.map((f,i)=>(
          <div key={i} className="ue-flowrow"><span className="ue-flown" style={{background:accent}}>{i+1}</span><span className="ue-flowt">{f[0]}</span><span className="ue-flowm">{f[1]} min</span></div>
        ))}
        <div className="ue-flowtotal">Total · {lx.flow.reduce((a,f)=>a+f[1],0)} min</div>
      </div>}

      {tab==='Standards' && <div className="ue-stds">
        <div className="ue-stdnote">Auto-pulled from {d.name}</div>
        <div className="ue-std"><span className="ue-stdcode">{L.std}</span><span className="ue-stddesc">{(d.standards.find(x=>L.std.startsWith(x.code.split('.').slice(0,-1).join('.')))||d.standards[0]).desc}</span><span className="ue-stdhits">this lesson</span></div>
      </div>}

      {tab==='Resources' && <ResourcesPanel accent={accent} count={6} onOpen={()=>{onPost&&onPost(L);onClose();}} openLabel="Open this lesson's wall"/>}

      {tab==='Differentiation' && <div className="ue-diffgrid">
        <div className="ue-card" style={{borderTop:'4px solid var(--subj-3-bright)'}}><div className="ue-ch" style={{color:'var(--subj-3-bright)'}}>Support</div><p className="ue-fieldtext">{lx.diff.support}</p></div>
        <div className="ue-card" style={{borderTop:'4px solid var(--subj-10-bright)'}}><div className="ue-ch" style={{color:'var(--subj-10-bright)'}}>On level</div><p className="ue-fieldtext">{lx.diff.onlevel}</p></div>
        <div className="ue-card" style={{borderTop:'4px solid var(--subj-13-bright)'}}><div className="ue-ch" style={{color:'var(--subj-13-bright)'}}>Extension</div><p className="ue-fieldtext">{lx.diff.extension}</p></div>
      </div>}

      {tab==='Materials' && <div className="ue-mats">
        {lx.materials.map((m,i)=><label key={i} className="ue-matrow"><input type="checkbox" defaultChecked={i<2}/><span>{m}</span></label>)}
      </div>}

      {tab==='Stats' && <div className="ue-statsgrid">
        <div className="ue-card"><div className="ue-ch">Planned time</div><div className="ue-bignum">{lx.flow.reduce((a,f)=>a+f[1],0)}<small> min</small></div><div className="ue-csub">{lx.flow.length} steps</div></div>
        <div className="ue-card"><div className="ue-ch">Sequence</div><div className="ue-bignum">{lidx+1}<small>/{d.total}</small></div><div className="ue-csub">in {d.name}</div></div>
        <div className="ue-card"><div className="ue-ch">Status</div><div className="ue-bignum" style={{color:L.taught?'var(--done)':'var(--warn)'}}>{L.taught?'Done':'Planned'}</div><div className="ue-csub">{L.taught?L.date:'not yet taught'}</div></div>
        <div className="ue-card"><div className="ue-ch">Resources</div><div className="ue-bignum">5</div><div className="ue-csub">attached</div></div>
      </div>}

      {tab==='Notes' && <div className="ue-notes">
        <div className="ue-ch" style={{marginBottom:8}}>Lesson notes</div>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes for this lesson…"/>
        <div className="ue-ch" style={{margin:'14px 0 8px'}}>Co-teacher / support notes</div>
        <textarea value={coNotes} onChange={e=>setCoNotes(e.target.value)} placeholder="Notes for co-teachers, aides, or substitutes…"/>
      </div>}
    </React.Fragment>
  );
}

/* Per-field resources (Formative check · Homework) — add a resource (+), share the
   set, and show attachments as pill links. Writes through DS.addCustomRes so the
   same resources surface in the lesson's resource wall too. */
function FieldResources({ lesson, field, title, body, accent }){
  const DS=window.DS;
  const read=()=>{ try{ return (JSON.parse(localStorage.getItem('cc_res_'+lesson.id))||[]).filter(r=>r.field===field); }catch(e){ return []; } };
  const [items,setItems]=React.useState(read);
  const [open,setOpen]=React.useState(false);
  const [name,setName]=React.useState('');
  const [url,setUrl]=React.useState('');
  const refresh=()=>setItems(read());
  const add=()=>{
    const label=(name||'').trim(); const u=(url||'').trim();
    if(!label && !u) return;
    const type=u?DS.typeFromUrl(u):'Doc';
    DS.addCustomRes(lesson.id,{ id:'cr-'+Date.now().toString(36), label:label||u, type, url:u||'#', field });
    setName(''); setUrl(''); setOpen(false); refresh();
  };
  const remove=(id)=>{ DS.removeCustomRes(lesson.id,id); refresh(); };
  const RT=DS.RESTYPES;
  return (
    <div className="ue-card ue-resfield">
      <div className="ue-cardhead">
        <div className="ue-ch" style={{margin:0}}>{title}</div>
        <div className="ue-cardacts">
          <button className="ue-miniadd" title={'Add a resource to '+title.toLowerCase()} onClick={()=>setOpen(o=>!o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          {window.Share && <window.Share.Btn kind="resource" id={lesson.id+':'+field} label={title+' · '+lesson.title} />}
        </div>
      </div>
      <div className="ue-fieldtext">{body}</div>
      {items.length>0 && <div className="ue-respills">
        {items.map(r=>(
          <span key={r.id} className="ue-respill" style={{'--rc':cv(RT[r.type]||'--subj-11')}}>
            <a href={r.url||'#'} target="_blank" rel="noopener" title={r.type+' · '+r.label}><span className="ue-respill-dot"/><span className="ue-respill-tx">{r.label}</span></a>
            <button className="ue-respill-x" title="Remove" onClick={()=>remove(r.id)}>×</button>
          </span>
        ))}
      </div>}
      {open && <div className="ue-addres" style={{'--uc':accent}}>
        <input className="ue-addres-in" value={name} onChange={e=>setName(e.target.value)} placeholder="Resource name" autoFocus
          onKeyDown={e=>{ if(e.key==='Enter') add(); if(e.key==='Escape') setOpen(false); }}/>
        <input className="ue-addres-in" value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste link (optional)"
          onKeyDown={e=>{ if(e.key==='Enter') add(); if(e.key==='Escape') setOpen(false); }}/>
        <div className="ue-addres-foot">
          <span className="ue-addres-hint">Also added to the resource wall</span>
          <div className="ue-addres-btns">
            <button className="ue-addres-cancel" onClick={()=>setOpen(false)}>Cancel</button>
            <button className="ue-addres-add" onClick={add}>Add</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

window.UE = { Chip, Explorer };
})();
