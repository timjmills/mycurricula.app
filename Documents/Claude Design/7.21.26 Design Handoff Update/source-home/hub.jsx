/* Planner Hub v2 — full-screen workspace shell (Frame B).
   Global top bar · document tabs · browse areas (Lessons · Units · Resources ·
   Catch-Up) · global search · recents · autosave. Documents render via window.HubPlanner.
   window.PlannerHub({ state, onClose, onPlan, onPost, onTeach, onUnit }) */
(function(){
const { useState, useEffect, useRef } = React;
const DS = window.DS;
const cv = (x)=> (typeof x==='string' && x.startsWith('--')) ? `var(${x})` : x;
const lj=(k,f)=>{ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(f)); }catch(e){ return f; } };
const sj=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };

const I = {
  glyph:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" fill="#fff"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5v-13Z" fill="#fff" opacity=".7"/></svg>,
  back:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  search:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  chev:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  clock:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  dots:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  gear:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 5 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H22a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/></svg>,
  grid:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></svg>,
  list:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>,
  teach:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4l14 8-14 8z" fill="currentColor"/></svg>,
};

function statusMeta(st){ return ({done:{label:'Done',tk:'--done',tint:'--done-tint'},now:{label:'In class now',tk:'--progress',tint:'--progress-tint'},upcoming:{label:'Upcoming',tk:'--idle',tint:'--idle-tint'},idle:{label:'Not started',tk:'--idle',tint:'--idle-tint'}})[st]||{label:'Not started',tk:'--idle',tint:'--idle-tint'}; }
function Badge({st,label}){ const m=statusMeta(st); return <span className="ph-badge" style={{background:cv(m.tint),color:cv(m.tk)}}>{label||m.label}</span>; }

/* generic dropdown menu */
function Menu({label,value,options,onPick}){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  const cur=options.find(o=>o[0]===value);
  return <span className="ph-menu" ref={ref}>
    <button className="ph-menubtn" onClick={()=>setOpen(o=>!o)}><span className="lbl">{label}</span><span className="val">{cur?cur[1]:''}</span>{I.chev}</button>
    {open && <div className="ph-menupop">{options.map(([k,l])=>(<button key={k} className={value===k?'on':''} onClick={()=>{onPick(k);setOpen(false);}}>{l}{value===k&&<span className="ck">{I.check}</span>}</button>))}</div>}
  </span>;
}
function RowMore({items}){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  return <span className="ph-menu" ref={ref} onClick={e=>e.stopPropagation()}>
    <button className="ph-rowmore" title="More" onClick={()=>setOpen(o=>!o)}>{I.dots}</button>
    {open && <div className="ph-menupop" style={{right:0,left:'auto'}}>{items.map((it,i)=> it.div?<div key={i} style={{height:1,background:'var(--ph-hairline)',margin:'5px 0'}}/>:<button key={i} onClick={()=>{setOpen(false);it.fn&&it.fn();}} style={it.danger?{color:'var(--danger)'}:undefined}>{it.label}</button>)}</div>}
  </span>;
}

const FRAMES=[['A','Glass'],['B','Bright'],['C','Pastel']];
const BGS=[['ambient','Wash'],['photo','Photo']];
const HUB_PHOTOS=['photos/p1.png','photos/p2.png','photos/p3.png','photos/p4.png','photos/p5.png'];
const THEMES=[['normal','#FFFFFF'],['night','#23263a'],['honey','#E59A12'],['blossom','#E8629C'],['mint','#1FA06B'],['sky','#2E86D8'],['hero','#9C6BDE']];
function Appearance({appr,setAppr,reset}){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  // Adapt the hub's appr state to the shared AppearanceControls (t / setTweak) shape.
  const K={version:'frame',bgMode:'bg',glass:'glass',theme:'theme',bgDim:'dim',photoMotion:'motion',photoSel:'photoSel'};
  const tA={ version:appr.frame, theme:appr.theme, bgMode:appr.bg, glass:appr.glass||'dark', bgDim:appr.dim||'normal', photoMotion:appr.motion||'fade-zoom', photoSel:appr.photoSel };
  const setTweakA=(k,v)=>setAppr(a=>({...a,[K[k]||k]:v}));
  const AC=window.AppearanceControls;
  return <span className="ph-appr" ref={ref}>
    <button className="ph-iconbtn" title="Appearance — frame, glass, theme & background" onClick={()=>setOpen(o=>!o)}>{I.gear}</button>
    {open && <div className="ph-apprpop ph-apprpop-full">
      {AC ? <AC t={tA} setTweak={setTweakA} /> :
        <div className="ph-apprrow"><div className="ph-apprlbl">Frame</div><div className="ph-apprseg">{FRAMES.map(([k,l])=><button key={k} className={appr.frame===k?'on':''} onClick={()=>setAppr(a=>({...a,frame:k}))}>{l}</button>)}</div></div>}
      <button className="ph-apprreset" onClick={reset}>Reset to app default</button>
    </div>}
  </span>;
}

