/* Planning Hub — missed-lesson logic + panel, per-unit resources, wall overlay.
   Exposes window.PHMore = { missedOf, isMissed, resourcesOf, MissedPanel, WallOverlay }. */
(function(){
const {useState}=React;
const {cv}=window.PWC;
const {I,SubjChip,KindTag}=window.PHC;
const PW=window.PW, DS=window.DS;

function missedOf(state){
  const out=[];
  state.units.forEach(u=>{ if(u.archived) return; u.lessons.forEach(l=>{
    if(l.slot<PW.TODAY_SLOT && PW.comp(l)<=2 && !l.cuHandled) out.push({l,u});
  }); });
  return out.sort((a,b)=>a.l.slot-b.l.slot);
}
const isMissed=(l)=>l.slot<PW.TODAY_SLOT && PW.comp(l)<=2 && !l.cuHandled;

function resourcesOf(u){
  const out=[];
  (u.resources||[]).forEach(r=>{
    out.push({id:r.id,type:r.type,c:DS.RESTYPES[r.type]||'--subj-11',name:r.name,l:null,u});
  });
  u.lessons.forEach(l=>(l.resources||[]).forEach(r=>{
    out.push({id:r.id,type:r.type,c:DS.RESTYPES[r.type]||'--subj-11',name:r.name,l,u});
  }));
  return out;
}

function MissedPanel({state,dated,actions,onOpenLesson,onClose}){
  const missed=missedOf(state);
  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className="ph-misspanel" data-screen-label="Hub — Missed lessons" role="dialog" aria-label="Missed lessons">
      <div className="ph-panel-h"><h3>Missed {DS.label('lesson',true).toLowerCase()}</h3><button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button></div>
      <p className="cap">These slipped past with barely a plan. <b>Bump</b> moves one to the next school day — everything after ripples forward automatically.</p>
      {missed.map(({l,u})=><div className="ph-cu-row" key={l.id}>
        <span className="when">{dated?l.date:('Day '+(l.slot+1))}</span>
        <div>
          <div className="t">{l.title}</div>
          <div className="m"><SubjChip sid={u.sid}/> · {u.name}</div>
        </div>
        <div className="ph-cu-acts">
          <button className="go" title="Move to the next school day — later lessons ripple" onClick={()=>actions.reschedule(l.id)}>Bump</button>
          <button title="Open it inside its unit" onClick={()=>onOpenLesson(u.id,l.id)}>Open</button>
          <button title="Let it go" onClick={()=>actions.skipCatchup(l.id)}>Skip</button>
        </div>
      </div>)}
      {missed.length===0 && <div className="ph-empty">All caught up. Nothing slipped through.</div>}
    </div>
  </React.Fragment>;
}

/* ════════ WALL OVERLAY — every resource on one wall: lesson, unit, or subject ════════ */
const SVP={fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round',viewBox:'0 0 24 24'};
const icMax=<svg {...SVP}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>;
const icMin=<svg {...SVP}><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>;

function WallOverlay({state,scope,dated,onOpenLesson,onClose}){
  const SW=PW.SWLEN;
  const [sc,setSc]=useState(scope);
  const [fs,setFs]=useState(!!scope.fs);
  const [view,setView]=useState('thumbs');
  const [group,setGroup]=useState(scope.kind==='unit'?'lesson':scope.kind==='subject'?'unit':'type');
  const [ft,setFt]=useState('all');
  const [q,setQ]=useState('');

  let title,sub,color,rows,units,groupOpts,parentUnit=null;
  if(sc.kind==='lesson'){
    const u=state.units.find(x=>x.id===sc.uid);
    const l=u&&u.lessons.find(x=>x.id===sc.lid);
    if(!u||!l) return null;
    const s=DS.SUBJECTS[u.sid]; parentUnit=u;
    title=l.title||'Untitled'; sub=s.full+' · '+u.name; color=cv(s.c);
    units=[u]; rows=resourcesOf(u).filter(r=>r.l&&r.l.id===l.id);
    groupOpts=[['type','By type']];
  } else if(sc.kind==='unit'){
    const u=state.units.find(x=>x.id===sc.id);
    if(!u) return null;
    const s=DS.SUBJECTS[u.sid];
    title=u.name; sub=s.full; color=cv(s.c);
    units=[u]; rows=resourcesOf(u);
    groupOpts=[['lesson','By lesson'],['week','By week'],['type','By type']];
  } else {
    const s=DS.SUBJECTS[sc.sid];
    title=s.full; sub='All '+DS.label('unit',true).toLowerCase(); color=cv(s.c);
    units=state.units.filter(x=>x.sid===sc.sid);
    const sm=(state.subjects||{})[sc.sid]||{};
    rows=[...((sm.resources||[]).map(r=>({id:r.id,type:r.type,c:DS.RESTYPES[r.type]||'--subj-11',name:r.name,l:null,u:null}))),
          ...units.flatMap(resourcesOf)];
    groupOpts=[['unit','By unit'],['week','By week'],['type','By type']];
  }
  const types=[...new Set(rows.map(r=>r.type))];
  const match=(r)=>(ft==='all'||r.type===ft)&&(!q||(r.name+' '+(r.l?r.l.title:'')+' '+r.type).toLowerCase().includes(q.toLowerCase()));
  const shown=rows.filter(match);

  const wkLbl=(w)=>{ const lo=w*SW, hi=Math.min(PW.SLOTS.length-1,lo+SW-1);
    return 'Week '+(w+1)+(dated?(' · '+PW.fmtSlot(lo)+' – '+PW.fmtSlot(hi)):''); };
  let groups=[];
  const unitLevel=shown.filter(r=>!r.l);
  if(group==='lesson'){
    if(unitLevel.length) groups.push({key:'unitlevel',label:'On the '+DS.label('unit',false).toLowerCase(),rows:unitLevel});
    units[0].lessons.forEach((l,i)=>{
      const g=shown.filter(r=>r.l&&r.l.id===l.id);
      if(g.length) groups.push({key:l.id,label:(i+1)+'. '+(l.title||'Untitled')+(dated?(' · '+l.date):''),rows:g});
    });
  } else if(group==='unit'){
    const sl=shown.filter(r=>!r.u);
    if(sl.length) groups.push({key:'subjlevel',label:'On the '+DS.label('subject',false).toLowerCase(),rows:sl});
    units.forEach(u=>{
      const g=shown.filter(r=>r.u&&r.u.id===u.id);
      if(g.length) groups.push({key:u.id,label:u.name,rows:g});
    });
  } else if(group==='week'){
    const m=new Map();
    shown.forEach(r=>{ const w=r.l?Math.floor(r.l.slot/SW):-1; if(!m.has(w)) m.set(w,[]); m.get(w).push(r); });
    groups=[...m.entries()].sort((a,b)=>a[0]-b[0]).map(([w,g])=>({key:'w'+w,label:w<0?('Pinned — not on a '+DS.label('lesson',false).toLowerCase()):wkLbl(w),rows:g}));
  } else {
    types.forEach(t=>{
      const g=shown.filter(r=>r.type===t);
      if(g.length) groups.push({key:t,label:t,rows:g});
    });
  }

  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className={'ph-misspanel ph-wallpop'+(fs?' fs':'')} data-screen-label="Hub — Resource wall" role="dialog" aria-label="Resource wall">
      <div className="ph-panel-h">
        <h3><span className="fdot" style={{background:color}}></span>{title} <KindTag level={sc.kind}/> <span className="fu">· {sub} · {rows.length} {rows.length===1?'resource':'resources'}</span></h3>
        <div className="ph-panel-acts">
          {sc.kind==='lesson' && parentUnit && <button className="ph-wallscope" title={'Widen to every resource in '+parentUnit.name}
            onClick={()=>{ setSc({kind:'unit',id:parentUnit.id}); setGroup('lesson'); }}>Whole {DS.label('unit',false).toLowerCase()} {I.chevR}</button>}
          <button className="ph-panel-x" title={fs?'Exit full screen':'Full screen — the whole wall, edge to edge'} onClick={()=>setFs(!fs)}>{fs?icMin:icMax}</button>
          <button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button>
        </div>
      </div>
      <p className="cap">Collected automatically from every {DS.label('lesson',false).toLowerCase()}. Click a card to open its {DS.label('lesson',false).toLowerCase()} — attach more from any {DS.label('lesson',false).toLowerCase()}'s editor.</p>
      <div className="ph-walltools">
        <span className="ph-wallsearch">{I.search}<input value={q} placeholder="Search this wall…" onChange={e=>setQ(e.target.value)}/></span>
        <div className="ph-seg" role="group" aria-label="Wall view">
          <button className={view==='pills'?'on':''} title="Compact pills — more per screen" onClick={()=>setView('pills')}>Pills</button>
          <button className={view==='thumbs'?'on':''} title="Thumbnail cards" onClick={()=>setView('thumbs')}>Thumbnails</button>
        </div>
        {groupOpts.length>1 && <div className="ph-seg" role="group" aria-label="Group wall by">
          {groupOpts.map(([k,lab])=><button key={k} className={group===k?'on':''} onClick={()=>setGroup(k)}>{lab}</button>)}
        </div>}
      </div>
      {types.length>1 && <div className="ph-walltypes">
        <button className={'ph-typechip'+(ft==='all'?' on':'')} style={{'--rc':'var(--faint)'}} onClick={()=>setFt('all')}>All</button>
        {types.map(t=><button key={t} className={'ph-typechip'+(ft===t?' on':'')} style={{'--rc':cv(DS.RESTYPES[t]||'--subj-11')}}
          onClick={()=>setFt(ft===t?'all':t)}><i></i>{t}</button>)}
      </div>}
      {groups.map(g=><section key={g.key} className="ph-wallgroup">
        <div className="gh"><span>{g.label}</span><span className="n">{g.rows.length}</span></div>
        {view==='pills'
          ? <div className="ph-wallpills">
            {g.rows.map(r=><button key={r.id} className="ph-wallpill" style={{'--rc':cv(r.c)}} title={r.type+(r.l?(' · from '+r.l.title+' — open the '+DS.label('lesson',false).toLowerCase()):r.u?(' · on the '+DS.label('unit',false).toLowerCase()+' — open it'):(' · on the '+DS.label('subject',false).toLowerCase()))}
              onClick={()=>{ if(r.u) onOpenLesson(r.u.id,r.l?r.l.id:null); }}>
              <i>{r.type}</i><span className="nm">{r.name}</span>
            </button>)}
          </div>
          : <div className="ph-resgrid">
            {g.rows.map(r=><button key={r.id} className="ph-rescard thumbed" style={{'--rc':cv(r.c)}} title={r.l?('From '+r.l.title+' — open the '+DS.label('lesson',false).toLowerCase()):r.u?('On the '+DS.label('unit',false).toLowerCase()+' — open it'):('On the '+DS.label('subject',false).toLowerCase())}
              onClick={()=>{ if(r.u) onOpenLesson(r.u.id,r.l?r.l.id:null); }}>
              <span className="thumb"><span className="ti">{I.box}</span><span className="rtype" style={{background:cv(r.c)}}>{r.type}</span></span>
              <span className="bd"><span className="rt">{r.name}</span><span className="rm">{r.l?(r.l.title+(dated?(' · '+r.l.date):'')):r.u?('On the '+DS.label('unit',false).toLowerCase()):('On the '+DS.label('subject',false).toLowerCase())}</span></span>
            </button>)}
          </div>}
      </section>)}
      {groups.length===0 && <div className="ph-empty">Nothing here yet — attach resources from any {DS.label('lesson',false).toLowerCase()}'s editor and they collect on this wall.</div>}
    </div>
  </React.Fragment>;
}

window.PHMore={ missedOf, isMissed, resourcesOf, MissedPanel, WallOverlay };
})();
