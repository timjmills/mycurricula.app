/* Planning Hub — Unified Unit Workspace: one shell — persistent header, four tabs
   (Unit Plan · Lessons · Assessments · Insights), persistent left lesson rail,
   one central editor, one right context drawer. Replaces the unit popup + focus
   modal as the primary unit/lesson experience. Exposes window.PHWorkspace. */
(function(){
const {useState,useEffect}=React;
const {cv}=window.PWC; const {I}=window.PHC;
const PW=window.PW, DS=window.DS;

const guessType=(n)=>{ n=(n||'').toLowerCase();
  if(/slide|deck|ppt/.test(n)) return 'Slides';
  if(/video|clip|youtube/.test(n)) return 'Video';
  if(/worksheet|practice|packet/.test(n)) return 'Worksheet';
  if(/image|chart|poster|photo|anchor/.test(n)) return 'Image';
  if(/pdf|doc|rubric|plan/.test(n)) return 'Doc';
  return 'Link'; };
const Bar=({v,t,c})=><span className="wsbar"><i style={{width:(t?Math.min(100,Math.round(v/t*100)):0)+'%',background:c||'var(--done)'}}></i></span>;
const Sec=({id,name,sum,secs,setSecs,children})=>{ const open=!!secs[id];
  return <div className={'wsec'+(open?' open':'')}>
    <button className="wsec-h" onClick={()=>setSecs(p=>({...p,[id]:!p[id]}))}><b>{name}</b><span className="sum">{sum}</span><i className="ch">{open?'⌄':'›'}</i></button>
    {open && <div className="wsec-b">{children}</div>}
  </div>; };
const TA=({v,set,ph})=><textarea className="wsta" value={v||''} placeholder={ph} onChange={e=>set(e.target.value)}></textarea>;
function resThumb(r){
  const t=(r.type||'').toLowerCase(); const url=r.url||'';
  const isImg=/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url)||t==='image';
  if(url&&isImg) return <div className="rp-img"><img src={url} alt={r.name}/></div>;
  if(t==='video') return <div className="rp-thumb vid"><span className="play"></span></div>;
  if(t==='slides') return <div className="rp-thumb slide"><span className="ttl"></span><span className="ln"></span><span className="ln" style={{width:'72%'}}></span></div>;
  if(t==='link') return <div className="rp-thumb linkt"><span>{(url||'link').replace(/^https?:\/\//,'').slice(0,28)||'Link'}</span></div>;
  return <div className="rp-thumb doc">{[0,1,2,3,4].map(i=><span key={i} className="ln" style={{width:(92-(i%3)*18)+'%'}}></span>)}</div>;
}

function Workspace({state,uid,lid,tab0,dated,actions,onClose}){
  const [tab,setTab]=useState(tab0||'lessons');
  const [cur,setCur]=useState(lid||null);
  const [q,setQ]=useState('');
  const [dw,setDw]=useState({open:true,tab:'context'});
  const [secs,setSecs]=useState({res:true});
  const [selA,setSelA]=useState(null);
  const [issue,setIssue]=useState(null);
  const [dis,setDis]=useState({});
  const [upSec,setUpSec]=useState('over');
  const [draft,setDraft]=useState('');
  const [menu,setMenu]=useState(false);
  const [wsMode,setWsMode]=useState((window.__phTLMem||{}).wsMode||'modal');
  useEffect(()=>{ (window.__phTLMem=window.__phTLMem||{}).wsMode=wsMode; },[wsMode]);
  useEffect(()=>{ const kk=(e)=>{ if(e.key==='Escape'&&onClose) onClose(); }; document.addEventListener('keydown',kk); return ()=>document.removeEventListener('keydown',kk); },[]);
  const [vocDraft,setVocDraft]=useState('');
  const rootRef=React.useRef(null);
  useEffect(()=>{ if(((window.__phTLMem||{}).wsMode||'modal')!=='full') return;   /* full-page: scroll into view. modal centers itself, no scroll */
    const el=rootRef.current; if(!el) return;
    const se=document.scrollingElement||document.documentElement;
    const target=Math.max(0,el.getBoundingClientRect().top+se.scrollTop-58);
    const from=se.scrollTop, d=target-from;
    if(Math.abs(d)<4||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){ se.scrollTop=target; return; }
    const N=8; const step=(i)=>{ const p=i/N; se.scrollTop=Math.round(from+d*(1-Math.pow(1-p,3))); if(i<N) setTimeout(()=>step(i+1),26); };
    step(1);
  },[uid,lid,tab0]);
  const dens='compact';   // compact is the only density now
  const [railC,setRailC]=useState(!!(window.__phTLMem||{}).wsRailC);
  useEffect(()=>{ (window.__phTLMem=window.__phTLMem||{}).wsRailC=railC; },[railC]);
  const [railView,setRailView]=useState((window.__phTLMem||{}).wsRailView||'units');
  useEffect(()=>{ (window.__phTLMem=window.__phTLMem||{}).wsRailView=railView; },[railView]);
  const [scope,setScope]=useState((window.__phTLMem||{}).wsScope||'unit');
  useEffect(()=>{ (window.__phTLMem=window.__phTLMem||{}).wsScope=scope; },[scope]);
  const [curUid,setCurUid]=useState(null);
  useEffect(()=>{ setCurUid(null); },[uid]);
  const [statusF,setStatusF]=useState('all');
  const [subjR,setSubjR]=useState('all');
  const [unitR,setUnitR]=useState('all');
  const [selIds,setSelIds]=useState([]);
  const [lmenu,setLmenu]=useState(false);
  const [moveOpen,setMoveOpen]=useState(false);
  const [datePop,setDatePop]=useState(null);
  const [resPrev,setResPrev]=useState(null);
  const [diffDraft,setDiffDraft]=useState('');
  useEffect(()=>{ if(lid){ setCur(lid); setTab('lessons'); } else if(tab0){ setTab(tab0); setCur(null); } },[lid,uid,tab0]);
  useEffect(()=>{ setDw(d=>({...d,tab:tab==='assessments'?'details':tab==='insights'?'issue':'context'})); setMenu(false); setLmenu(false); setMoveOpen(false); },[tab]);
  const u=state.units.find(x=>x.id===(curUid||uid))||state.units.find(x=>x.id===uid);
  if(!u) return null;
  const L=u.lessons;
  const l=L.find(x=>x.id===cur)||L[0];
  const idx=l?L.indexOf(l):0;
  const ed=(p)=>l&&actions.edit(l.id,p);
  const edU=(p)=>{ if(actions.editUnit) actions.editUnit(u.id,p); };
  const s=DS.SUBJECTS[u.sid]||{};
  const taught=L.filter(x=>x.status==='taught').length;
  const remaining=L.filter(x=>x.status!=='taught'&&x.slot>=PW.TODAY_SLOT).length;
  const daysLeft=Math.max(0,u.endSlot-PW.TODAY_SLOT+1);
  const missedN=L.filter(x=>window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(x)).length;
  const pace=(u.endSlot<PW.TODAY_SLOT||taught>=L.length)?'Done':(missedN||remaining>daysLeft)?'Behind':'On track';
  const aL=L.filter(x=>x.assessment);
  const aPrep=aL.filter(x=>x.done&&x.done.assess).length;
  const stdsTotal=(u.stds||[]).length;
  const stdsCov=new Set(L.map(x=>x.std).filter(Boolean)).size;
  const resMiss=L.filter(x=>x.slot>=PW.TODAY_SLOT&&x.status!=='taught'&&!(x.resources||[]).length);
  const diffMiss=L.filter(x=>x.status!=='taught'&&x.slot>=PW.TODAY_SLOT&&!x.diff);
  const aProg=aL.filter(x=>!(x.done&&x.done.assess));
  const fmtD=(slot)=>dated?PW.fmtSlot(slot):('#'+(slot+1));
  const lessonWord=(n)=>DS.label('lesson',n!==1).toLowerCase();
  const openLesson=(id2)=>{ setCur(id2); setTab('lessons'); };

  /* actionable issues */
  const issues=[];
  if(missedN) issues.push({k:'missed',sev:'red',title:missedN+' '+lessonWord(missedN)+' passed without being taught',
    desc:'Their day went by with no taught mark. Reschedule them or mark them taught.',act:'Open '+lessonWord(2),
    why:'Missed '+lessonWord(2)+' quietly push everything later — catching them early keeps the unit honest.',
    go:()=>{ const m=L.find(x=>window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(x)); if(m) openLesson(m.id); }});
  if(pace==='Behind'&&remaining>daysLeft) issues.push({k:'pace',sev:'red',title:u.name+' is at risk of running late',
    desc:remaining+' '+lessonWord(remaining)+' remain, but only '+daysLeft+' day'+(daysLeft===1?'':'s')+' before the unit ends.',
    act:'Review pacing',why:'When '+lessonWord(2)+' outnumber the days left, something has to move — better to choose now than at the end.',
    go:()=>setTab('insights')});
  if(diffMiss.length) issues.push({k:'diff',sev:'amber',title:diffMiss.length+' '+lessonWord(diffMiss.length)+' missing differentiation',
    desc:'These '+lessonWord(2)+' don\u2019t have differentiation planned. Adding options helps meet student needs.',
    aff:diffMiss.map(x=>L.indexOf(x)+1),affLabel:'Lessons affected',act:'Open '+lessonWord(2),
    why:'Differentiation ensures every learner can access the lesson.',go:()=>openLesson(diffMiss[0].id)});
  if(aProg.length) issues.push({k:'aprog',sev:'amber',title:aProg.length+' assessment'+(aProg.length===1?'':'s')+' still in progress',
    desc:'Finish preparing '+(aProg.length===1?'it':'them')+' to keep your unit on track.',chip:aProg[0].assessTitle||'Assessment',
    act:'Review',why:'Finishing assessments ensures you\u2019re ready to measure student understanding and make informed instructional decisions.',
    go:()=>{ setTab('assessments'); setSelA(aProg[0].id); setDw({open:true,tab:'details'}); }});
  if(resMiss.length) issues.push({k:'res',sev:'pink',title:resMiss.length+' '+lessonWord(resMiss.length)+' missing resources',
    desc:'No materials are attached yet. Add them so everything is easy to find in one place.',
    aff:resMiss.map(x=>L.indexOf(x)+1),affLabel:(resMiss.length===1?'Lesson':'Lessons')+' affected',act:'Fix now',
    why:'Having materials attached means no scrambling when the lesson starts.',go:()=>{ openLesson(resMiss[0].id); setSecs(p=>({...p,res:true})); }});
  const shownIssues=issues.filter(i=>!dis[i.k]);
  const SEV={red:'var(--danger)',amber:'var(--warn)',pink:'#E8629C',blue:'var(--brand-500)'};

  /* drawer content */
  const la=L.find(x=>x.id===selA);
  const drawer=()=>{
    if(tab==='insights'&&dw.tab==='issue'){ if(!issue) return <div className="wsd-empty">Select an issue to see why it matters and what to do about it.</div>;
      return <div className="wsd-sec">
        <div className="wsd-t">{issue.title}</div><span className="wspill amber">Needs attention</span>
        <div className="wsd-h">Why it matters</div><p>{issue.why}</p>
        {issue.aff && <React.Fragment><div className="wsd-h">{issue.affLabel}</div><div className="wschips">{issue.aff.map(n=><i key={n}>{n}</i>)}</div></React.Fragment>}
        <div className="wsd-h">Recommended action</div><p>{issue.desc}</p>
        <div className="wsd-acts"><button className="pri" onClick={issue.go}>{issue.act}</button>
          <button onClick={()=>{ setDis(p=>({...p,[issue.k]:true})); setIssue(null); }}>Dismiss</button></div>
      </div>; }
    if(tab==='assessments'){
      if(!la) return <div className="wsd-empty">Select an assessment row to see its details here.</div>;
      if(dw.tab==='notes') return <div className="wsd-sec"><div className="wsd-h">Notes</div>
        <TA v={la.assessNotes} set={v=>actions.edit(la.id,{assessNotes:v})} ph="Add notes for this assessment…"/></div>;
      if(dw.tab==='standards') return <div className="wsd-sec"><div className="wsd-h">Standards</div>
        {la.std?<div className="wschips"><i>{la.std}</i></div>:<p className="mut">No standard tagged on the linked {DS.label('lesson',false).toLowerCase()} yet.</p>}</div>;
      if(dw.tab==='resources') return <div className="wsd-sec"><div className="wsd-h">Linked {DS.label('lesson',false).toLowerCase()} resources</div>
        {(la.resources||[]).length?(la.resources||[]).map(r=><div key={r.id} className="wsres"><i>{r.type}</i><span>{r.name}</span></div>):<p className="mut">None attached yet.</p>}</div>;
      return <div className="wsd-sec">
        <div className="wsd-kind" style={{color:la.assessment==='summative'?'#8352C7':'var(--done)'}}>{la.assessment==='summative'?'\u25C6 Summative assessment':'\u25CF Formative check'}</div>
        <div className="wsd-t">{la.assessTitle||'Unnamed check'}</div>
        <div className="wsd-rows">
          <div><span>Type</span><b>{la.assessment==='summative'?'Unit assessment':'Quick check'}</b></div>
          <div><span>Linked {DS.label('lesson',false).toLowerCase()}</span><b className="lnk" onClick={()=>openLesson(la.id)}>{la.title||'Untitled'}</b></div>
          <div><span>Date</span><b>{fmtD(la.slot)}</b></div>
          <div><span>Duration</span><b>{la.dur?la.dur+' min':'\u2014'}</b></div>
        </div>
        <div className="wsd-h">Purpose</div><TA v={la.assessPurpose} set={v=>actions.edit(la.id,{assessPurpose:v})} ph="What this assessment measures…"/>
        <div className="wsd-h">Preparation status</div>
        <select className="wssel" value={(la.done&&la.done.assess)?'ready':'prog'} onChange={e=>actions.edit(la.id,{done:{...la.done,assess:e.target.value==='ready'}})}>
          <option value="prog">In progress</option><option value="ready">Prepared</option>
        </select>
        <div className="wsd-acts"><button className="pri" onClick={()=>{ openLesson(la.id); setSecs(p=>({...p,assess:true})); }}>Edit in {DS.label('lesson',false).toLowerCase()}</button>
          <button className="dngr" onClick={()=>{ actions.edit(la.id,{assessment:null,assessTitle:null,done:{...la.done,assess:false}}); setSelA(null); }}>Remove</button></div>
      </div>; }
    /* lessons drawer */
    if(dw.tab==='resources'){ const all=[...(u.resources||[]).map(r=>({...r,from:'On the '+DS.label('unit',false).toLowerCase()})),...L.flatMap(x=>(x.resources||[]).map(r=>({...r,from:x.title})))];
      return <div className="wsd-sec"><div className="wsd-h">All resources</div>
        {all.length?all.map((r,i)=><div key={r.id+i} className="wsres"><i>{r.type}</i><span>{r.name}</span><em>{r.from}</em></div>):<p className="mut">Nothing attached yet.</p>}</div>; }
    if(dw.tab==='standards') return <div className="wsd-sec"><div className="wsd-h">Unit standards</div>
      {(u.stds||[]).length?(u.stds||[]).map((st,i)=>{ const code=Array.isArray(st)?st[0]:st, txt=Array.isArray(st)?st[1]:'';
        return <div key={i} className={'wsstd'+(l&&l.std===code?' on':'')}><b>{code}</b>{txt&&<span>{txt}</span>}</div>; }):<p className="mut">No standards on this {DS.label('unit',false).toLowerCase()} yet — add them in Unit Plan.</p>}</div>;
    if(dw.tab==='ai') return <div className="wsd-sec"><div className="wsd-h">AI help</div><p className="mut">Ask for a hook, a differentiation idea, or an exit ticket for this {DS.label('lesson',false).toLowerCase()}. Coming with the assistant wave.</p></div>;
    if(!l) return <div className="wsd-sec">
      <div className="wsd-north" style={{'--uc':cv(s.c)}}><span className="lb">Essential question</span>
        <p>{(u.eqs&&u.eqs[0])||u.eq||<span className="mut">Not set yet — add it in Unit Plan to anchor every {DS.label('lesson',false).toLowerCase()}.</span>}</p></div>
      <p className="mut">Pick a {DS.label('lesson',false).toLowerCase()} from the list to see how it lines up with the unit.</p></div>;
    const objOk=!!(l.objective&&l.objective.trim()), stdOk=!!l.std, evOk=!!l.assessment;
    const allAligned=objOk&&stdOk&&evOk;
    const feeds=L.filter(x=>x.assessment==='summative'&&x.slot>=l.slot)[0]||L.filter(x=>x.assessment==='summative')[0];
    const align=[
      ['Objective',objOk,l.objective||'What students will learn — not stated yet','obj'],
      ['Standard',stdOk,l.std||'No standard tagged','std'],
      ['Evidence',evOk,l.assessment?(l.assessTitle||(l.assessment==='summative'?'Summative assessment':'Formative check')):'No check for understanding','assess'],
    ];
    const goSec=(sec)=>{ setTab('lessons'); if(sec!=='obj') setSecs(p=>({...p,[sec]:true})); };
    return <div className="wsd-sec ctx">
      <div className="wsd-north" style={{'--uc':cv(s.c)}}><span className="lb">Essential question</span>
        <p>{(u.eqs&&u.eqs[0])||u.eq||<span className="mut">Not set yet — add it in Unit Plan to anchor every {DS.label('lesson',false).toLowerCase()}.</span>}</p></div>
      <div className="wsd-h">Does this {DS.label('lesson',false).toLowerCase()} line up?</div>
      <div className="wsd-align">
        {align.map(([lab,ok,detail,sec])=><button key={lab} className={'algrow'+(ok?' ok':'')} title={ok?lab+' is set':'Missing — click to add'} onClick={()=>goSec(sec)}>
          <span className="tk">{ok?'✓':'!'}</span><span className="al-b"><b>{lab}</b><em>{detail}</em></span></button>)}
      </div>
      <p className={'wsd-note'+(allAligned?' ok':'')}>{allAligned
        ? 'Aligned — the objective, standard, and evidence point at the same learning.'
        : 'Strong '+DS.label('lesson',true).toLowerCase()+' say what students learn, which standard it serves, and how you\u2019ll know they got it.'}</p>
      <div className="wsd-h">Place in the arc</div>
      <div className="wsd-arc2">
        <div className="here">{DS.label('lesson',false)} {idx+1} of {L.length}</div>
        {idx>0 && <button className="step" onClick={()=>openLesson(L[idx-1].id)}><span className="dir">‹ Follows</span><span className="ti">{L[idx-1].title||'Untitled'}</span></button>}
        {idx<L.length-1 && <button className="step" onClick={()=>openLesson(L[idx+1].id)}><span className="dir">Sets up ›</span><span className="ti">{L[idx+1].title||'Untitled'}</span></button>}
      </div>
      {feeds && feeds.id!==l.id && <React.Fragment><div className="wsd-h">Builds toward</div>
        <button className="wsd-feeds" onClick={()=>{ setSelA(feeds.id); setTab('assessments'); setDw({open:true,tab:'details'}); }}>
          <span className="dm">◆</span><span className="ti">{feeds.assessTitle||'Unit assessment'}</span><em>{fmtD(feeds.slot)}</em></button></React.Fragment>}
      <div className="wsd-h">Unit resources</div>
      {(u.resources||[]).length?(u.resources||[]).map(r=><div key={r.id} className="wsres"><i>{r.type}</i><span>{r.name}</span></div>):<p className="mut">No {DS.label('unit',false).toLowerCase()}-level resources yet.</p>}
      <button className="wsd-open" onClick={()=>setTab('unitplan')}>Open {DS.label('unit',false).toLowerCase()} plan</button>
    </div>; };

  const steps=l&&PW.flowSteps(l.flowName);
  const per=l&&l.dur&&steps?Math.max(1,Math.round(l.dur/steps.length)):null;
  const passSt=(y)=> statusF==='all'?true
    : statusF==='taught'?y.status==='taught'
    : statusF==='missed'?!!(window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(y))
    : statusF==='thin'?(y.status!=='taught'&&PW.comp(y)<=2)
    : (y.status!=='taught'&&!(window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(y)));
  const passQ=(y)=>!q||(y.title||'').toLowerCase().includes(q.toLowerCase());
  const railL=L.filter(x=>passQ(x)&&passSt(x));
  const railData=scope==='unit'?[{u,rows:railL}]
    :state.units.filter(x=>!x.archived&&(subjR==='all'||x.sid===subjR)&&(unitR==='all'||x.id===unitR)).slice().sort((a,b)=>a.sid===b.sid?a.startSlot-b.startSlot:String(a.sid).localeCompare(String(b.sid)))
      .map(x=>({u:x,rows:x.lessons.filter(y=>passQ(y)&&passSt(y))})).filter(g=>g.rows.length);
  const dropLesson=(e,tu,ti)=>{ let did=''; try{ did=e.dataTransfer.getData('text/ws-lesson'); }catch(err){} if(!did) return; e.preventDefault(); e.stopPropagation();
    if(did===((l||{}).id)&&ti==null) return; actions.moveLessonTo(did,tu.id,ti); setCurUid(tu.id===uid?null:tu.id); setCur(did); };
  const allowDrop=(e)=>{ try{ if([...e.dataTransfer.types].includes('text/ws-lesson')) e.preventDefault(); }catch(err){} };
  const subjOrder=(DS.SUBJECT_ORDER&&DS.SUBJECT_ORDER.length?DS.SUBJECT_ORDER:[...new Set(state.units.map(x=>x.sid))]);
  const unitGroups=subjOrder.map(sid=>({ sid, s:DS.SUBJECTS[sid]||{}, units:state.units.filter(x=>!x.archived&&x.sid===sid&&(!q||(x.name||'').toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>a.startSlot-b.startSlot) })).filter(g=>g.units.length);
  const pctTaught=Math.round(taught/Math.max(1,L.length)*100);
  const totalRes=L.reduce((a,x)=>a+((x.resources||[]).length),0)+((u.resources||[]).length);
  const wkLeft=Math.max(0,Math.ceil(daysLeft/5));
  const eqs=Array.isArray(u.eqs)?u.eqs:(u.eq?[u.eq]:[]);
  const setEqs=(arr)=>edU({eqs:arr, eq:arr[0]||''});
  const arcPhases=(()=>{ const fw=window.FW&&window.FW.get&&window.FW.get(u.fw); if(fw&&fw.arc&&fw.arc.length) return fw.arc;
    const df=u.defaultFlow&&PW.flowSteps&&PW.flowSteps(u.defaultFlow); if(df&&df.length) return df;
    return ['Introduce & Explore','Model the Strategy','Guided Practice','Apply Independently','Extend & Connect','Assess & Reflect']; })();
  const arcDone=Math.round(taught/Math.max(1,L.length)*arcPhases.length);
  const nextTeach=L.find(x=>x.status!=='taught'&&x.slot>=PW.TODAY_SLOT)||L.find(x=>x.status!=='taught')||L[0];
  const share=()=>{ try{ navigator.clipboard&&navigator.clipboard.writeText((location.href.split('#')[0])+'#unit='+u.id); }catch(e){} if(actions.toast) actions.toast('Share link copied'); };
  const doPrint=()=>{ if(actions.toast) actions.toast('Preparing print…'); setTimeout(()=>window.print(),120); };
  const teachNext=()=>{ if(!nextTeach) return; if(actions.onTeach){ actions.onTeach(nextTeach.id); return; } openLesson(nextTeach.id); if(actions.toast) actions.toast('Opened '+(nextTeach.title||'next '+DS.label('lesson',false).toLowerCase())); };
  return <div className={'ph-wswrap mode-'+wsMode}>
    {wsMode==='modal' && <div className="ph-ws-scrim" onClick={()=>onClose&&onClose()}></div>}
    <div className="ph-ws" ref={rootRef} data-mode={wsMode} data-dens={dens} style={{'--uc':cv(s.c)}} data-screen-label="Hub — Unit workspace">
    <header className="ph-wsh">
      {wsMode==='full'
        ? <button className="back" title={'Back to all '+DS.label('unit',true).toLowerCase()} onClick={onClose}>‹ All {DS.label('unit',true)}</button>
        : <span className="sd" style={{background:cv(s.c)}}></span>}
      {wsMode==='full' && <span className="sd" style={{background:cv(s.c)}}></span>}
      <h1>{u.name}</h1><span className="sj">{s.full||u.sid}</span>
      <span className="grow"></span>
      <span className="tcount">{taught} of {L.length} taught</span><Bar v={taught} t={L.length}/>
      <span className="ends">Ends {fmtD(u.endSlot)}</span>
      <span className={'wspill '+(pace==='On track'||pace==='Done'?'green':'red')}>{pace}</span>
      <button className="wsic" title="Share a link to this plan" onClick={share}>↗</button>
      <span className="hmenu">
        <button className="dots" title="Duplicate or archive this unit" onClick={()=>setMenu(m=>!m)}>⋯</button>
        {menu && <span className="pop">
          <label className="mrow" title="Move the whole unit — lessons follow, later units bump"><span>Starts</span>{dated
            ? <input type="date" defaultValue={(PW.SLOTS[u.startSlot]||{}).iso} onChange={(e)=>{ const i2=PW.SLOTS.findIndex(s2=>s2.iso===e.target.value); if(i2>=0) actions.setUnitStart(u.id,i2); }}/>
            : <input type="number" min="1" defaultValue={u.startSlot+1} onChange={(e)=>{ const v2=Number(e.target.value); if(v2>0) actions.setUnitStart(u.id,v2-1); }}/>}
          </label>
          {actions.duplicateUnit && <button onClick={()=>{ setMenu(false); actions.duplicateUnit(u.id); }}>Duplicate</button>}
          {actions.archiveUnit && <button onClick={()=>{ setMenu(false); actions.archiveUnit(u.id); onClose(); }}>Archive</button>}
        </span>}
      </span>
      <button className="insbtn" title="What needs attention in this unit" onClick={()=>setTab('insights')}>Insights</button>
      <button className="wsic" title={wsMode==='full'?'Collapse to a window':'Expand to full screen'} onClick={()=>setWsMode(m=>m==='full'?'modal':'full')}>{wsMode==='full'?'⤡':'⤢'}</button>
      {wsMode==='modal' && <button className="wsic close" title="Close" onClick={onClose}>×</button>}
    </header>
    <nav className="ph-wstabs">
      {[['unitplan','Unit Plan'],['lessons',DS.label('lesson',true)],['assessments','Assessments'],['refine','Refine'],['insights','Insights']].map(([k,lab2])=>
        <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{lab2}</button>)}
      <span className="grow"></span>
    </nav>
    <div className="ph-wsb nodr" data-tab={tab} data-rail={railC?'1':'0'}>
      <aside className={'ph-wsrail'+(selIds.length?' hassel':'')}>
        <div className="rq">{!railC && <input value={q} placeholder={'Search '+DS.label('lesson',true).toLowerCase()+'…'} onChange={e=>setQ(e.target.value)}/>}
          <button className="railc" title={railC?'Expand the lesson list':'Collapse the list to numbers only'} onClick={()=>setRailC(v=>!v)}>{railC?'›':'‹'}</button></div>
        {!railC && <div className="wsrview">
          <span className="ph-uiseg">{[['units',DS.label('unit',true)],['lessons',DS.label('lesson',true)]].map(([k,lab3])=><button key={k} className={railView===k?'on':''} title={k==='units'?('All your '+DS.label('unit',true).toLowerCase()+', by '+DS.label('subject',false).toLowerCase()):('The '+DS.label('lesson',true).toLowerCase()+' inside a '+DS.label('unit',false).toLowerCase())} onClick={()=>setRailView(k)}>{lab3}</button>)}</span>
        </div>}
        {railView==='units' && <div className="wsr-units">
          {unitGroups.map(g=><div key={g.sid} className="wsr-sgrp">
            {!railC && <div className="wsr-sh" style={{'--sc':cv(g.s.c)}}><span className="dot"></span>{g.s.full||g.sid}</div>}
            {g.units.map(u2=>{ const tg=u2.lessons.filter(x=>x.status==='taught').length; const isCur=u2.id===u.id;
              return <button key={u2.id} className={'wsr-unit'+(isCur?' on':'')} style={{'--sc':cv(g.s.c)}} title={u2.name+' \u2014 open its plan'}
                onClick={()=>{ setCurUid(u2.id===uid?null:u2.id); if(u2.lessons[0]) setCur(u2.lessons[0].id); }}>
                <span className="ud"></span><span className="t">{u2.name}</span>{!railC && <span className="ct">{tg}/{u2.lessons.length}</span>}
              </button>; })}
          </div>)}
          {!unitGroups.length && <div className="rmeta">No {DS.label('unit',true).toLowerCase()} match.</div>}
        </div>}
        {!railC && railView==='lessons' && <div className="wsrscope">
          <span className="ph-uiseg">{[['unit','This unit'],['all','All units']].map(([k,lab3])=><button key={k} className={scope===k?'on':''} title={k==='unit'?'Only this unit’s lessons':'Every lesson across all your units — the whole plan in one rail'} onClick={()=>setScope(k)}>{lab3}</button>)}</span>
          <select className="wsf" value={statusF} title="Filter by status" onChange={e=>setStatusF(e.target.value)}>
            {[['all','All'],['planned','Planned'],['taught','Taught'],['missed','Missed'],['thin','Needs work']].map(([k,lab3])=><option key={k} value={k}>{lab3}</option>)}
          </select>
          <select className="wsf" value={subjR} title={'See '+DS.label('lesson',true).toLowerCase()+' from one '+DS.label('subject',false).toLowerCase()} onChange={e=>{ const v=e.target.value; setSubjR(v); setUnitR('all');
            if(scope==='unit'&&v!=='all'&&u.sid!==v){ const nu=state.units.find(x=>!x.archived&&x.sid===v); if(nu){ setCurUid(nu.id===uid?null:nu.id); if(nu.lessons[0]) setCur(nu.lessons[0].id); } } }}>
            <option value="all">All {DS.label('subject',true).toLowerCase()}</option>
            {[...new Set(state.units.filter(x=>!x.archived).map(x=>x.sid))].map(s2=><option key={s2} value={s2}>{(DS.SUBJECTS[s2]||{}).full||s2}</option>)}
          </select>
          <select className="wsf" value={scope==='unit'?u.id:unitR} title={scope==='unit'?('Jump to another '+DS.label('unit',false).toLowerCase()):('See one '+DS.label('unit',false).toLowerCase()+'’s '+DS.label('lesson',true).toLowerCase())} onChange={e=>{ const v=e.target.value;
            if(scope==='unit'){ if(v&&v!==u.id){ setCurUid(v===uid?null:v); const nu=state.units.find(x=>x.id===v); if(nu&&nu.lessons[0]) setCur(nu.lessons[0].id); } } else setUnitR(v); }}>
            {scope==='all'&&<option value="all">All {DS.label('unit',true).toLowerCase()}</option>}
            {state.units.filter(x=>!x.archived&&(subjR==='all'||x.sid===subjR)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>}
        {!railC && railView==='lessons' && scope==='unit' && <div className="rmeta"><span>{railL.length} {DS.label('lesson',true).toLowerCase()}</span><em>By sequence</em></div>}
        {railView==='lessons' && railData.map(g=><div key={g.u.id} className="wsrgrp" onDragOver={allowDrop} onDrop={(e)=>dropLesson(e,g.u,null)}>
          {scope==='all' && !railC && <div className="wsl-uh" title={'Switch to '+g.u.name+' — drop a lesson here to move it into this unit'}
            onClick={()=>{ setCurUid(g.u.id===uid?null:g.u.id); const f0=g.rows[0]; if(f0) setCur(f0.id); }}>
            <span className="ud" style={{background:cv((DS.SUBJECTS[g.u.sid]||{}).c)}}></span><b>{g.u.name}</b><em>{g.rows.length}</em></div>}
          {g.rows.map((x)=>{ const i=g.u.lessons.indexOf(x); const isCur=l&&x.id===l.id&&g.u.id===u.id;
            return <div key={x.id} role="button" tabIndex={0} draggable={!railC}
              className={'wsl'+(isCur?' on':'')+(selIds.includes(x.id)?' chk':'')}
              onDragStart={(e)=>{ try{ e.dataTransfer.setData('text/ws-lesson',x.id); e.dataTransfer.effectAllowed='move'; }catch(err){} }}
              onDragOver={allowDrop} onDrop={(e)=>dropLesson(e,g.u,i)}
              onClick={()=>{ if(g.u.id!==u.id) setCurUid(g.u.id===uid?null:g.u.id); setCur(x.id); if(tab!=='lessons'&&tab!=='assessments') setTab('lessons'); }}>
              {!railC && <input type="checkbox" className="ck" checked={selIds.includes(x.id)} title="Select for bulk actions"
                onClick={(e)=>e.stopPropagation()} onChange={()=>setSelIds(p=>p.includes(x.id)?p.filter(z=>z!==x.id):[...p,x.id])}/>}
              <span className="n">{i+1}</span><span className="t">{x.title||'Untitled'}</span>
              <span className="d">{fmtD(x.slot)}</span>
              <span className={'mk '+(x.assessment==='summative'?'sum':x.status==='taught'?'ok':x.status==='today'?'today':'')}>{x.assessment==='summative'?'◆':x.status==='taught'?'✓':''}</span>
            </div>; })}
        </div>)}
        {selIds.length>0 && <div className="wsbulk">
          <b>{selIds.length} picked</b>
          <button title="Move each to the next open day" onClick={()=>selIds.forEach(id2=>actions.reschedule(id2))}>Bump</button>
          <button title="Mark them all taught" onClick={()=>selIds.forEach(id2=>actions.edit(id2,{status:'taught'}))}>{'✓'}</button>
          <select value="" title="Apply a flow template to every selected lesson" onChange={(e)=>{ const v=e.target.value; if(!v) return; selIds.forEach(id2=>actions.edit(id2,{flowName:v})); e.target.value=''; }}>
            <option value="">{'Flow…'}</option>
            {PW.FLOW_GROUPS.map(g2=><optgroup key={g2.label} label={g2.label}>{g2.flows.map(f=><option key={f}>{f}</option>)}</optgroup>)}
          </select>
          <button className="dngr" title="Delete every selected lesson" onClick={()=>{ selIds.forEach(id2=>actions.deleteLesson(id2)); setSelIds([]); }}>Del</button>
          <button title="Clear selection" onClick={()=>setSelIds([])}>{'×'}</button>
        </div>}
      </aside>
      <main className="ph-wsc">
        {tab==='lessons' && (!l?<div className="wsd-empty">No {DS.label('lesson',true).toLowerCase()} yet — add days to this {DS.label('unit',false).toLowerCase()} on the timeline.</div>:<div className="wsed">
          <div className="wsctx" style={{'--uc':cv(s.c)}}>
            <div className="eq"><span className="lb">Essential question</span>
              <p>{eqs.length?eqs[0]:<span className="mut">Not set — add it in Unit Plan to anchor every {DS.label('lesson',false).toLowerCase()}.</span>}</p></div>
            <div className="algn">{[['Objective',!!(l.objective&&l.objective.trim()),'obj'],['Standard',!!l.std,'std'],['Evidence',!!l.assessment,'assess']].map(([lab3,ok,sec])=>
              <button key={lab3} className={'atk'+(ok?' ok':'')} title={ok?lab3+' is set':'Missing — opens its section below'} onClick={()=>{ if(sec!=='obj') setSecs(p=>({...p,[sec]:true})); }}><span className="tk">{ok?'✓':'!'}</span>{lab3}</button>)}</div>
          </div>
          <div className="wsctx-arc">
            <span className="here">{DS.label('lesson',false)} {idx+1} of {L.length}</span>
            {idx>0 && <button title={'Follows: '+(L[idx-1].title||'Untitled')} onClick={()=>openLesson(L[idx-1].id)}>‹ {L[idx-1].title||'Untitled'}</button>}
            {idx<L.length-1 && <button title={'Sets up: '+(L[idx+1].title||'Untitled')} onClick={()=>openLesson(L[idx+1].id)}>{L[idx+1].title||'Untitled'} ›</button>}
            {(()=>{ const feeds=L.filter(x=>x.assessment==='summative'&&x.slot>=l.slot)[0]||L.filter(x=>x.assessment==='summative')[0]; return feeds&&feeds.id!==l.id?<button className="feeds" title="Jump to this assessment" onClick={()=>{ setTab('assessments'); setSelA(feeds.id); }}>◆ Builds toward {feeds.assessTitle||'Unit assessment'}</button>:null; })()}
          </div>
          <div className="wseyebrow">{DS.label('lesson',false).toUpperCase()} {idx+1} OF {L.length} · {fmtD(l.slot)} · {u.name}{l.std?<i className="stdchip">{l.std}</i>:null}
            <span className="grow"></span>
            <span className="hmenu">
              <button className="dots" title="Lesson actions — move, duplicate, more" onClick={()=>{ setLmenu(m=>!m); setMoveOpen(false); }}>⋯</button>
              {lmenu && <span className="pop">
                <button onClick={(e)=>{ setLmenu(false); setDatePop({id:l.id,x:e.clientX,y:e.clientY}); }}>{'Move to date…'}</button>
                <button title="Next open school day — later lessons ripple" onClick={()=>{ setLmenu(false); actions.reschedule(l.id); }}>Bump to next open day</button>
                <button onClick={()=>{ setLmenu(false); actions.insert(u.id,idx+1,(nid)=>{ actions.edit(nid,{title:(l.title||'Untitled')+' (copy)',objective:l.objective,dur:l.dur,flowName:l.flowName,std:l.std,diff:l.diff,notes:l.notes,resources:(l.resources||[]).map((r,ri2)=>({...r,id:'R'+Date.now().toString(36)+ri2})),resN:(l.resources||[]).length,done:{...l.done}}); setCur(nid); }); }}>Duplicate</button>
                <button onClick={()=>setMoveOpen(v=>!v)}>{'Move to another unit…'}</button>
                {moveOpen && state.units.filter(x=>!x.archived&&x.id!==u.id).map(x=><button key={x.id} className="sub" onClick={()=>{ setLmenu(false); setMoveOpen(false); actions.moveLessonTo(l.id,x.id,null); setCurUid(x.id===uid?null:x.id); }}>{'→ '+x.name}</button>)}
                <button title="Keeps its plan, loses its date" onClick={()=>{ setLmenu(false); const nx=L[idx+1]||L[idx-1]; actions.lessonToBench(l.id); setCur(nx?nx.id:null); }}>Send to Unscheduled</button>
                <button onClick={()=>{ setLmenu(false); ed({status:l.status==='taught'?'planned':'taught'}); }}>{l.status==='taught'?'Mark planned':'Mark taught'}</button>
                <button className="dngr" onClick={()=>{ setLmenu(false); const nx=L[idx+1]||L[idx-1]; actions.deleteLesson(l.id); setCur(nx?nx.id:null); }}>Delete lesson</button>
              </span>}
            </span>
            <select className={'wsstatus'+(l.status==='taught'?' ok':'')} value={l.status==='taught'?'taught':'planned'}
              onChange={e=>ed({status:e.target.value==='taught'?'taught':(l.slot===PW.TODAY_SLOT?'today':'planned')})}>
              <option value="taught">✓ Taught</option><option value="planned">Planned</option>
            </select>
          </div>
          <input className="wstitle" value={l.title||''} placeholder="Untitled lesson" onChange={e=>ed({title:e.target.value})}/>
          <div className="wslbl">{(window.FW&&window.FW.get)?window.FW.get(u.fw).lessonObjective:'Objective'}</div>
          <textarea className="wsobj" value={l.objective||''} placeholder="I can…" onChange={e=>ed({objective:e.target.value,done:{...l.done,obj:!!e.target.value}})}></textarea>
          <div className="wsfields">
            <label><span>Date</span><button type="button" className="ro datebtn" title="Move this lesson to another day" onClick={(e)=>setDatePop({id:l.id,x:e.clientX,y:e.clientY})}>{fmtD(l.slot)}</button></label>
            <label><span>Duration</span><input type="number" min="5" step="5" value={l.dur||''} placeholder="—" onChange={e=>{ const v=Number(e.target.value); ed({dur:v>0?v:null}); }}/></label>
            <label><span>Flow template</span>
              <select value={l.flowName||''} onChange={e=>{ const v=e.target.value||null; ed({flowName:v,done:{...l.done,flow:!!v}}); }}>
                <option value="">None yet…</option>
                {PW.FLOW_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.flows.map(f=><option key={f}>{f}</option>)}</optgroup>)}
              </select></label>
          </div>
          {steps && <React.Fragment><div className="wslbl">{DS.label('lesson',false)} sequence{l.dur?' ('+l.dur+' min)':''}</div>
            <div className="wsseq">{steps.map((st,i2)=><React.Fragment key={st+i2}>{i2>0&&<i>›</i>}<span className="stp"><b>{st}</b>{per&&<em>{per} min</em>}</span></React.Fragment>)}</div></React.Fragment>}
          <div className="wsecs">
            <Sec secs={secs} setSecs={setSecs} id="std" name="Standards" sum={l.std?'1 standard':'\u2014'}>
              <input className="wsin" value={l.std||''} placeholder="e.g. 4.NBT.4" onChange={e=>ed({std:e.target.value})}/>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="res" name="Resources" sum={((l.resources||[]).length||'No')+' items'}>
              {(l.resources||[]).map((r,ri)=><div key={r.id} className="wsres" style={{'--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}} title="Hover to preview · click to open"
                onMouseEnter={e=>setResPrev({r,x:e.clientX,y:e.clientY})} onMouseMove={e=>setResPrev(p=>p&&p.r===r?{r,x:e.clientX,y:e.clientY}:p)} onMouseLeave={()=>setResPrev(null)}
                onClick={()=>{ if(r.url) window.open(r.url,'_blank','noopener'); }}><i>{r.type}</i><span>{r.name}</span>
                <span className="ord">
                  <button title="Move up" disabled={ri===0} onClick={()=>{ const a=(l.resources||[]).slice(); const [m]=a.splice(ri,1); a.splice(ri-1,0,m); ed({resources:a}); }}>↑</button>
                  <button title="Move down" disabled={ri===(l.resources||[]).length-1} onClick={()=>{ const a=(l.resources||[]).slice(); const [m]=a.splice(ri,1); a.splice(ri+1,0,m); ed({resources:a}); }}>↓</button>
                </span>
                <button className="rmore" title="More — open, edit, remove" onClick={(e)=>{ e.stopPropagation(); window.openResMenu&&window.openResMenu({res:r,x:e.clientX,y:e.clientY,
                  edit:()=>window.openComposer&&window.openComposer({kind:'lesson',id:l.id,field:'resources',subject:u.sid,unitId:u.id,unitName:u.name,lessonTitle:l.title||'This lesson',lessonId:l.id,edit:r,
                    onSave:(list)=>{ const a=(l.resources||[]).slice(); const i=a.findIndex(x=>x.id===r.id); if(i<0) return; const f0=list[0]; if(f0) a[i]={...a[i],name:f0.name,type:f0.type,url:f0.url,note:f0.note,bg:f0.bg}; const ex=list.slice(1); if(ex.length) a.splice(i+1,0,...ex.map((x,k)=>({id:'R'+Date.now().toString(36)+k,...x}))); ed({resources:a}); }}),
                  remove:()=>actions.removeRes(l.id,r.id) }); }}>⋯</button></div>)}
              <button className="wsaddbtn" title="Add a resource or note — upload, link, video, draw, or write" onClick={()=>window.openComposer&&window.openComposer({kind:'lesson',id:l.id,field:'resources',subject:u.sid,unitId:u.id,unitName:u.name,lessonTitle:l.title||'This lesson',lessonId:l.id})}>+ Add resource or note</button>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="assess" name="Assessment" sum={l.assessment?(l.assessment==='summative'?'1 summative':'1 formative check'):'\u2014'}>
              <div className="wsrow2">
                <select className="wssel" value={l.assessment||''} onChange={e=>{ const v=e.target.value||null;
                  ed({assessment:v,assessTitle:v?(l.assessTitle||(v==='summative'?'Unit assessment':'Exit ticket')):null,done:{...l.done,assess:v?!!(l.done&&l.done.assess):false}}); }}>
                  <option value="">None</option><option value="formative">Formative check</option><option value="summative">Summative</option>
                </select>
                {l.assessment && <input className="wsin" value={l.assessTitle||''} placeholder="Name the check…" onChange={e=>ed({assessTitle:e.target.value})}/>}
              </div>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="diff" name="Differentiation" sum={(l.diff?'Notes':'')+((l.diffRes||[]).length?((l.diff?' · ':'')+(l.diffRes||[]).length+' resources'):(l.diff?'':'—'))}>
              <TA v={l.diff} set={v=>ed({diff:v,done:{...l.done,diff:!!v||!!(l.diffRes||[]).length}})} ph="Support + stretch — who needs what today?"/>
              <div className="wslbl">Differentiation resources</div>
              {(l.diffRes||[]).map((r,ri)=><div key={r.id} className="wsres" style={{'--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}} title="Hover to preview · click to open"
                onMouseEnter={e=>setResPrev({r,x:e.clientX,y:e.clientY})} onMouseMove={e=>setResPrev(p=>p&&p.r===r?{r,x:e.clientX,y:e.clientY}:p)} onMouseLeave={()=>setResPrev(null)}
                onClick={()=>{ if(r.url) window.open(r.url,'_blank','noopener'); }}><i>{r.type}</i><span>{r.name}</span>
                <span className="ord">
                  <button title="Move up" disabled={ri===0} onClick={(e)=>{ e.stopPropagation(); const a=(l.diffRes||[]).slice(); const [m]=a.splice(ri,1); a.splice(ri-1,0,m); ed({diffRes:a}); }}>↑</button>
                  <button title="Move down" disabled={ri===(l.diffRes||[]).length-1} onClick={(e)=>{ e.stopPropagation(); const a=(l.diffRes||[]).slice(); const [m]=a.splice(ri,1); a.splice(ri+1,0,m); ed({diffRes:a}); }}>↓</button>
                </span>
                <button className="rmore" title="More — open, edit, remove" onClick={(e)=>{ e.stopPropagation(); window.openResMenu&&window.openResMenu({res:r,x:e.clientX,y:e.clientY,
                  edit:()=>window.openComposer&&window.openComposer({kind:'lesson',id:l.id,field:'diffRes',subject:u.sid,unitId:u.id,unitName:u.name,lessonTitle:l.title||'This lesson',lessonId:l.id,sectionLabel:'Differentiation',edit:r,
                    onSave:(list)=>{ const a=(l.diffRes||[]).slice(); const i=a.findIndex(x=>x.id===r.id); if(i<0) return; const f0=list[0]; if(f0) a[i]={...a[i],name:f0.name,type:f0.type,url:f0.url,note:f0.note,bg:f0.bg}; const ex=list.slice(1); if(ex.length) a.splice(i+1,0,...ex.map((x,k)=>({id:'DR'+Date.now().toString(36)+k,...x}))); ed({diffRes:a}); }}),
                  remove:()=>ed({diffRes:(l.diffRes||[]).filter(x=>x.id!==r.id)}) }); }}>⋯</button></div>)}
              <button className="wsaddbtn" title="Add a support/stretch resource — upload, link, video, draw, or write" onClick={()=>window.openComposer&&window.openComposer({kind:'lesson',id:l.id,field:'diffRes',subject:u.sid,unitId:u.id,unitName:u.name,lessonTitle:l.title||'This lesson',lessonId:l.id,sectionLabel:'Differentiation'})}>+ Add differentiation resource</button>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="notes" name="Notes" sum={l.notes?'Added':'Add teacher notes…'}>
              <TA v={l.notes} set={v=>ed({notes:v})} ph="Anything future-you should know."/>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="builds" name="Builds toward" sum={l.builds||'\u2014'}>
              <input className="wsin" value={l.builds||''} placeholder="e.g. Unit Assessment — Add & Subtract" onChange={e=>ed({builds:e.target.value})}/>
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="fwf" name={'Framework fields'+((window.FW&&window.FW.get)?' — '+window.FW.get(u.fw).short:'')} sum={(window.FW&&window.FW.get&&(window.FW.get(u.fw).lessonFields||[]).length)?(window.FW.get(u.fw).lessonFields.length+' fields'):'None for this framework'}>
              {(window.FW&&window.FW.get&&window.PHW)?(window.FW.get(u.fw).lessonFields||[]).map(fd=><div key={fd.k} className="wsfwf">
                <window.PHW.Field def={fd} value={(l.fwData||{})[fd.k]} unit={u} dated={dated} onChange={(v)=>actions.editLessonFw&&actions.editLessonFw(l.id,{[fd.k]:v})}/>
              </div>):<p className="mut">This framework adds no per-{DS.label('lesson',false).toLowerCase()} fields.</p>}
            </Sec>
            <Sec secs={secs} setSecs={setSecs} id="prep" name="Teacher preparation" sum={l.prep?'Added':'What I need to prepare'}>
              <TA v={l.prep} set={v=>ed({prep:v})} ph="Copies, materials, tech to set up…"/>
            </Sec>
          </div>
        </div>)}
        {tab==='assessments' && <div className="wsed">
          <div className="wseyebrow">ASSESSMENT ARC<span className="grow"></span><span className="lg"><i style={{background:'var(--done)'}}></i> Formative <i className="dm"></i> Summative</span></div>
          <div className="wsarc">{L.map(x=><button key={x.id} title={(x.assessTitle||x.title||'')+' \u00B7 '+fmtD(x.slot)}
            className={'am'+(x.assessment==='summative'?' sum':x.assessment?' frm':'')+(x.id===selA?' sel':'')}
            onClick={()=>{ if(x.assessment) setSelA(x.id); }}></button>)}</div>
          {selA && (()=>{ const la=L.find(x=>x.id===selA&&x.assessment); if(!la) return null;
            return <div className="wsadet">
              <div className="h"><span className="kind" style={{color:la.assessment==='summative'?'#8352C7':'var(--done)'}}>{la.assessment==='summative'?'◆ Summative assessment':'● Formative check'}</span>
                <b>{la.assessTitle||'Unnamed check'}</b><span className="grow"></span><button className="x" title="Close" onClick={()=>setSelA(null)}>×</button></div>
              <div className="rows">
                <div><span>Linked {DS.label('lesson',false).toLowerCase()}</span><b className="lnk" onClick={()=>openLesson(la.id)}>{la.title||'Untitled'}</b></div>
                <div><span>Date</span><b>{fmtD(la.slot)}</b></div>
                <div><span>Standard</span><b>{la.std||'—'}</b></div>
                <div><span>Duration</span><b>{la.dur?la.dur+' min':'—'}</b></div>
              </div>
              <div className="wslbl">Purpose</div>
              <textarea className="wsta" value={la.assessPurpose||''} placeholder="What this assessment measures…" onChange={e=>actions.edit(la.id,{assessPurpose:e.target.value})}></textarea>
              <div className="wslbl">Notes</div>
              <textarea className="wsta" value={la.assessNotes||''} placeholder="Notes for this assessment…" onChange={e=>actions.edit(la.id,{assessNotes:e.target.value})}></textarea>
              <div className="acts"><button className="pri" onClick={()=>{ openLesson(la.id); setSecs(p=>({...p,assess:true})); }}>Edit in {DS.label('lesson',false).toLowerCase()}</button>
                <select className="wssel" value={(la.done&&la.done.assess)?'ready':'prog'} onChange={e=>actions.edit(la.id,{done:{...la.done,assess:e.target.value==='ready'}})}><option value="prog">In progress</option><option value="ready">Prepared</option></select></div>
            </div>; })()}
          {[['formative','Formative Checks'],['summative','Summative Assessments']].map(([k,head])=>{ const rows=aL.filter(x=>x.assessment===k);
            return <div key={k} className="wsagrp">
              <h3>{head}</h3>
              <div className="wstable">
                <div className="tr th"><span>Assessment</span><span>Type</span><span>Linked {DS.label('lesson',false).toLowerCase()}</span><span>Date</span><span>Standards</span><span>Status</span></div>
                {rows.map(x=><div key={x.id} className={'tr'+(x.id===selA?' sel':'')} onClick={()=>setSelA(x.id)}>
                  <span className="nm"><i className={k==='summative'?'dm':'df'}></i>{x.assessTitle||'Unnamed check'}</span>
                  <span>{k==='summative'?'Unit assessment':'Quick check'}</span>
                  <span className="lnk" onClick={e=>{ e.stopPropagation(); openLesson(x.id); }}>{x.title||'Untitled'}</span>
                  <span>{fmtD(x.slot)}</span><span>{x.std||'\u2014'}</span>
                  <span><i className={'wspill '+((x.done&&x.done.assess)?'green':'amber')}>{(x.done&&x.done.assess)?'\u2713 Prepared':'In progress'}</i></span>
                </div>)}
                {!rows.length && <div className="tr empty">None yet.</div>}
              </div>
              <select className="wsadd" value="" onChange={e=>{ const id2=e.target.value; if(!id2) return;
                actions.edit(id2,{assessment:k,assessTitle:k==='summative'?'Unit assessment':'Exit ticket'}); setSelA(id2); }}>
                <option value="">+ Add {k==='summative'?'summative assessment':'formative check'} to a {DS.label('lesson',false).toLowerCase()}…</option>
                {L.filter(x=>!x.assessment).map(x=><option key={x.id} value={x.id}>{(L.indexOf(x)+1)+' \u00B7 '+(x.title||'Untitled')}</option>)}
              </select>
            </div>; })}
        </div>}
        {tab==='insights' && <div className="wsed">
          <div className="wseyebrow">INSIGHTS</div>
          <div className="wsums">
            <div className="wsum"><span>Pacing</span><b className={pace==='Behind'?'bad':'good'}>{pace}</b><em>{taught} of {L.length} taught</em><Bar v={taught} t={L.length}/></div>
            <div className="wsum"><span>{DS.label('lesson',true)} remaining</span><b>{remaining}</b><em>{daysLeft} day{daysLeft===1?'':'s'} left</em></div>
            <div className="wsum"><span>Assessments prepared</span><b>{aPrep} of {aL.length}</b><Bar v={aPrep} t={aL.length} c="var(--warn)"/></div>
            <div className="wsum"><span>Standards covered</span><b>{stdsCov} of {stdsTotal||stdsCov}</b><Bar v={stdsCov} t={stdsTotal||stdsCov}/></div>
            <div className="wsum"><span>Resources missing</span><b className={resMiss.length?'bad':''}>{resMiss.length}</b><em>{resMiss.length?('Across '+resMiss.length+' '+lessonWord(resMiss.length)):'All set'}</em></div>
          </div>
          <h3 className="wsih">Actionable insights</h3><p className="mut">Issues that may impact your {DS.label('unit',false).toLowerCase()} or students.</p>
          {shownIssues.map(is=><div key={is.k} className={'wsissue'+(issue&&issue.k===is.k?' sel':'')} style={{'--ic':SEV[is.sev]}} onClick={()=>setIssue(cur=>cur&&cur.k===is.k?null:is)}>
            <span className="bar"></span>
            <div className="bd"><b>{is.title}</b><p>{is.desc}</p>{issue&&issue.k===is.k&&<div className="why"><span className="wlb">Why it matters</span><p>{is.why||is.desc}</p></div>}</div>
            {is.aff && <div className="aff"><span>{is.affLabel}</span><div className="wschips">{is.aff.map(n=><i key={n}>{n}</i>)}</div></div>}
            {is.chip && <div className="aff"><span>Assessment</span><i className="achip">◆ {is.chip}</i></div>}
            <div className="acts"><button className="pri" onClick={e=>{ e.stopPropagation(); is.go(); }}>{is.act}</button>
              <button onClick={e=>{ e.stopPropagation(); setDis(p=>({...p,[is.k]:true})); }}>Dismiss</button></div>
          </div>)}
          {!shownIssues.length && <div className="wsgreat"><b>Great progress!</b><p>You’re on track to finish by {fmtD(u.endSlot)}. Keep preparing upcoming {lessonWord(2)} and assessments to stay ahead.</p></div>}
        </div>}
        {tab==='refine' && <div className="wsed wide">
          <div className="wseyebrow">REFINE — EVERY {DS.label('lesson',false).toUpperCase()} AS A ROW, ONE FIELD AT A TIME</div>
          {window.PHUnits&&window.PHUnits.Table?<window.PHUnits.Table u={u} dated={dated} actions={actions}/>:<p className="mut">Refine table unavailable.</p>}
        </div>}
        {tab==='unitplan' && <div className="wsed">
          <div className="wsup-nav">{[['over','Overview'],['s1','Stage 1 \u00B7 Desired Results'],['s2','Stage 2 \u00B7 Evidence'],['s3','Stage 3 \u00B7 Learning Plan'],['design','Framework designer']].map(([k,lab2])=>
            <button key={k} className={upSec===k?'on':''} onClick={()=>setUpSec(k)}>{lab2}</button>)}</div>
          {upSec==='over' && <div className="wsdoc">
            <div className="wsover-top">
              <div className="wsring" style={{'--p':pctTaught,'--uc':cv(s.c)}} title={pctTaught+'% of lessons taught'}><span className="pc">{pctTaught}%</span><span className="lb">Progress</span></div>
              <div className="wsstrip">
                <div className="wsum st-taught"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h7v15H4zM13 5h7v15h-7z"/></svg></span><b>{taught}/{L.length}</b><span className="cl">{DS.label('lesson',true).toLowerCase()} taught</span></div>
                <div className="wsum st-remain"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><b>{wkLeft}w</b><span className="cl">remaining</span></div>
                <div className="wsum st-std"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 20l1-5.8L3.5 9.2l5.9-.9z"/></svg></span><b>{stdsCov}/{stdsTotal||stdsCov}</b><span className="cl">standards</span></div>
                <div className={'wsum st-gaps'+(missedN?' hot':'')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span><b className={missedN?'bad':''}>{missedN}</b><span className="cl">gaps</span></div>
                <div className="wsum st-res"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6l2 2h10v11H3z"/></svg></span><b>{totalRes}</b><span className="cl">resources</span></div>
                <div className={'wsum st-pace'+(pace==='Behind'?' hot':'')}><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg></span><b className={pace==='Behind'?'bad':'good'}>{pace}</b><span className="cl">finish {fmtD(u.endSlot)}</span></div>
              </div>
            </div>
            <div className="wsfield"><label>Summary</label><TA v={u.summary} set={v=>edU({summary:v})} ph={'How this '+DS.label('unit',false).toLowerCase()+' develops — the arc from exploration to independent transfer, and what it builds toward.'}/></div>
            <div className="wsover-cards">
              <div className="wsobox eqbox"><div className="wsobox-h"><span className="hic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.7.7-1 1.3-1 2.5H9c0-1.2-.3-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg></span>Big ideas · Essential questions</div>
                {eqs.map((qq,i)=><div key={i} className="wseqrow"><span className="bul">•</span>
                  <input value={qq} placeholder="An essential question…" onChange={e=>{ const a=eqs.slice(); a[i]=e.target.value; setEqs(a); }}/>
                  <button title="Remove" onClick={()=>setEqs(eqs.filter((_,j)=>j!==i))}>×</button></div>)}
                <button className="wseqadd" onClick={()=>setEqs([...eqs,''])}>+ Add question</button>
              </div>
              <div className="wsobox vocbox"><div className="wsobox-h"><span className="hic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h11v15H4zM15 5h5v15h-5"/><path d="M7 9h5M7 12h5"/></svg></span>Unit vocabulary</div>
                <div className="wsvocab">{(u.vocab||[]).map((v,i)=><span key={i} className="vchip">{v}<button title="Remove" onClick={()=>edU({vocab:(u.vocab||[]).filter((_,j)=>j!==i)})}>×</button></span>)}
                  {!(u.vocab||[]).length && <span className="mut">No terms yet.</span>}</div>
                <input className="wsvocadd" value={vocDraft} placeholder="Add a term, press Enter" onChange={e=>setVocDraft(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&vocDraft.trim()){ edU({vocab:[...(u.vocab||[]),vocDraft.trim()]}); setVocDraft(''); } }}/>
              </div>
            </div>
            <div className="wsarc-strip"><div className="wsarc-h">Instructional sequence</div><div className="wsarc-row">{arcPhases.map((p,i)=><React.Fragment key={i}>{i>0&&<span className="wsap-link"></span>}
              <div className={'wsap'+(i<arcDone?' done':'')} style={{'--uc':cv(s.c)}}><span className="ck">{i<arcDone?'✓':i+1}</span><span className="lb">{p}</span></div></React.Fragment>)}</div></div>
            <div className="wsfield"><label>{DS.label('unit',false)} name</label><input className="wsin big" value={u.name} onChange={e=>edU({name:e.target.value})}/></div>
            <div className="wsfield"><label>Planning framework</label><div className="ro big">{(window.FW&&window.FW.get)?window.FW.get(u.fw).name:(u.fw||'Universal spine')+''}</div></div>
            <div className="wsfield"><label>{DS.label('unit',false)} notes</label><TA v={u.notes} set={v=>edU({notes:v})} ph="Anything the whole unit should remember."/></div>
          </div>}
          {upSec==='s1' && <div className="wsdoc">
            {(()=>{ const kl=((window.FW&&window.FW.get)?window.FW.get(u.fw).kudLabels:null)||['Know','Understand','Do'];
              return [['know',kl[0]],['understand',kl[1]],['doGoal',kl[2]]]; })().map(([k,lab2])=><div key={k} className="wsfield"><label>{lab2}</label>
              <TA v={u[k]} set={v=>edU({[k]:v})} ph={k==='know'?'Facts + vocabulary students will know…':k==='understand'?'Big ideas students will understand…':'What students will be able to do…'}/></div>)}
            <div className="wsfield"><label>Standards</label>
              {(u.stds||[]).length?(u.stds||[]).map((st,i)=><div key={i} className="wsstd"><b>{Array.isArray(st)?st[0]:st}</b>{Array.isArray(st)&&st[1]?<span>{st[1]}</span>:null}</div>):<p className="mut">None yet.</p>}</div>
            {(u.vocab||[]).length>0 && <div className="wsfield"><label>Vocabulary</label><div className="wschips">{u.vocab.map(v=><i key={v}>{v}</i>)}</div></div>}
          </div>}
          {upSec==='s2' && <div className="wsdoc">
            <div className="wsfield"><label>Evidence of learning</label>
              <p>{aL.filter(x=>x.assessment==='formative').length} formative check{aL.filter(x=>x.assessment==='formative').length===1?'':'s'} · {aL.filter(x=>x.assessment==='summative').length} summative</p>
              <button className="wsd-open" onClick={()=>setTab('assessments')}>View assessments</button></div>
          </div>}
          {upSec==='s3' && <div className="wsdoc">
            <div className="wsfield"><label>Learning plan</label><p>{L.length} {lessonWord(L.length)} · {fmtD(u.startSlot)} – {fmtD(u.endSlot)}</p></div>
            <div className="wsfield"><label>Default flow for new {lessonWord(2)}</label>
              <select className="wssel" value={u.defaultFlow||''} onChange={e=>edU({defaultFlow:e.target.value||null})}>
                <option value="">None</option>
                {PW.FLOW_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.flows.map(f=><option key={f}>{f}</option>)}</optgroup>)}
              </select></div>
            <button className="wsd-open" onClick={()=>setTab('lessons')}>Open {DS.label('lesson',true).toLowerCase()}</button>
          </div>}
          {upSec==='design' && <div className="wsdoc wide">
            {window.PHDesign?<window.PHDesign state={state} u={u} dated={dated} settings={window.__phSettings||{}} actions={actions}/>:<p className="mut">Framework designer unavailable.</p>}
          </div>}
        </div>}
      </main>
    </div>
    <footer className="ph-wsf">
      <button className="wsf-btn" title={'Print this '+DS.label('unit',false).toLowerCase()+' plan'} onClick={doPrint}>⎙ Print</button>
      <span className="grow"></span>
      {nextTeach && <button className="wsf-btn pri" title={'Open the next untaught '+DS.label('lesson',false).toLowerCase()} onClick={teachNext}>▶ Teach next {DS.label('lesson',false).toLowerCase()}</button>}
    </footer>
    </div>
    {datePop && (()=>{ let dl=null,du=null; state.units.forEach(x=>x.lessons.forEach(y=>{ if(y.id===datePop.id){ dl=y; du=x; } }));
      if(!dl||!window.PHUnits.DatePop) return null; const di=du.lessons.indexOf(dl);
      return <window.PHUnits.DatePop info={datePop} l={dl} dated={dated} canStack={di>0||du.startSlot>0} actions={actions} onClose={()=>setDatePop(null)}/>; })()}
    {resPrev && (()=>{ const r=resPrev.r; const L2=Math.min(resPrev.x+16,(window.innerWidth||1200)-242); const T2=Math.min(resPrev.y+16,(window.innerHeight||800)-232);
      return <div className="ph-resprev" style={{left:L2+'px',top:T2+'px','--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}}>
        <div className="rp-head"><i>{r.type}</i><b>{r.name}</b></div>
        <div className="rp-body">{resThumb(r)}</div>
        <div className={'rp-foot'+(r.url?'':' muted')}>{r.url?'Click to open ↗':'No file linked yet — add a URL to preview'}</div>
      </div>; })()}
  </div>;
}
window.PHWorkspace=Workspace;
})();
