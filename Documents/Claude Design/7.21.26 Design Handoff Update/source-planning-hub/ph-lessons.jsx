/* Planning Hub — Lessons lens: every lesson as an editable row, organized by
   Subject / Unit / Schedule / Catch-up. Comfort rows = the unit-strip rows
   (inline editor + unit plan); Compact = one-liners that still expand.
   Exposes window.PHLessonsLens. */
(function(){
const {useState,useEffect}=React;
const {cv,Dots}=window.PWC;
const {I,SubjChip,KindTag}=window.PHC;
const PW=window.PW, DS=window.DS;

const stMatch=(l,f)=>f==='all'||(f==='ready'?PW.comp(l)>=4:f==='thin'?(l.status!=='taught'&&PW.comp(l)<=2):f==='taught'?l.status==='taught':l.status!=='taught');
const qMatch=(l,u,q)=>!q||(l.title+' '+l.objective+' '+u.name+' '+l.std).toLowerCase().includes(q.toLowerCase());
const DAYN=(iso)=>new Date(iso+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}).toUpperCase();

function scrollTo(idSel){
  const el=document.getElementById(idSel);
  if(el) document.scrollingElement.scrollTop += el.getBoundingClientRect().top - 180;
}

/* group header — sticky at the top level, with select-all / counts / pacing / open */
function GroupHead({lvl,color,title,sub,rows,sel,setSel,pace,onOpen,sticky,today,extra}){
  const ids=rows.map(r=>r.l.id);
  const allSel=ids.length>0&&ids.every(id=>sel.includes(id));
  const taught=rows.filter(r=>r.l.status==='taught').length;
  return <div className={'ph-ghead lvl-'+lvl+(sticky?' sticky':'')+(today?' today':'')}>
    <input type="checkbox" checked={allSel} title="Select every lesson in this group"
      onChange={()=>setSel(allSel?sel.filter(id=>!ids.includes(id)):[...new Set([...sel,...ids])])}/>
    {color && <span className="d" style={{background:color}}></span>}
    <b>{title}</b>
    {sub && <span className="su">{sub}</span>}
    <span className="ct">{taught}/{rows.length} taught</span>
    {pace && <span className={'ph-slack '+pace.cls}>{pace.label}</span>}
    <span className="grow"></span>
    {extra}
    {onOpen && <button className="op" title="Open this unit — Plan, Refine, Assessments" onClick={onOpen}>Open unit {I.chevR}</button>}
  </div>;
}

function CompactRow({l,u,idx,dated,onClick}){
  const s=DS.SUBJECTS[u.sid];
  const thin=l.status!=='taught'&&PW.comp(l)<=2;
  return <div className={'ph-lrow'+(l.status==='taught'?' past':'')} style={{'--lc':cv(s.c),'--lt':cv(s.tint)}}
    title="Open this lesson in its unit workspace" onClick={onClick}>
    <span className="time"><SubjChip sid={u.sid}/></span>
    <div className="main">
      <span className="t">{l.title||'Untitled lesson'}{l.modified && <em className="ph-modpill">Modified</em>}</span>
      <span className="meta">{(dated?(l.status==='today'?'Today':l.date):('#'+(idx+1)))} · {u.name}{l.std?(' · '+l.std):''}</span>
    </div>
    <Dots l={l}/>
    {l.status==='today' ? <span className="ph-status now">Today</span>
      : l.status==='taught' ? <span className="ph-status done">Taught</span>
      : thin ? <span className="ph-status thin">Needs work</span>
      : PW.comp(l)>=4 ? <span className="ph-status done">Ready</span>
      : <span className="ph-status plan">Planned</span>}
  </div>;
}

function LessonsLens({state,dated,query,org,statusF,density,sel,setSel,expanded,setExpanded,actions,onOpenUnit,onFocus,openWall}){
  const {LessonRow,Editor,InsertZone,DatePop}=window.PHUnits;
  const [datePop,setDatePop]=useState(null);
  const SW=PW.SWLEN;
  const unitsAll=state.units.filter(u=>!u.archived);
  const sids=[...new Set(unitsAll.map(u=>u.sid))];
  const vis=(l,u)=>stMatch(l,statusF)&&qMatch(l,u,query);
  const compact=density==='compact';

  useEffect(()=>{ if(org==='schedule') setTimeout(()=>scrollTo('ph-today-anchor'),60); },[org]);

  const paceOf=(u)=>{
    const pac=PW.pacing(u);
    if(pac.slack==null) return null;
    const ok=pac.slack>=0;
    return { cls:ok?'ok':'over',
      label: dated?(ok?(pac.slack+' days ahead'):(Math.abs(pac.slack)+' days behind'))
                  :(ok?(pac.slack+' lessons of room'):(Math.abs(pac.slack)+' over budget')) };
  };

  const renderRow=({l,u,idx})=>{
    if(compact) return <CompactRow key={l.id} l={l} u={u} idx={idx} dated={dated} onClick={()=>onFocus(u.id,l.id)}/>;
    return <LessonRow key={l.id} l={l} u={u} idx={idx} dated={dated} sel={sel} setSel={setSel}
      expanded={null} setExpanded={(id2)=>{ if(id2) onFocus(u.id,id2); }} actions={actions}
      onFocus={(lid)=>onFocus(u.id,lid)} openWall={openWall} openDatePop={setDatePop}
      unitTag={org==='schedule'} onOpenUnit={onOpenUnit}/>;
  };
  const rowsOf=(u)=>u.lessons.map((l,idx)=>({l,u,idx})).filter(({l})=>vis(l,u));

  /* one unit's rows, with insert zones in comfort density */
  const unitBlock=(u,rows)=>{
    if(compact) return <div className="ph-dayblock">{rows.map(renderRow)}</div>;
    return <div className="ph-rows">
      {rows.map((r)=><React.Fragment key={r.l.id}>
        <InsertZone onClick={()=>actions.insert(u.id,r.idx,(nid)=>onFocus(u.id,nid))}/>
        {renderRow(r)}
      </React.Fragment>)}
      <InsertZone onClick={()=>actions.insert(u.id,u.lessons.length,(nid)=>onFocus(u.id,nid))}/>
    </div>;
  };

  let body=null;

  if(org==='subject'){
    body=<React.Fragment>
      <div className="ph-subjindex">
        {sids.map(sid=>{ const s=DS.SUBJECTS[sid];
          const n=unitsAll.filter(u=>u.sid===sid).reduce((a,u)=>a+rowsOf(u).length,0);
          return <button key={sid} style={{'--c':cv(s.c)}} title={'Jump to '+s.full} onClick={()=>scrollTo('ph-g-'+sid)}>
            <i></i>{s.full}<em>{n}</em></button>; })}
      </div>
      {sids.map(sid=>{
        const s=DS.SUBJECTS[sid];
        const units=unitsAll.filter(u=>u.sid===sid);
        const all=units.flatMap(rowsOf);
        if(!all.length) return null;
        return <section key={sid} id={'ph-g-'+sid} className="ph-lgroup" data-screen-label={'Lessons — '+s.full}>
          <GroupHead lvl="subj" color={cv(s.c)} title={s.full} rows={all} sel={sel} setSel={setSel} sticky/>
          {units.map(u=>{
            const rows=rowsOf(u);
            if(!rows.length) return null;
            return <div key={u.id} className="ph-usub">
              <GroupHead lvl="unit" color={cv(s.c)} title={u.name}
                sub={dated?('ends '+PW.pacing(u).end):(u.lessons.length+' lessons')}
                rows={rows} sel={sel} setSel={setSel} pace={paceOf(u)} onOpen={()=>onOpenUnit(u.id)}/>
              {unitBlock(u,rows)}
            </div>;
          })}
        </section>;
      })}
    </React.Fragment>;
  }

  if(org==='unit'){
    body=unitsAll.map(u=>{
      const s=DS.SUBJECTS[u.sid];
      const rows=rowsOf(u);
      if(!rows.length) return null;
      return <section key={u.id} id={'ph-lg-'+u.id} className="ph-lgroup">
        <GroupHead lvl="unit" color={cv(s.c)} title={u.name} sub={s.full+(dated?(' · ends '+PW.pacing(u).end):'')}
          rows={rows} sel={sel} setSel={setSel} pace={paceOf(u)} onOpen={()=>onOpenUnit(u.id)} sticky/>
        {unitBlock(u,rows)}
      </section>;
    });
  }

  if(org==='schedule'){
    const all=[]; unitsAll.forEach(u=>u.lessons.forEach(l=>{ if(vis(l,u)) all.push({l,u,idx:u.lessons.indexOf(l)}); }));
    all.sort((a,b)=>a.l.slot-b.l.slot);
    const days=[]; all.forEach(r=>{ const g=days[days.length-1];
      if(!g||g.slot!==r.l.slot) days.push({slot:r.l.slot,rows:[r]}); else g.rows.push(r); });
    const anchorSlot=(days.find(d=>d.slot>=PW.TODAY_SLOT)||{}).slot;
    const dayLbl=(sl)=>{
      if(!dated) return 'Day '+(sl+1)+' · Week '+(Math.floor(sl/SW)+1);
      const d=PW.SLOTS[sl]; return DAYN(d.iso)+' · '+PW.fmtSlot(sl);
    };
    body=days.map(({slot,rows})=>{
      const isToday=slot===PW.TODAY_SLOT;
      return <section key={slot} id={slot===anchorSlot?'ph-today-anchor':undefined} className="ph-lgroup">
        <GroupHead lvl="day" title={dayLbl(slot)+(isToday?' · TODAY':'')} rows={rows} sel={sel} setSel={setSel} sticky today={isToday}
          extra={<label className="ph-dayadd" title="Add a lesson on this day — pick the subject; it lands in the unit running that day">
            {I.plus}
            <select value="" onChange={e=>{ const sid=e.target.value; if(!sid) return;
              actions.addAt(sid,slot,(uid,nid)=>onFocus(uid,nid)); e.target.value=''; }}>
              <option value="">Add here…</option>
              {sids.map(sid=><option key={sid} value={sid}>{DS.SUBJECTS[sid].full}</option>)}
            </select>
          </label>}/>
        {compact ? <div className="ph-dayblock">{rows.map(renderRow)}</div> : <div className="ph-rows">{rows.map(renderRow)}</div>}
      </section>;
    });
  }

  if(org==='catchup'){
    const missed=window.PHMore.missedOf(state).filter(({l,u})=>qMatch(l,u,query));
    body=<section className="ph-lgroup">
      <div className="ph-cuwrap" data-screen-label="Lessons — Catch-up">
        <div className="ph-cuhead">
          <b>{missed.length} missed {DS.label('lesson',missed.length!==1).toLowerCase()}</b>
          <span className="su">slipped past with barely a plan — bump them back into the flow</span>
          <span className="grow"></span>
          {missed.length>1 && <button className="ph-bumpall" title="Move every missed lesson to the next open school days — everything ripples forward"
            onClick={()=>missed.forEach(({l})=>actions.reschedule(l.id))}>Bump all to next open days</button>}
        </div>
        {missed.map(({l,u})=><div className="ph-cu-row" key={l.id}>
          <span className="when">{dated?l.date:('Day '+(l.slot+1))}</span>
          <div>
            <div className="t">{l.title}</div>
            <div className="m"><SubjChip sid={u.sid}/> · {u.name} · {PW.comp(l)}/5 planned</div>
          </div>
          <div className="ph-cu-acts">
            <button className="go" title="Move to the next school day — later lessons ripple" onClick={()=>actions.reschedule(l.id)}>Bump</button>
            <button title="Open it inside its unit workspace" onClick={()=>onFocus(u.id,l.id)}>Open</button>
            <button title="Let it go" onClick={()=>actions.skipCatchup(l.id)}>Skip</button>
          </div>
        </div>)}
        {missed.length===0 && <div className="ph-empty">All caught up. Nothing slipped through.</div>}
      </div>
    </section>;
  }

  const anyVisible = org==='catchup' || unitsAll.some(u=>rowsOf(u).length>0);
  return <div className="ph-listlens2" data-screen-label="Hub — Lessons">
    {body}
    {!anyVisible && <div className="ph-dayblock"><div className="ph-empty">Nothing matches — clear the search or the status filter.</div></div>}
    {datePop && (()=>{ let dl=null,du=null;
      state.units.forEach(u=>u.lessons.forEach(l=>{ if(l.id===datePop.id){ dl=l; du=u; } }));
      if(!dl) return null;
      const di=du.lessons.indexOf(dl);
      return <DatePop info={datePop} l={dl} dated={dated} canStack={di>0||du.startSlot>0} actions={actions} onClose={()=>setDatePop(null)}/>; })()}
  </div>;
}
window.PHLessonsLens=LessonsLens;
})();