const PRESETS=['Current Lesson',"Today's Lessons (Mixed)",'This Week · Mixed','This Week · Subject','Subject View','Unit View'];
const WALLC=['--subj-1','--subj-2','--subj-3','--subj-4','--subj-5','--subj-6','--subj-7','--subj-8','--subj-9','--subj-10','--subj-11','--subj-12','--subj-13','--subj-14','--subj-15','--brand-500'];

function PlannerHub({ state, onClose, onPlan, onPost, onTeach, onUnit }){
  const [docs,setDocs]=useState([]);            // open documents [{key,kind,ctx,title,sid}]
  const [active,setActive]=useState('browse');  // 'browse' | doc.key
  const [area,setArea]=useState('lessons');     // browse area
  const [q,setQ]=useState('');
  const [recents,setRecents]=useState(()=>lj('cc_hubrecents',[]));
  const [mode,setMode]=useState('personal');
  const [save,setSave]=useState('saved');        // saved | saving
  const [recentOpen,setRecentOpen]=useState(false);
  const [toast,setToast]=useState(null);
  const saveT=useRef(null);
  // appearance — frame / theme / background. Defaults to the app's current look; gear overrides.
  const readApp=()=>{ const h=document.querySelector('.home'); const d=h?h.dataset:{}; return { frame:(d.version||'B'), theme:(d.theme&&d.theme!=='off')?d.theme:'normal', bg:(d.bg||'ambient'), glass:(d.glass||'dark'), photo:'photos/p3.png' }; };
  const [appr,setAppr]=useState(readApp);
  // Frosted-glass register is SURFACE-ONLY — it must not wash the background.
  // Tone is driven purely by theme + background (Calm Glass on photo stays dark).
  const tone = appr.theme==='night' ? 'dark' : (appr.bg==='photo' && appr.frame==='A') ? 'dark' : 'light';
  // Lesson explorer toolbar
  const [timeScale,setTimeScale]=useState('week');
  const [groupBy,setGroupBy]=useState('time');
  const [statusFilter,setStatusFilter]=useState('all');
  // Unit explorer
  const [collapsed,setCollapsed]=useState({});
  const [unitSort,setUnitSort]=useState('sequence');
  // Resources
  const [resLayout,setResLayout]=useState('grid');
  const [resFilter,setResFilter]=useState('all');
  // Catch-Up
  const [bulk,setBulk]=useState({});
  const [sel,setSel]=useState(0);
  const [cuWindow,setCuWindow]=useState('week');
  const [cuGroup,setCuGroup]=useState('subject');

  const markEdited=()=>{ setSave('saving'); clearTimeout(saveT.current); saveT.current=setTimeout(()=>setSave('saved'),800); };

  const pushRecent=(it)=>{ const r=[it,...recents.filter(x=>x.key!==it.key)].slice(0,10); setRecents(r); sj('cc_hubrecents',r); };
  const unitProg=(sid,uname)=>{ const m=(DS.ROADMAP[sid]||[]).find(x=>x[0]===uname); return m?m[1]:0.5; };

  const openUnit=(u)=>{ const sid=u.sid||u.subjectId, uname=u.uname||u.unit, prog=(u.prog!=null?u.prog:unitProg(sid,uname)); const key='U:'+sid+uname;
    setDocs(d=> d.find(x=>x.key===key)?d:[...d,{key,kind:'unit',ctx:{sid,uname,prog},title:uname,sid}]);
    setActive(key); pushRecent({key,kind:'unit',title:uname,sub:DS.SUBJECTS[sid].full,sid}); };
  const openLesson=(L,ctx)=>{ const sid=L.subjectId, uname=(ctx&&ctx.uname)||L.unit, prog=(ctx&&ctx.prog!=null?ctx.prog:unitProg(sid,uname)); const key='L:'+L.id;
    const lc={sid,uname,prog,lesson:L};
    setDocs(d=> d.find(x=>x.key===key)?d.map(x=>x.key===key?{...x,ctx:lc}:x):[...d,{key,kind:'lesson',ctx:lc,title:L.title,sid}]);
    setActive(key); pushRecent({key,kind:'lesson',title:L.title,sub:DS.SUBJECTS[sid].full+' · '+uname,sid}); };
  const wallSections=(wname,anchor)=>{
    const td=state.days[state.todayIdx]||state.days[0];
    const cur=state.current||state.next||(td.lessons[0]);
    const n=((wname||'')+' '+(anchor||'')).toLowerCase();
    let ls=[];
    if(/current/.test(n)) ls=[cur];
    else if(/today/.test(n)) ls=td.lessons.slice(0,5);
    else if(/week/.test(n)){ state.days.forEach(d=>d.lessons.forEach(l=>ls.push(l))); ls=ls.slice(0,6); }
    else if(/subject/.test(n)){ DS.SUBJECT_ORDER.forEach(sid=>{ const l=td.lessons.find(x=>x.subjectId===sid); if(l) ls.push(l); }); }
    else if(/unit/.test(n)){ const seen={}; td.lessons.forEach(l=>{ if(!seen[l.unit]){ seen[l.unit]=1; ls.push(l); } }); }
    else ls=td.lessons.slice(0,4);
    return ls.map(l=>({title:l.title, sid:l.subjectId, unit:l.unit, lesson:l, items:DS.resourcesFor(l)}));
  };
  const openWall=(w)=>{ const key='W:'+w.id; const sections=wallSections(w.name,w.anchor); const sid=sections[0]?sections[0].sid:'reading';
    setDocs(d=> d.find(x=>x.key===key)?d:[...d,{key,kind:'wall',title:w.name,sid,ctx:{wall:w,sections}}]);
    setActive(key); pushRecent({key,kind:'wall',title:w.name,sub:(w.kind||'Wall')+' · '+sections.length+' sections',sid}); };
  const closeDoc=(key)=>{ setDocs(d=>{ const i=d.findIndex(x=>x.key===key); const nd=d.filter(x=>x.key!==key);
    setActive(a=> a===key ? (nd[i-1]?nd[i-1].key:(nd[0]?nd[0].key:'browse')) : a); return nd; }); };
  const openRecent=(r)=>{ if(r.kind==='unit') openUnit({sid:r.sid,uname:r.title}); else if(r.kind==='wall') openWall({id:r.key.slice(2),name:r.title,anchor:''}); else { const L=allLessons.find(l=>l.id===r.key.slice(2)); if(L) openLesson(L); } setRecentOpen(false); };
  const goTeach=(L)=>{ onTeach&&onTeach(L); };
  const goPost=(L)=>{ onPost&&onPost(L); };

  const back=()=>{ if(q){ setQ(''); return; } if(active!=='browse'){ setActive('browse'); return; } onClose(); };
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape'){ back(); } }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); });

  const allLessons=[]; state.days.forEach(d=>d.lessons.forEach(l=>allLessons.push({...l}))); 
  const units=[]; DS.SUBJECT_ORDER.forEach(sid=>(DS.ROADMAP[sid]||[]).forEach(([uname,prog],i)=>units.push({sid,uname,prog,no:i+1})));
  const walls=lj('cc_customwalls',[]);
  const cu=DS.catchUp().lessons.filter(l=>l.overdue);

  // ---------- global search ----------
  const sv=q.trim().toLowerCase();
  const results = sv ? {
    lessons: allLessons.filter(l=>(l.title+l.unit+DS.SUBJECTS[l.subjectId].full).toLowerCase().includes(sv)).slice(0,8),
    units: units.filter(u=>(u.uname+DS.SUBJECTS[u.sid].full).toLowerCase().includes(sv)).slice(0,6),
    walls: walls.filter(w=>(w.name||'').toLowerCase().includes(sv)).slice(0,6),
  } : null;

  const activeDoc = docs.find(d=>d.key===active);

  // ===================== BROWSE: LESSON EXPLORER =====================
  function LessonExplorer(){
    let pool = timeScale==='day' ? [state.days[state.todayIdx]] : state.days;
    let rows=[]; pool.forEach(d=>d.lessons.forEach(l=>rows.push({...l, _day:d})));
    if(statusFilter!=='all') rows=rows.filter(l=>l.status===statusFilter);
    // build groups
    let groups=[];
    if(groupBy==='time'){ pool.forEach(d=>{ const ls=rows.filter(l=>l._day.key===d.key).sort((a,b)=>a.periodIdx-b.periodIdx); if(ls.length) groups.push({label:d.name+' · '+d.date, ls}); }); }
    else if(groupBy==='subject'){ DS.SUBJECT_ORDER.forEach(sid=>{ const ls=rows.filter(l=>l.subjectId===sid); if(ls.length) groups.push({label:DS.SUBJECTS[sid].full, ls, sid}); }); }
    else if(groupBy==='unit'){ const seen={}; rows.forEach(l=>{ (seen[l.unit]=seen[l.unit]||[]).push(l); }); Object.keys(seen).forEach(u=>groups.push({label:u, ls:seen[u]})); }
    else { ['now','upcoming','done','idle'].forEach(st=>{ const ls=rows.filter(l=>l.status===st); if(ls.length) groups.push({label:statusMeta(st).label, ls}); }); }
    return <React.Fragment>
      <div className="ph-toolbar">
        <div className="ph-seg">{[['day','Day'],['week','Week'],['month','Month']].map(([k,l])=><button key={k} className={timeScale===k?'on':''} onClick={()=>setTimeScale(k)}>{l}</button>)}</div>
        <Menu label="Group" value={groupBy} options={[['time','Time'],['subject','Subject'],['unit','Unit'],['status','Status']]} onPick={setGroupBy}/>
        <Menu label="Status" value={statusFilter} options={[['all','All'],['now','In class'],['upcoming','Upcoming'],['done','Done'],['idle','Not started']]} onPick={setStatusFilter}/>
      </div>
      {groups.length? groups.map((g,gi)=>(
        <div className="ph-list" key={gi} style={{marginBottom:16, ...(g.sid?{'--gc':cv(DS.SUBJECTS[g.sid].c)}:{})}}>
          <div className="ph-grouphead">{g.sid && <span className="ph-gdot" style={{background:cv(DS.SUBJECTS[g.sid].c)}}/>}{g.label}<span className="meta">{g.ls.length} {DS.label('lesson',g.ls.length!==1).toLowerCase()}</span></div>
          {g.ls.map(l=>{ const s=DS.SUBJECTS[l.subjectId]; return (
            <div className="ph-row" key={l.id} style={{borderLeftColor:cv(s.c),'--rc':cv(s.c)}} onClick={()=>openLesson(l)}>
              <span className="time">{DS.fmt(l.start)}</span>
              <div className="main"><div className="t">{l.title}</div><div className="m"><span className="ph-tag"><span className="d" style={{background:cv(s.c)}}/>{s.label}</span><span className="sep">·</span>{l.unit}</div></div>
              <Badge st={l.status}/>
              <div className="acts">
                <button className="ph-btn ghost sm" onClick={e=>{e.stopPropagation();openLesson(l);}}>Open</button>
                <RowMore items={[{label:'Teach',fn:()=>goTeach(l)},{label:'Resource wall',fn:()=>goPost(l)},{label:'Reschedule'},{label:'Duplicate'},{div:true},{label:'Archive',danger:true}]}/>
              </div>
            </div>
          ); })}
        </div>
      )) : <div className="ph-empty"><div className="ttl">Nothing here</div><div className="ds">No {DS.label('lesson',true).toLowerCase()} match this filter.</div></div>}
    </React.Fragment>;
  }

  // ===================== BROWSE: UNIT EXPLORER =====================
  function UnitExplorer(){
    return <React.Fragment>
      <div className="ph-toolbar">
        <Menu label="Sort" value={unitSort} options={[['sequence','Sequence'],['progress','Progress'],['name','Name']]} onPick={setUnitSort}/>
        <div className="grow"/>
        <span className="ph-tag" style={{color:'var(--ph-text-2)'}}>Color = subject</span>
      </div>
      {DS.SUBJECT_ORDER.map(sid=>{ const s=DS.SUBJECTS[sid]; let us=units.filter(u=>u.sid===sid);
        if(unitSort==='progress') us=[...us].sort((a,b)=>b.prog-a.prog); else if(unitSort==='name') us=[...us].sort((a,b)=>a.uname.localeCompare(b.uname));
        const done=us.filter(u=>u.prog>=1).length; const avg=Math.round(us.reduce((a,u)=>a+u.prog,0)/us.length*100);
        const col=collapsed[sid];
        return <div className="ph-section" key={sid}>
          <button className={'ph-sechead'+(col?' collapsed':'')} onClick={()=>setCollapsed(c=>({...c,[sid]:!c[sid]}))}>
            <span style={{width:16,height:16,display:'grid',placeItems:'center'}} className="chev">{I.chev}</span>
            <span className="d" style={{background:cv(s.c)}}/><span className="nm">{s.full}</span>
            <span className="miniprog"><i style={{width:avg+'%',background:cv(s.c)}}/></span>
            <span className="sub">{done}/{us.length} complete · {avg}%</span>
          </button>
          {!col && <div className="ph-unitgrid">
            {us.map(u=>{ const complete=u.prog>=1, future=u.prog===0;
              return <button key={u.uname} className={'ph-unitcard'+(complete?' complete':'')+(future?' future':'')} style={{'--uc':cv(s.c)}} onClick={()=>openUnit(u)}>
                <div className="ph-unit-top"><span className="ph-unit-no">{DS.label('unit').toUpperCase()} {u.no}</span>{complete?<span style={{marginLeft:'auto',color:'var(--done)',width:15,height:15}}>{I.check}</span>:future?<span style={{marginLeft:'auto'}}><Badge st="idle" label="Not started"/></span>:<span style={{marginLeft:'auto'}}><Badge st="now" label="Current"/></span>}</div>
                <div className="ph-unit-name">{u.uname}</div>
                <div className="ph-unit-prog"><span className="ph-unit-bar"><i style={{width:(u.prog*100)+'%'}}/></span><span className="ph-unit-pct">{Math.round(u.prog*100)}%</span></div>
              </button>; })}
          </div>}
        </div>;
      })}
    </React.Fragment>;
  }

  // ===================== BROWSE: RESOURCES =====================
  function Resources(){
    const items=[
      ...PRESETS.map(p=>({id:'p:'+p,name:p,kind:'Preset',sections:6,count:14,anchor:'Current lesson',shared:false})),
      ...walls.map(w=>({id:w.id,name:w.name,kind:'Custom',sections:w.secCount||(w.isSection?1:3),count:(w.secCount||3)*2,anchor:w.anchor||'Custom',shared:!!w.forkedFrom})),
    ];
    let fil=items;
    if(resFilter==='preset') fil=items.filter(i=>i.kind==='Preset');
    else if(resFilter==='custom') fil=items.filter(i=>i.kind==='Custom');
    else if(resFilter==='shared') fil=items.filter(i=>i.shared);
    return <React.Fragment>
      <div className="ph-toolbar">
        <div className="ph-chips">{[['all','All'],['preset','Presets'],['custom','Custom'],['shared','Shared']].map(([k,l])=><button key={k} className="ph-chip" style={resFilter===k?{background:'var(--accent-50)',color:'var(--accent)'}:undefined} onClick={()=>setResFilter(k)}>{l}</button>)}</div>
        <div className="grow"/>
        <div className="ph-seg">
          <button className={resLayout==='grid'?'on':''} title="Grid" onClick={()=>setResLayout('grid')}>{I.grid}</button>
          <button className={resLayout==='list'?'on':''} title="List" onClick={()=>setResLayout('list')}>{I.list}</button>
        </div>
      </div>
      <div className={'ph-wallgrid'+(resLayout==='list'?' list':'')}>
        {fil.map((w,i)=>(<button key={w.id} className="ph-wall" style={{'--wc':cv(WALLC[i%WALLC.length])}} onClick={()=>openWall(w)}>
          <span className="ph-wallprev"><span className="mini"/><span className="mini"/><span className="mini"/><span className="ph-wallprevname">{w.name}</span></span>
          <span className="ph-wallbody">
            <span className="ph-wallkind">{w.kind} · {w.anchor}</span>
            <span className="ph-wallmeta">{w.sections} sections · {w.count} resources{w.shared?' · Shared':''}</span>
          </span>
        </button>))}
      </div>
    </React.Fragment>;
  }

  // ===================== BROWSE: CATCH-UP =====================
  function CatchUp(){
    const bulkIds=Object.keys(bulk).filter(k=>bulk[k]);
    // window = how far the catch-up net is cast; group = how rows are clustered
    const cap={day:5,week:12,'2w':20,month:cu.length,unit:cu.length,subject:cu.length}[cuWindow]||cu.length;
    const list=cu.slice(0,cap);
    let groups=[];
    if(cuGroup==='unit'){ const seen={}; list.forEach(l=>{ (seen[l.unit]=seen[l.unit]||[]).push(l); }); Object.keys(seen).forEach(u=>{ const sid=seen[u][0].subjectId; groups.push({key:u,label:u,sub:DS.SUBJECTS[sid].label,dot:DS.SUBJECTS[sid].c,ls:seen[u]}); }); }
    else { DS.SUBJECT_ORDER.forEach(sid=>{ const ls=list.filter(l=>l.subjectId===sid); if(ls.length) groups.push({key:sid,label:DS.SUBJECTS[sid].full,dot:DS.SUBJECTS[sid].c,ls}); }); }
    return <React.Fragment>
      <div className="ph-toolbar">
        <div className="ph-seg">{[['day','Day'],['week','Week'],['2w','2 weeks'],['month','Month']].map(([k,l])=><button key={k} className={cuWindow===k?'on':''} onClick={()=>setCuWindow(k)}>{l}</button>)}</div>
        <Menu label="Group" value={cuGroup} options={[['subject','Subject'],['unit','Unit']]} onPick={setCuGroup}/>
        <div className="grow"/>
        <span className="ph-tag" style={{color:'var(--ph-text-2)'}}>{list.length} behind · {cu.length} total</span>
      </div>
      {bulkIds.length>0 && <div className="ph-bulk"><span className="n">{bulkIds.length} selected</span>
        <button className="ph-btn ghost sm">Reschedule</button><button className="ph-btn ghost sm">Move to next week</button><button className="ph-btn ghost sm">Mark complete</button>
        <button className="ph-btn ghost sm" onClick={()=>setBulk({})}>Clear</button></div>}
      {groups.length? groups.map(g=>(
        <div className="ph-list" key={g.key} style={{marginBottom:16, '--gc': cv(g.dot)}}>
          <div className="ph-grouphead"><span className="d" style={{width:9,height:9,borderRadius:'50%',background:cv(g.dot)}}/>{g.label}{g.sub?<span className="ph-tag" style={{marginLeft:2}}>{g.sub}</span>:null}<span className="meta">{g.ls.length} behind</span></div>
          {g.ls.map((l,i)=>(
            <div className={'ph-row keepacts'+(bulk[l.id]?' sel':'')} key={l.id} style={{borderLeftColor:cv(DS.SUBJECTS[l.subjectId].c)}}>
              <input type="checkbox" className="ck" checked={!!bulk[l.id]} onClick={e=>e.stopPropagation()} onChange={e=>setBulk(b=>({...b,[l.id]:e.target.checked}))}/>
              <div className="main" onClick={()=>openLesson(l)} style={{cursor:'pointer'}}>
                <div className="t">{l.title}</div>
                <div className="m">{cuGroup==='unit'?<span className="ph-tag"><span className="d" style={{background:cv(DS.SUBJECTS[l.subjectId].c)}}/>{DS.SUBJECTS[l.subjectId].label}</span>:l.unit}<span className="sep">·</span><span style={{color:'var(--danger)',fontWeight:600}}>{l.reason||'Behind schedule'}</span>{i===0&&<React.Fragment><span className="sep">·</span>Blocks next {DS.label('lesson').toLowerCase()}</React.Fragment>}</div>
              </div>
              <div className="acts">
                <button className="ph-btn ghost sm">Reschedule</button>
                <button className="ph-btn ghost sm" onClick={e=>{e.stopPropagation();setBulk(b=>({...b,[l.id]:false}));}}>Mark complete</button>
                <RowMore items={[{label:'Open in planner',fn:()=>openLesson(l)},{label:'Teach',fn:()=>goTeach(l)},{label:'Move to next week'}]}/>
              </div>
            </div>
          ))}
        </div>
      )) : <div className="ph-empty"><div className="ttl">All caught up</div><div className="ds">No {DS.label('lesson',true).toLowerCase()} are behind schedule.</div></div>}
    </React.Fragment>;
  }

  // ---------- browse page wrapper ----------
  const AREAS=[['lessons',DS.label('lesson',true)],['units',DS.label('unit',true)],['resources','Resources'],['catchup','Catch-Up']];
  const pageMeta={
    lessons:{title:DS.label('lesson',true),sub:'Browse, plan and schedule your '+DS.label('lesson',true).toLowerCase()+'.',action:'New '+DS.label('lesson').toLowerCase()},
    units:{title:DS.label('unit',true),sub:'Your curriculum sequence and progress, by subject.',action:'New '+DS.label('unit').toLowerCase()},
    resources:{title:'Resources',sub:'Your Resource Walls — preset and custom collections.',action:'New wall'},
    catchup:{title:'Catch-Up',sub:'Lessons behind schedule, prioritised by urgency.',action:null},
  }[area];

  const browse = (
    <div className="ph-page">
      <div className="ph-pagehead">
      <div className="ph-crumb"><button onClick={()=>setArea('lessons')}>Planner</button><span className="sep">/</span><span className="cur">{pageMeta.title}</span></div>
      <div className="ph-titlerow">
        <div className="ph-title">{pageMeta.title}</div>
        {pageMeta.action && <button className="ph-btn primary" onClick={()=>{ if(area==='resources') goPost(); else setToast(pageMeta.action+' — coming soon'); }}>{I.plus}{pageMeta.action}</button>}
      </div>
      <div className="ph-sub">{pageMeta.sub}</div>
      <div className="ph-nav">
        {AREAS.map(([k,l])=>(<button key={k} className={'ph-navitem'+(area===k?' on':'')} onClick={()=>setArea(k)}>{l}{k==='catchup'&&cu.length?<span className="ph-navbadge">{cu.length}</span>:null}</button>))}
      </div>
      </div>
      {area==='lessons'&&<LessonExplorer/>}
      {area==='units'&&<UnitExplorer/>}
      {area==='resources'&&<Resources/>}
      {area==='catchup'&&<CatchUp/>}
    </div>
  );

  const searchView = results && (
    <div className="ph-page">
      <div className="ph-title" style={{fontSize:22,marginBottom:18}}>Results for “{q}”</div>
      {results.lessons.length>0 && <React.Fragment><div className="ph-srhead">{DS.label('lesson',true)}</div><div className="ph-list" style={{marginBottom:16}}>
        {results.lessons.map(l=>{ const s=DS.SUBJECTS[l.subjectId]; return <div className="ph-row" key={l.id} style={{borderLeftColor:cv(s.c),'--rc':cv(s.c)}} onClick={()=>{openLesson(l);setQ('');}}><div className="main"><div className="t">{l.title}</div><div className="m">{s.full}<span className="sep">·</span>{l.unit}</div></div><div className="acts"><button className="ph-btn ghost sm">Open</button></div></div>; })}
      </div></React.Fragment>}
      {results.units.length>0 && <React.Fragment><div className="ph-srhead">{DS.label('unit',true)}</div><div className="ph-list" style={{marginBottom:16}}>
        {results.units.map(u=>{ const s=DS.SUBJECTS[u.sid]; return <div className="ph-row" key={u.uname} style={{borderLeftColor:cv(s.c),'--rc':cv(s.c)}} onClick={()=>{openUnit(u);setQ('');}}><div className="main"><div className="t">{u.uname}</div><div className="m">{s.full}<span className="sep">·</span>{Math.round(u.prog*100)}%</div></div><div className="acts"><button className="ph-btn ghost sm">Open</button></div></div>; })}
      </div></React.Fragment>}
      {results.walls.length>0 && <React.Fragment><div className="ph-srhead">Walls</div><div className="ph-list">
        {results.walls.map(w=><div className="ph-row" key={w.id} onClick={()=>goPost()}><div className="main"><div className="t">{w.name}</div></div></div>)}
      </div></React.Fragment>}
      {!results.lessons.length&&!results.units.length&&!results.walls.length && <div className="ph-empty"><div className="ttl">No matches</div><div className="ds">Nothing found for “{q}”.</div></div>}
    </div>
  );

  return (
    <div className="ph-root" data-frame={appr.frame} data-theme={appr.theme} data-bg={appr.bg} data-glass={appr.glass||'dark'} data-dim={appr.dim||'normal'} data-motion={appr.motion||'fade-zoom'} data-tone={tone}>
      {appr.bg==='photo' ? <div className="ph-bg ph-photo" style={{backgroundImage:`url('${appr.photo||'photos/p3.png'}')`}}/> : <div className={'ph-bg ambient on drift t-'+appr.theme}/>}
      <div className="ph-veil"/>
      <div className="ph-shell">
      {/* GLOBAL top bar */}
      <div className="ph-top">
        <button className="ph-iconbtn ph-back" title="Back" onClick={back}>{I.back}</button>
        <button className="ph-ident" onClick={()=>{setActive('browse');setArea('lessons');}}>
          <span className="ph-glyph">{I.glyph}</span><span className="ph-wordmark">Planner</span>
        </button>
        <Appearance appr={appr} setAppr={setAppr} reset={()=>setAppr(readApp())}/>
        <div className="ph-spacer"/>
        <div className="ph-search collapsible">{I.search}<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search lessons, units, walls…"/>{q&&<button className="ph-clear" onClick={()=>setQ('')}>×</button>}</div>
        <div className="ph-modesw"><button className={mode==='personal'?'on':''} onClick={()=>setMode('personal')}>Personal</button><button className={'team '+(mode==='team'?'on':'')} onClick={()=>setMode('team')}>Team</button></div>
        <span className={'ph-saved'+(save==='saving'?' saving':'')}>{save==='saving'?null:I.check}{save==='saving'?'Saving…':'Saved just now'}</span>
        <span className="ph-recent">
          <button className="ph-iconbtn" title="Recent" onClick={()=>setRecentOpen(o=>!o)}>{I.clock}</button>
          {recentOpen && <div className="ph-recentpop" onMouseLeave={()=>setRecentOpen(false)}>
            <div className="h">Recently opened</div>
            {recents.length? recents.map(r=>{ const s=DS.SUBJECTS[r.sid]; return <button key={r.key} className="ph-recentrow" onClick={()=>openRecent(r)}><span className="rail" style={{background:cv(s.c)}}/><span><b>{r.title}</b><span>{r.sub}</span></span></button>; }) : <div className="ph-recent-empty">Nothing opened yet.</div>}
          </div>}
        </span>
      </div>

      {/* document tabs */}
      {docs.length>0 && <div className="ph-doctabs">
        <button className={'ph-doctab home'+(active==='browse'?' on':'')} onClick={()=>setActive('browse')}>Browse</button>
        {docs.map(d=>{ const s=DS.SUBJECTS[d.sid]; return <button key={d.key} className={'ph-doctab'+(active===d.key?' on':'')} onClick={()=>setActive(d.key)}>
          <span className="rail" style={{background:cv(s.c)}}/><span className="nm">{d.title}</span>
          <span className="x" onClick={e=>{e.stopPropagation();closeDoc(d.key);}}>{I.x}</span>
        </button>; })}
      </div>}

      {/* main scroll */}
      <div className="ph-scroll">
        {q ? searchView : activeDoc
          ? (activeDoc.kind==='lesson'
              ? <window.HubPlanner.Lesson ctx={activeDoc.ctx} markEdited={markEdited} onTeach={goTeach} onPost={goPost} onOpenUnit={(c)=>openUnit({sid:c.sid,uname:c.uname,prog:c.prog})} onOpenLesson={openLesson}/>
              : activeDoc.kind==='wall'
              ? <window.HubPlanner.Wall ctx={activeDoc.ctx} onPost={goPost} onTeach={goTeach} setToast={setToast}/>
              : <window.HubPlanner.Unit ctx={activeDoc.ctx} markEdited={markEdited} onTeach={goTeach} onPost={goPost} onOpenLesson={(l,c)=>openLesson(l,c)}/>)
          : browse}
      </div>
      </div>{/* /ph-shell */}

      {toast && <Toast msg={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}

function Toast({msg,onDone}){ useEffect(()=>{ const t=setTimeout(onDone,1900); return ()=>clearTimeout(t); },[]);
  return <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:60,background:'var(--ink)',color:'#fff',padding:'11px 20px',borderRadius:'var(--r-pill)',fontSize:13,fontWeight:600,boxShadow:'var(--sh-lg)'}}>{msg}</div>; }

window.PlannerHub = PlannerHub;
})();
